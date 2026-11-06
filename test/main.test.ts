import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  listProjects: vi.fn(),
  load: vi.fn(),
  signIn: vi.fn(),
  onMessage: vi.fn((_cb: unknown) => () => {}),
  exportSelection: vi.fn(),
  listWorkspaces: vi.fn(async () => null as unknown),
  useWorkspace: vi.fn(),
  keys: {} as Record<string, string>,
}));

vi.mock('../src/ui/bridge', () => ({
  listen: vi.fn(),
  onMessage: h.onMessage,
  send: vi.fn(),
  openUrl: vi.fn(),
  exportSelection: h.exportSelection,
  storage: {
    get: vi.fn(async () => undefined),
    set: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  },
}));

vi.mock('../src/ui/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/ui/api')>();
  return {
    ...real,
    getBranding: vi.fn(async () => ({ productName: 'PinSay', primaryColor: '#6d28d9', logoUrl: null })),
    listProjects: h.listProjects,
    listWorkspaces: h.listWorkspaces,
    searchComments: vi.fn(async () => []),
    uploadRender: vi.fn(), createDraft: vi.fn(),
  };
});

vi.mock('../src/ui/session', () => ({
  Session: class {
    auth: { apiKey: string; displayName: string; email: string; workspaceId?: string } | null = null;
    get keys(): Record<string, string> { return h.keys; }
    load = h.load;
    hasKey = vi.fn((id: string) => !!h.keys[id]);
    useWorkspace = vi.fn(async (id: string) => {
      h.useWorkspace(id);
      if (this.auth) { this.auth.workspaceId = id; this.auth.apiKey = h.keys[id] ?? this.auth.apiKey; }
      return true;
    });
    adoptCurrent = vi.fn(async () => {});
    pruneKeys = vi.fn(async () => {});
    async withToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
      return fn('tok');
    }
    async signOut(): Promise<void> {
      this.auth = null;
    }
  },
  signIn: h.signIn,
}));

async function start(): Promise<void> {
  document.body.innerHTML = '<div id="app"></div>';
  await import('../src/ui/main');
}

function approveInBrowser(): void {
  h.signIn.mockImplementation(async (_s: unknown, _n: string, onCode: (s: { userCode: string; verificationUrl: string }) => void) => {
    onCode({ userCode: 'ABCD-1234', verificationUrl: 'https://app.pinsay.dev/device' });
    return 'approved';
  });
}

async function clickSignIn(): Promise<void> {
  await vi.waitFor(() => expect(document.getElementById('signin')).not.toBeNull());
  (document.getElementById('signin') as HTMLButtonElement).click();
}

describe('main: errors before the main screen', () => {
  beforeEach(() => {
    vi.resetModules();
    h.listProjects.mockReset();
    h.load.mockReset();
    h.signIn.mockReset();
  });

  it('approved, then loading projects fails: back on the sign-in screen with the error', async () => {
    h.load.mockResolvedValue(false);
    h.listProjects.mockRejectedValue(new Error('Failed to fetch'));
    approveInBrowser();
    await start();
    await clickSignIn();
    await vi.waitFor(() => expect(document.querySelector('.msg.err')?.textContent).toBe('Failed to fetch'));
    expect(document.body.textContent).not.toContain('Waiting for approval');
    expect(document.getElementById('signin')).not.toBeNull();
  });

  it('approved, then a 403 from projects: the 403 message shows on the sign-in screen', async () => {
    const { ApiError } = await import('../src/ui/api');
    h.load.mockResolvedValue(false);
    h.listProjects.mockRejectedValue(new ApiError(403, 'The Figma plugin is off for this workspace.'));
    approveInBrowser();
    await start();
    await clickSignIn();
    await vi.waitFor(() =>
      expect(document.querySelector('.msg.err')?.textContent).toBe('The Figma plugin is off for this workspace.'),
    );
    expect(document.body.textContent).not.toContain('Waiting for approval');
  });

  it('a stored session whose projects fail opens on the sign-in screen with the error', async () => {
    h.load.mockResolvedValue(true);
    h.listProjects.mockRejectedValue(new Error('boom'));
    await start();
    await vi.waitFor(() => expect(document.querySelector('.msg.err')?.textContent).toBe('boom'));
    expect(document.getElementById('signin')).not.toBeNull();
  });
});

