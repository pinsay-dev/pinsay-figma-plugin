import type { ToCode, ToUi } from '../shared/messages';

type Pending = { resolve: (v: any) => void };
const pending = new Map<number, Pending>();
let nextId = 1;
const listeners = new Set<(m: ToUi) => void>();

export function send(msg: ToCode): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

/** Call once at startup. */
export function listen(): void {
  window.addEventListener('message', (e: MessageEvent) => {
    const msg = (e.data && (e.data as { pluginMessage?: ToUi }).pluginMessage) as ToUi | undefined;
    if (!msg || typeof msg !== 'object') return;
    if ((msg.type === 'storage-result' || msg.type === 'export-result') && pending.has(msg.reqId)) {
      pending.get(msg.reqId)!.resolve(msg);
      pending.delete(msg.reqId);
      return;
    }
    listeners.forEach((l) => l(msg));
  });
}

export function onMessage(l: (m: ToUi) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function request<T>(build: (reqId: number) => ToCode): Promise<T> {
  const reqId = nextId++;
  return new Promise<T>((resolve) => {
    pending.set(reqId, { resolve });
    send(build(reqId));
  });
}

export const storage = {
  async get<T>(key: string): Promise<T | undefined> {
    const r = await request<{ value: unknown }>((reqId) => ({ type: 'storage-get', reqId, key }));
    return (r.value ?? undefined) as T | undefined;
  },
  async set(key: string, value: unknown): Promise<void> {
    await request((reqId) => ({ type: 'storage-set', reqId, key, value }));
  },
  async remove(key: string): Promise<void> {
    await request((reqId) => ({ type: 'storage-delete', reqId, key }));
  },
};

export type ExportOk = Extract<ToUi, { type: 'export-result'; ok: true }>;
export type ExportFail = Extract<ToUi, { type: 'export-result'; ok: false }>;
export function exportSelection(scale: 1 | 2, maxSpecsChars: number): Promise<ExportOk | ExportFail> {
  return request((reqId) => ({ type: 'export', reqId, scale, maxSpecsChars }));
}

export function openUrl(url: string): void {
  send({ type: 'open-url', url });
}
