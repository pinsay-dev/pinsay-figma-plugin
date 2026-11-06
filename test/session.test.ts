import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Session, signIn, type Store } from '../src/ui/session';
import { ApiError } from '../src/ui/api';

function createMemoryStore(): Store {
  const map = new Map<string, unknown>();
  return {
    async get<T>(k: string): Promise<T | undefined> {
      return (map.get(k) ?? undefined) as T | undefined;
    },
    async set(k: string, v: unknown): Promise<void> {
      map.set(k, v);
    },
    async remove(k: string): Promise<void> {
      map.delete(k);
    },
  };
}

describe('session & signIn', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('(a) signIn with polls pending, approved{apiKey:"pnsy_x"} and login-with-key -> "approved", store updated', async () => {
    const store = createMemoryStore();
    const session = new Session(store);

    let pollCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/device/start')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            deviceCode: 'dc1',
            userCode: 'uc1',
            verificationUrl: 'https://app.pinsay.dev/cli-login',
            expiresInSeconds: 60,
            intervalSeconds: 2,
          }),
        };
      }
      if (url.endsWith('/api/auth/device/poll')) {
        pollCount++;
        if (pollCount === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ status: 'pending' }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'approved',
            apiKey: 'pnsy_x',
            displayName: 'Alice',
            email: 'alice@example.com',
          }),
        };
      }
      if (url.endsWith('/api/auth/login-with-key')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', token: 'jwt1' }),
        };
      }
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const onCode = vi.fn();
    const result = await signIn(
      session,
      'PinSay for Figma',
      onCode,
      () => false,
      async () => {}, // no-op sleep
      () => 1000,
    );

    expect(result).toBe('approved');
    expect(onCode).toHaveBeenCalledWith(
      expect.objectContaining({ deviceCode: 'dc1', userCode: 'uc1' }),
    );
    const auth = await store.get<any>('pinsay:auth');
    expect(auth?.apiKey).toBe('pnsy_x');
    const sess = await store.get<any>('pinsay:session');
    expect(sess?.token).toBe('jwt1');
  });

  it('(b) denied -> "denied", nothing stored', async () => {
    const store = createMemoryStore();
    const session = new Session(store);

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/device/start')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            deviceCode: 'dc2',
            userCode: 'uc2',
            verificationUrl: 'https://app.pinsay.dev/cli-login',
            expiresInSeconds: 60,
            intervalSeconds: 2,
          }),
        };
      }
      if (url.endsWith('/api/auth/device/poll')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'denied' }),
        };
      }
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await signIn(
      session,
      'PinSay for Figma',
      () => {},
      () => false,
      async () => {},
      () => 1000,
    );

    expect(result).toBe('denied');
    expect(await store.get('pinsay:auth')).toBeUndefined();
    expect(await store.get('pinsay:session')).toBeUndefined();
  });

  it('(c) deadline passes -> "expired" (inject now)', async () => {
    const store = createMemoryStore();
    const session = new Session(store);

    let currentTime = 1000;
    const now = () => currentTime;
    const sleep = async (ms: number) => {
      currentTime += ms;
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/device/start')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            deviceCode: 'dc3',
            userCode: 'uc3',
            verificationUrl: 'https://app.pinsay.dev/cli-login',
            expiresInSeconds: 10,
            intervalSeconds: 5,
          }),
        };
      }
      if (url.endsWith('/api/auth/device/poll')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'pending' }),
        };
      }
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await signIn(
      session,
      'PinSay for Figma',
      () => {},
      () => false,
      sleep,
      now,
    );

    expect(result).toBe('expired');
  });

  it('(d) isCancelled() true -> "cancelled"', async () => {
    const store = createMemoryStore();
    const session = new Session(store);

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/device/start')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            deviceCode: 'dc4',
            userCode: 'uc4',
            verificationUrl: 'https://app.pinsay.dev/cli-login',
            expiresInSeconds: 60,
            intervalSeconds: 2,
          }),
        };
      }
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    let cancelled = false;
    const result = await signIn(
      session,
      'PinSay for Figma',
      () => {},
      () => cancelled,
      async () => {
        cancelled = true;
      },
      () => 1000,
    );

    expect(result).toBe('cancelled');
  });

  it('(e) withToken: first call 401, renewal gives jwt2, the retry gets jwt2', async () => {
    const store = createMemoryStore();
    const session = new Session(store);
    await session.saveAuth({ apiKey: 'k', displayName: 'User', email: 'u@example.com' });

    let loginCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/login-with-key')) {
        loginCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', token: `jwt${loginCount}` }),
        };
      }
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    let callAttempt = 0;
    const res = await session.withToken(async (token) => {
      callAttempt++;
      if (callAttempt === 1) {
        expect(token).toBe('jwt1');
        throw new ApiError(401, 'Unauthorized');
      }
      expect(token).toBe('jwt2');
      return 'success';
    });

    expect(res).toBe('success');
    expect(callAttempt).toBe(2);
    expect(loginCount).toBe(2);
  });

  it('(f) getToken when login-with-key returns 401 -> null and the store is empty (signed out)', async () => {
    const store = createMemoryStore();
    const session = new Session(store);
    await session.saveAuth({ apiKey: 'revoked_key', displayName: 'Revoked', email: 'r@example.com' });
    await store.set('pinsay:session', { token: 'old_token', expiresAt: 0 });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'Invalid API key' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const token = await session.getToken(true);
    expect(token).toBeNull();
    expect(session.auth).toBeNull();
    expect(await store.get('pinsay:auth')).toBeUndefined();
    expect(await store.get('pinsay:session')).toBeUndefined();
  });

  it('(g) a stored session not yet expired is reused without calling fetch', async () => {
    const store = createMemoryStore();
    const session = new Session(store, () => 1000);
    await store.set('pinsay:auth', { apiKey: 'k', displayName: 'U', email: 'e' });
    await store.set('pinsay:session', { token: 'stored-jwt', expiresAt: 50000 });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const signedIn = await session.load();
    expect(signedIn).toBe(true);

    const token = await session.getToken();
    expect(token).toBe('stored-jwt');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('workspace keys', () => {
    const rows = [
      { workspaceId: 'ws-a', name: 'A', current: true, pluginEnabled: true, apiKey: 'k_a' },
      { workspaceId: 'ws-b', name: 'B', current: false, pluginEnabled: true, apiKey: 'k_b' },
      { workspaceId: 'ws-c', name: 'C', current: false, pluginEnabled: false, apiKey: null },
    ];
    function stubSignIn(poll: any) {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
        const ok = (b: any) => ({ ok: true, status: 200, json: async () => b });
        if (url.endsWith('/api/auth/device/start')) return ok({ deviceCode: 'd', userCode: 'u', verificationUrl: 'x', expiresInSeconds: 60, intervalSeconds: 1 });
        if (url.endsWith('/api/auth/device/poll')) return ok(poll);
        if (url.endsWith('/api/auth/login-with-key')) return ok({ status: 'ok', token: 'jwt' });
        return { ok: false, status: 404, statusText: 'nf', json: async () => ({}) };
      }));
    }
    const run = (session: Session) => signIn(session, 'c', () => {}, () => false, async () => {}, () => 1000);

    async function seeded() {
      const store = createMemoryStore();
      const session = new Session(store);
      await session.saveSignIn({ apiKey: 'k_a', displayName: '', email: '', workspaceId: 'ws-a' }, { 'ws-a': 'k_a', 'ws-b': 'k_b' });
      return { store, session };
    }

    it('(h) signIn stores the current workspace and one key per workspace that has one', async () => {
      const store = createMemoryStore();
      stubSignIn({ status: 'approved', apiKey: 'k_a', workspaces: rows });
      expect(await run(new Session(store))).toBe('approved');
      expect((await store.get<any>('pinsay:auth')).workspaceId).toBe('ws-a');
      expect(await store.get<any>('pinsay:keys')).toEqual({ 'ws-a': 'k_a', 'ws-b': 'k_b' });
    });

    it('(i) signIn without workspaces -> workspaceId null, no keys', async () => {
      const store = createMemoryStore();
      stubSignIn({ status: 'approved', apiKey: 'k_a' });
      expect(await run(new Session(store))).toBe('approved');
      expect((await store.get<any>('pinsay:auth')).workspaceId).toBeNull();
      expect(await store.get<any>('pinsay:keys')).toEqual({});
    });

    it('(j) useWorkspace switches key, drops the cached token, next token uses the new key', async () => {
      const { store, session } = await seeded();
      await store.set('pinsay:session', { token: 'old', expiresAt: 9e15 });
      await session.load();
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok', token: 'jwt-b' }) });
      vi.stubGlobal('fetch', fetchMock);
      expect(await session.useWorkspace('ws-b')).toBe(true);
      expect(session.auth?.apiKey).toBe('k_b');
      expect(session.auth?.workspaceId).toBe('ws-b');
      expect(await store.get('pinsay:session')).toBeUndefined();
      expect(await session.getToken()).toBe('jwt-b');
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toMatch(/\/api\/auth\/login-with-key$/);
      expect(JSON.parse(init.body)).toEqual({ apiKey: 'k_b' });
    });

    it('(k) useWorkspace without a key -> false, auth unchanged', async () => {
      const { session } = await seeded();
      const before = { ...session.auth };
      expect(await session.useWorkspace('ws-x')).toBe(false);
      expect(session.auth).toEqual(before);
    });

    it('(l) pruneKeys keeps only live workspaces, in memory and store', async () => {
      const { store, session } = await seeded();
      await session.pruneKeys(['ws-a']);
      expect(session.keys).toEqual({ 'ws-a': 'k_a' });
      expect(await store.get('pinsay:keys')).toEqual({ 'ws-a': 'k_a' });
    });

    it('(m) adoptCurrent sets the workspace id on an old auth and records its key', async () => {
      const store = createMemoryStore();
      const session = new Session(store);
      await session.saveAuth({ apiKey: 'k_a', displayName: '', email: '' });
      await session.adoptCurrent('ws-a');
      expect(session.auth?.workspaceId).toBe('ws-a');
      expect(session.keys['ws-a']).toBe('k_a');
    });

    it('(n) signOut removes pinsay:keys', async () => {
      const { store, session } = await seeded();
      await session.signOut();
      expect(await store.get('pinsay:keys')).toBeUndefined();
      expect(session.keys).toEqual({});
    });
  });
});