describe('main: export size follows the project plan', () => {
  beforeEach(() => {
    vi.resetModules();
    h.listProjects.mockReset();
    h.load.mockReset();
    h.exportSelection.mockReset();
    h.onMessage.mockClear();
  });

  it('a project with maxSpecsKb 8 makes the export message carry 8192', async () => {
    h.load.mockImplementation(async function (this: { auth: unknown }) {
      this.auth = { apiKey: 'k', displayName: 'n', email: 'e' };
      return true;
    });
    h.listProjects.mockResolvedValue([{ key: 'p1', name: 'P', environments: [{ name: 'prod', url: 'https://x.dev' }], maxSpecsKb: 8 }]);
    h.exportSelection.mockResolvedValue({ ok: false, error: 'stop' });
    const api = await import('../src/ui/api');
    vi.mocked(api.searchComments).mockResolvedValue([{ id: 7, number: 7, body: 'b', route: '/', statusKey: 'open', authorName: 'a' }]);
    await start();
    await vi.waitFor(() => expect(h.onMessage).toHaveBeenCalled());
    const cb = h.onMessage.mock.calls[0][0] as (m: unknown) => Promise<void>;
    await cb({ type: 'selection', selection: { valid: true, id: '1:2', name: 'Card', type: 'FRAME', width: 10, height: 10 }, documentName: 'Doc', fileKey: 'abc123' });
    await vi.waitFor(() => expect(document.querySelector('li[role="option"]')).not.toBeNull());
    (document.querySelector('li[role="option"]') as HTMLElement).click();
    await vi.waitFor(() => expect((document.getElementById('attach') as HTMLButtonElement | null)?.disabled).toBe(false));
    (document.getElementById('attach') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(h.exportSelection).toHaveBeenCalledWith(2, 8192));
  });
});

describe('main: header and result state', () => {
  beforeEach(() => {
    vi.resetModules();
    h.listProjects.mockReset();
    h.load.mockReset();
    h.exportSelection.mockReset();
    h.onMessage.mockClear();
  });

  it('a successful pin shows the result; "Send another frame" returns to the form', async () => {
    h.load.mockImplementation(async function (this: { auth: unknown }) {
      this.auth = { apiKey: 'k', displayName: 'Sara Ali', email: 'sara@x.dev' };
      return true;
    });
    h.listProjects.mockResolvedValue([{ key: 'p1', name: 'P', environments: [{ name: 'prod', url: 'https://x.dev' }], maxSpecsKb: 8 }]);
    h.exportSelection.mockResolvedValue({ type: 'export-result', reqId: 1, ok: true, png: new Uint8Array([1]), specs: 's', frameName: 'Card', nodeId: '1:2', width: 20, height: 20 });
    const api = await import('../src/ui/api');
    vi.mocked(api.uploadRender).mockResolvedValue('https://img.x.dev/r.png');
    vi.mocked(api.createDraft).mockResolvedValue({ token: 't', openUrl: 'https://x.dev/?pinsay-draft=t', expiresAt: '' });
    await start();
    await vi.waitFor(() => expect(h.onMessage).toHaveBeenCalled());
    const cb = h.onMessage.mock.calls[0][0] as (m: unknown) => Promise<void>;
    await cb({ type: 'selection', selection: { valid: true, id: '1:2', name: 'Card', type: 'FRAME', width: 10, height: 10 }, documentName: 'Doc', fileKey: 'abc123' });
    await vi.waitFor(() => expect(document.querySelector('header .user')).not.toBeNull());
    expect(document.querySelector('footer')).toBeNull();
    expect(document.querySelector('header')?.textContent).toContain('Sara Ali');
    (document.querySelector('[data-tab="pin"]') as HTMLElement).click();
    await vi.waitFor(() => expect((document.getElementById('pin') as HTMLButtonElement | null)?.disabled).toBe(false));
    (document.getElementById('pin') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.getElementById('result-again')).not.toBeNull());
    expect(document.body.textContent).toContain('Site opened in your browser');
    expect(document.getElementById('result-open')).not.toBeNull();
    (document.getElementById('result-again') as HTMLButtonElement).click();
    expect(document.getElementById('pin')).not.toBeNull();
  });
});

