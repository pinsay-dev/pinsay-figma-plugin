// Every PinSay API call the plugin makes. Only __PINSAY_SERVER__ (manifest networkAccess allows only it).
export const SERVER: string = __PINSAY_SERVER__;

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type Branding = { productName: string; primaryColor: string; logoUrl: string | null };
export type Environment = { name: string; url: string };
export type PluginProject = { key: string; name: string; environments: Environment[]; maxSpecsKb: number };
export type CommentItem = { id: number; number: number; body: string; route: string; statusKey: string; authorName: string };
export type DeviceStart = { deviceCode: string; userCode: string; verificationUrl: string; expiresInSeconds: number; intervalSeconds: number };
export type WorkspaceInfo = { workspaceId: string; name: string; current: boolean; pluginEnabled: boolean };
export type DeviceWorkspace = WorkspaceInfo & { apiKey: string | null };
export type DevicePoll = {
  status: string; apiKey?: string | null; displayName?: string | null; email?: string | null;
  workspaces?: DeviceWorkspace[] | null;
};
export type FigmaPayload = { figmaUrl: string; frameName: string; specs: string };
export type Draft = { token: string; openUrl: string; expiresAt: string };

type Opts = { method?: string; body?: unknown; token?: string | null; form?: FormData };

export async function call<T>(path: string, o: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'X-PinSay-Client': 'figma-plugin' };
  if (o.token) headers.Authorization = `Bearer ${o.token}`;
  let body: BodyInit | undefined;
  if (o.form) body = o.form;
  else if (o.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(o.body); }
  let res: Response;
  try {
    res = await fetch(`${SERVER}${path}`, { method: o.method ?? 'GET', headers, body });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (!res.ok) {
    let msg = res.statusText || `HTTP ${res.status}`;
    try { const j = await res.json(); if (j && typeof j.message === 'string' && j.message) msg = j.message; } catch { /* keep */ }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  const j = await res.json();
  return (j && j.data !== undefined ? j.data : j) as T;
}

function absolute(u: string | null | undefined): string | null {
  if (!u) return null;
  try { return new URL(u, SERVER).toString(); } catch { return null; }
}

export async function getBranding(): Promise<Branding> {
  try {
    const b = await call<any>('/api/branding');
    return {
      productName: typeof b?.productName === 'string' && b.productName.trim() ? b.productName.trim() : 'PinSay',
      primaryColor: typeof b?.primaryColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(b.primaryColor) ? b.primaryColor : '#6d28d9',
      logoUrl: absolute(b?.assets?.logo),
    };
  } catch {
    return { productName: 'PinSay', primaryColor: '#6d28d9', logoUrl: null };
  }
}

export const deviceStart = (clientName: string) =>
  call<DeviceStart>('/api/auth/device/start', { method: 'POST', body: { clientName, clientKind: 'figma' } });
export const devicePoll = (deviceCode: string) =>
  call<DevicePoll>('/api/auth/device/poll', { method: 'POST', body: { deviceCode } });

/** Key → JWT. Null when the key is no longer valid. */
export async function loginWithKey(apiKey: string): Promise<string | null> {
  try {
    const r = await call<any>('/api/auth/login-with-key', { method: 'POST', body: { apiKey } });
    return r?.status === 'ok' && typeof r.token === 'string' ? r.token : null;
  } catch (e) {
    if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) return null;
    throw e;
  }
}

export const listProjects = (token: string) => call<PluginProject[]>('/api/figma-plugin/projects', { token }).then((list) =>
  list.map((p) => {
    const kb = Number(p.maxSpecsKb);
    return { ...p, maxSpecsKb: Number.isFinite(kb) && kb >= 1 && kb <= 1024 ? kb : 32 };
  }),
);

function toWorkspace(w: any): WorkspaceInfo | null {
  if (!w || typeof w.workspaceId !== 'string' || !w.workspaceId) return null;
  return {
    workspaceId: w.workspaceId,
    name: typeof w.name === 'string' && w.name.trim() ? w.name.trim() : w.workspaceId,
    current: w.current === true,
    pluginEnabled: w.pluginEnabled === true,
  };
}

