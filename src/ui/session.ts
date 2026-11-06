import { ApiError, deviceStart, devicePoll, loginWithKey, keysOf, type DeviceStart } from './api';

export type Store = { get<T>(k: string): Promise<T | undefined>; set(k: string, v: unknown): Promise<void>; remove(k: string): Promise<void> };
export type Auth = { apiKey: string; displayName: string; email: string; workspaceId?: string | null };
type SessionRow = { token: string; expiresAt: number };

const AUTH = 'pinsay:auth';
const SESSION = 'pinsay:session';
const KEYS = 'pinsay:keys';
const SESSION_MS = 11 * 60 * 60 * 1000; // the API's JWT lives 12 h; renew an hour early

export class Session {
  auth: Auth | null = null;
  keys: Record<string, string> = {};
  private token: string | null = null;
  private expiresAt = 0;
  constructor(private store: Store, private now: () => number = () => Date.now()) {}

  /** Loads stored credentials. True when signed in. */
  async load(): Promise<boolean> {
    this.auth = (await this.store.get<Auth>(AUTH)) ?? null;
    const k = await this.store.get<Record<string, string>>(KEYS);
    this.keys = k && typeof k === 'object' ? { ...k } : {};
    const s = await this.store.get<SessionRow>(SESSION);
    if (s && typeof s.token === 'string') { this.token = s.token; this.expiresAt = s.expiresAt; }
    return !!this.auth?.apiKey;
  }

  /** A valid JWT, renewed from the stored key when missing, expired, or `force`. Null = signed out (key revoked). */
  async getToken(force = false): Promise<string | null> {
    if (!this.auth) return null;
    if (!force && this.token && this.now() < this.expiresAt) return this.token;
    const t = await loginWithKey(this.auth.apiKey);
    if (!t) { await this.signOut(); return null; }
    this.token = t;
    this.expiresAt = this.now() + SESSION_MS;
    await this.store.set(SESSION, { token: t, expiresAt: this.expiresAt });
    return t;
  }

  /** Runs `fn` with a token; on a 401 renews once and retries. Throws ApiError(401) when signed out. */
  async withToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
    const t = await this.getToken();
    if (!t) throw new ApiError(401, 'signed-out');
    try {
      return await fn(t);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
      const t2 = await this.getToken(true);
      if (!t2) throw new ApiError(401, 'signed-out');
      return fn(t2);
    }
  }

  get workspaceId(): string | null { return this.auth?.workspaceId ?? null; }

  hasKey(workspaceId: string): boolean { return typeof this.keys[workspaceId] === 'string' && !!this.keys[workspaceId]; }

  /** After a device sign-in: the current workspace's auth plus every workspace key (replaces the stored ones). */
  async saveSignIn(a: Auth, keys: Record<string, string>): Promise<void> {
    this.keys = { ...keys };
    if (a.workspaceId && !this.keys[a.workspaceId]) this.keys[a.workspaceId] = a.apiKey;
    await this.store.set(KEYS, this.keys);
    await this.saveAuth(a);
  }

  /** Makes `workspaceId` current. False when there is no key for it (nothing changes). */
  async useWorkspace(workspaceId: string): Promise<boolean> {
    const key = this.keys[workspaceId];
    if (!this.auth || !key) return false;
    this.auth = { ...this.auth, apiKey: key, workspaceId };
    this.token = null; this.expiresAt = 0;
    await this.store.set(AUTH, this.auth);
    await this.store.remove(SESSION);
    return true;
  }

  /** Old stores have no workspace id: adopt the one the API reports as current for the key in use. */
  async adoptCurrent(workspaceId: string): Promise<void> {
    if (!this.auth || this.auth.workspaceId === workspaceId) return;
    this.auth = { ...this.auth, workspaceId };
    if (!this.keys[workspaceId]) this.keys[workspaceId] = this.auth.apiKey;
    await this.store.set(AUTH, this.auth);
    await this.store.set(KEYS, this.keys);
  }

  /** Forgets keys of workspaces the user no longer belongs to. */
  async pruneKeys(liveIds: string[]): Promise<void> {
    const live = new Set(liveIds);
    const next: Record<string, string> = {};
    for (const [id, k] of Object.entries(this.keys)) if (live.has(id)) next[id] = k;
    if (Object.keys(next).length === Object.keys(this.keys).length) return;
    this.keys = next;
    await this.store.set(KEYS, this.keys);
  }

  async signOut(): Promise<void> {
    this.auth = null; this.token = null; this.expiresAt = 0; this.keys = {};
    await this.store.remove(AUTH);
    await this.store.remove(SESSION);
    await this.store.remove(KEYS);
  }

  async saveAuth(a: Auth): Promise<void> {
    this.auth = a;
    await this.store.set(AUTH, a);
  }
}

export type SignInOutcome = 'approved' | 'denied' | 'expired' | 'cancelled' | 'error';

/**
 * RFC 8628 device sign-in. `onCode` shows the code; `isCancelled` is checked before every poll; `sleep` is injected
 * for tests.
 */
export async function signIn(
  session: Session,
  clientName: string,
  onCode: (s: DeviceStart) => void,
  isCancelled: () => boolean,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => number = () => Date.now(),
): Promise<SignInOutcome> {
  let start: DeviceStart;
  try { start = await deviceStart(clientName); } catch { return 'error'; }
  onCode(start);
  const deadline = now() + start.expiresInSeconds * 1000;
  const interval = Math.max(1, start.intervalSeconds) * 1000;
  while (now() < deadline) {
    await sleep(interval);
    if (isCancelled()) return 'cancelled';
    let p;
    try { p = await devicePoll(start.deviceCode); } catch (e) {
      if (e instanceof ApiError && e.status === 429) continue;
      return 'error';
    }
    if (p.status === 'pending') continue;
    if (p.status === 'approved' && p.apiKey) {
      const current = Array.isArray(p.workspaces) ? p.workspaces.find((w) => w && w.current === true) : undefined;
      await session.saveSignIn(
        { apiKey: p.apiKey, displayName: p.displayName ?? '', email: p.email ?? '', workspaceId: current?.workspaceId ?? null },
        keysOf(p.workspaces),
      );
      const t = await session.getToken(true);
      return t ? 'approved' : 'error';
    }
    if (p.status === 'denied') return 'denied';
    return 'expired';
  }
  return 'expired';
}