describe('main: workspace switch', () => {
  const A = { workspaceId: 'ws-a', name: 'Acme Co', current: true, pluginEnabled: true };
  const B = { workspaceId: 'ws-b', name: 'Beta', current: false, pluginEnabled: true };
  const D = { workspaceId: 'ws-d', name: 'Dead', current: false, pluginEnabled: false };
  const proj = [{ key: 'p1', name: 'P', environments: [{ name: 'prod', url: 'https://x.dev' }], maxSpecsKb: 8 }];

  beforeEach(() => {
    vi.resetModules();
    h.listProjects.mockReset();
    h.load.mockReset();
    h.useWorkspace.mockReset();
    h.listWorkspaces.mockReset();
    h.keys = { 'ws-a': 'ka', 'ws-b': 'kb' };
    h.onMessage.mockClear();
    h.load.mockImplementation(async function (this: { auth: unknown }) {
      this.auth = { apiKey: 'ka', displayName: 'Sara Ali', email: 'sara@x.dev', workspaceId: 'ws-a' };
      return true;
    });
    h.listProjects.mockResolvedValue(proj);
  });

  it('(d) shows the workspace in the header, opens the menu and switches', async () => {
    h.listWorkspaces.mockResolvedValue([A, B]);
    await start();
    await vi.waitFor(() => expect(document.getElementById('ws')).not.toBeNull());
    expect(document.querySelector('header')?.textContent).toContain('Acme Co');
    (document.getElementById('ws') as HTMLButtonElement).click();
    expect(document.querySelectorAll('#ws-menu .mi').length).toBe(2);
    const calls = h.listProjects.mock.calls.length;
    (document.querySelector('#ws-menu [data-ws="ws-b"]') as HTMLElement).click();
    await vi.waitFor(() => expect(h.useWorkspace).toHaveBeenCalledWith('ws-b'));
    await vi.waitFor(() => expect(h.listProjects.mock.calls.length).toBeGreaterThan(calls));
  });

  it('(e) without a workspace list the header keeps the user name', async () => {
    h.listWorkspaces.mockResolvedValue(null);
    await start();
    await vi.waitFor(() => expect(document.querySelector('header .user')).not.toBeNull());
    expect(document.getElementById('ws')).toBeNull();
  });

  it('(f) a 403 with several workspaces shows the blocked state; with one, the sign-in screen', async () => {
    const { ApiError } = await import('../src/ui/api');
    h.listProjects.mockRejectedValue(new ApiError(403, 'off'));
    h.listWorkspaces.mockResolvedValue([A, B]);
    await start();
    await vi.waitFor(() => expect(document.getElementById('app')!.textContent).toContain('Figma integration is not enabled for this workspace.'));
    expect(document.getElementById('ws')).not.toBeNull();
  });

  it('(f2) a 403 with one workspace goes to the sign-in screen', async () => {
    const { ApiError } = await import('../src/ui/api');
    h.listProjects.mockRejectedValue(new ApiError(403, 'off'));
    h.listWorkspaces.mockResolvedValue([A]);
    await start();
    await vi.waitFor(() => expect(document.getElementById('signin')).not.toBeNull());
    expect(document.getElementById('app')!.textContent).not.toContain('Figma integration is not enabled');
  });

  it('(g) a disabled item does not switch; Escape closes the menu', async () => {
    h.listWorkspaces.mockResolvedValue([A, D]);
    await start();
    await vi.waitFor(() => expect(document.getElementById('ws')).not.toBeNull());
    (document.getElementById('ws') as HTMLButtonElement).click();
    (document.querySelector('#ws-menu [data-ws="ws-d"]') as HTMLElement).click();
    expect(h.useWorkspace).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('ws-menu')).toBeNull();
  });

  it('(h) cancelling "sign in again to add" returns to the main screen and forgets the choice', async () => {
    const C = { workspaceId: 'ws-c', name: 'Cobalt', current: false, pluginEnabled: true };
    h.listWorkspaces.mockResolvedValue([A, B, C]);
    h.signIn.mockReset();
    // First sign-in (the add path): the code is shown, then the user cancels; the poll never finishes.
    h.signIn.mockImplementationOnce(async (_s: unknown, _n: string, onCode: (s: { userCode: string; verificationUrl: string }) => void) => {
      onCode({ userCode: 'ABCD-1234', verificationUrl: 'https://app.pinsay.dev/device' });
      return new Promise<string>(() => {});
    });
    await start();
    await vi.waitFor(() => expect(document.getElementById('ws')).not.toBeNull());
    (document.getElementById('ws') as HTMLButtonElement).click();
    (document.querySelector('#ws-menu [data-ws="ws-c"]') as HTMLElement).click();
    await vi.waitFor(() => expect(document.getElementById('cancel')).not.toBeNull());
    (document.getElementById('cancel') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.getElementById('ws')).not.toBeNull());

    // Sign out, then a fresh sign-in whose poll also returns a key for C.
    await vi.waitFor(() => expect(document.getElementById('signout')).not.toBeNull());
    (document.getElementById('signout') as HTMLButtonElement).click();
    h.signIn.mockImplementationOnce(async (_s: unknown, _n: string, onCode: (s: { userCode: string; verificationUrl: string }) => void) => {
      onCode({ userCode: 'EFGH-5678', verificationUrl: 'https://app.pinsay.dev/device' });
      h.keys['ws-c'] = 'kc';
      return 'approved';
    });
    const calls = h.listProjects.mock.calls.length;
    await clickSignIn();
    await vi.waitFor(() => expect(h.signIn).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(h.listProjects.mock.calls.length).toBeGreaterThan(calls));
    expect(h.useWorkspace).not.toHaveBeenCalledWith('ws-c');
  });
});