/** The signed-in user's workspaces. Null when this API has no such endpoint yet (404) or is unreachable. */
export async function listWorkspaces(token: string): Promise<WorkspaceInfo[] | null> {
  try {
    const r = await call<any>('/api/figma-plugin/workspaces', { token });
    return Array.isArray(r) ? r.map(toWorkspace).filter((w): w is WorkspaceInfo => w !== null) : null;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 0)) return null;
    throw e;
  }
}

/** Device-poll rows → { workspaceId: apiKey } for the rows that carry a key. */
export function keysOf(rows: DeviceWorkspace[] | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const w of Array.isArray(rows) ? rows : []) {
    if (w && typeof w.workspaceId === 'string' && w.workspaceId && typeof w.apiKey === 'string' && w.apiKey) out[w.workspaceId] = w.apiKey;
  }
  return out;
}


function toItem(c: any): CommentItem {
  return {
    id: Number(c?.id),
    number: Number(c?.number),
    body: typeof c?.body === 'string' ? c.body : '',
    route: typeof c?.element?.route === 'string' ? c.element.route : typeof c?.element?.pageUrl === 'string' ? c.element.pageUrl : '',
    statusKey: typeof c?.statusKey === 'string' ? c.statusKey : '',
    authorName: typeof c?.authorName === 'string' ? c.authorName : '',
  };
}

/** "#42" or "42" → that comment by number; otherwise open comments matching the text (newest first, 25). */
export async function searchComments(token: string, projectKey: string, query: string): Promise<CommentItem[]> {
  const q = query.trim();
  const k = encodeURIComponent(projectKey);
  const num = /^#?(\d{1,9})$/.exec(q);
  if (num) {
    try {
      return [toItem(await call<any>(`/api/projects/${k}/comments/by-number/${num[1]}`, { token }))];
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return [];
      throw e;
    }
  }
  const params = new URLSearchParams({ status: '1', page: '1', pageSize: '25' });
  if (q) params.set('search', q);
  const r = await call<any>(`/api/projects/${k}/comments?${params.toString()}`, { token });
  const items: any[] = Array.isArray(r?.items) ? r.items : Array.isArray(r) ? r : [];
  return items.map(toItem);
}

/** Uploads the frame PNG; returns the signed URL the reply/draft refers to. */
export async function uploadRender(token: string, projectKey: string, png: Uint8Array): Promise<string> {
  const form = new FormData();
  // copy into an ArrayBuffer-backed view: the DOM BlobPart type refuses Uint8Array<ArrayBufferLike>
  form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'figma.png');
  form.append('project', projectKey);
  form.append('kind', 'figma');
  const r = await call<any>('/api/uploads', { method: 'POST', token, form });
  if (!r || typeof r.url !== 'string') throw new ApiError(500, 'upload');
  return r.url;
}

export function addFigmaReply(
  token: string, commentId: number, note: string, f: FigmaPayload,
  render: { url: string; width: number; height: number } | null,
) {
  return call<any>(`/api/comments/${commentId}/replies`, {
    method: 'POST', token,
    body: {
      body: note.trim() || `Figma: ${f.frameName}`,
      figmaUrl: f.figmaUrl,
      figmaFrameName: f.frameName,
      figmaSpecs: f.specs,
      media: render ? [{ kind: 'figma', url: render.url, width: render.width, height: render.height }] : [],
    },
  });
}

export function createDraft(
  token: string, projectKey: string, targetUrl: string, note: string, f: FigmaPayload,
  render: { url: string; width: number; height: number } | null,
) {
  return call<Draft>('/api/figma-plugin/drafts', {
    method: 'POST', token,
    body: {
      projectKey, targetUrl, note: note.trim() || null,
      figmaUrl: f.figmaUrl, frameName: f.frameName, specs: f.specs,
      renderUrl: render?.url ?? null, renderWidth: render?.width ?? null, renderHeight: render?.height ?? null,
    },
  });
}
