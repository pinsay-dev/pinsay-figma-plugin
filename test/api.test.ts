import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  call,
  ApiError,
  searchComments,
  uploadRender,
  addFigmaReply,
  deviceStart,
  getBranding,
  listProjects,
  listWorkspaces,
  keysOf,
} from '../src/ui/api';

describe('api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('(a) call sends Authorization: Bearer t and X-PinSay-Client: figma-plugin, unwraps { data: 5 } -> 5', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: 5 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await call<number>('/api/x', { token: 't' });
    expect(res).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://app.pinsay.dev/api/x');
    expect(init.headers['Authorization']).toBe('Bearer t');
    expect(init.headers['X-PinSay-Client']).toBe('figma-plugin');
  });

  it('(b) 403 { message: "Figma integration is not enabled for this workspace." } -> ApiError status 403 with message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ message: 'Figma integration is not enabled for this workspace.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(call('/api/test')).rejects.toThrow(ApiError);
    try {
      await call('/api/test');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const apiErr = e as ApiError;
      expect(apiErr.status).toBe(403);
      expect(apiErr.message).toBe('Figma integration is not enabled for this workspace.');
    }
  });

  it('(c) searchComments(t, "demo", "#42") calls /api/projects/demo/comments/by-number/42; a 404 there -> []', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ message: 'Not found' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const items = await searchComments('t', 'demo', '#42');
    expect(items).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://app.pinsay.dev/api/projects/demo/comments/by-number/42');
  });

  it('(d) searchComments(t, "demo", "checkout") calls url with status=1, pageSize=25, search=checkout and maps items[0]', async () => {
    const rawComment = {
      id: 7,
      number: 3,
      body: 'x',
      element: { route: '/cart' },
      statusKey: 'open',
      authorName: 'Sara',
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [rawComment] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const items = await searchComments('t', 'demo', 'checkout');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('status=1');
    expect(url).toContain('pageSize=25');
    expect(url).toContain('search=checkout');
    expect(items).toEqual([
      {
        id: 7,
        number: 3,
        body: 'x',
        route: '/cart',
        statusKey: 'open',
        authorName: 'Sara',
      },
    ]);
  });

  it('(e) uploadRender posts a FormData with kind=figma and project=demo', async () => {
    let capturedBody: any;
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      capturedBody = init.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({ url: 'https://storage.example.com/figma.png' }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const url = await uploadRender('token123', 'demo', bytes);
    expect(url).toBe('https://storage.example.com/figma.png');
    expect(capturedBody).toBeInstanceOf(FormData);
    expect(capturedBody.get('kind')).toBe('figma');
    expect(capturedBody.get('project')).toBe('demo');
    const file = capturedBody.get('file');
    expect(file).toBeInstanceOf(Blob);
  });

  it('(f) addFigmaReply with an empty note sends body: "Figma: Card" and media: [] when render is null', async () => {
    let capturedBody: any;
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 10 } }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await addFigmaReply(
      'token123',
      42,
      '   ',
      { figmaUrl: 'https://figma.com/design/xyz', frameName: 'Card', specs: 'specs' },
      null,
    );

    expect(capturedBody).toMatchObject({
      body: 'Figma: Card',
      figmaUrl: 'https://figma.com/design/xyz',
      figmaFrameName: 'Card',
      figmaSpecs: 'specs',
      media: [],
    });
  });

  it('(g) deviceStart("PinSay for Figma") sends { clientName: "PinSay for Figma", clientKind: "figma" }', async () => {
    let capturedBody: any;
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          deviceCode: 'dc123',
          userCode: 'uc123',
          verificationUrl: 'https://app.pinsay.dev/cli-login',
          expiresInSeconds: 300,
          intervalSeconds: 5,
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await deviceStart('PinSay for Figma');
    expect(res.deviceCode).toBe('dc123');
    expect(capturedBody).toEqual({
      clientName: 'PinSay for Figma',
      clientKind: 'figma',
    });
  });

  it('(h) getBranding on a network failure -> defaults, and a relative assets.logo -> https://app.pinsay.dev/brand/logo.svg', async () => {
    // Network failure case:
    const fetchMockFail = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMockFail);

    const fallback = await getBranding();
    expect(fallback).toEqual({
      productName: 'PinSay',
      primaryColor: '#6d28d9',
      logoUrl: null,
    });

    // Relative assets.logo case:
    const fetchMockSuccess = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        productName: 'Acme',
        primaryColor: '#123456',
        assets: { logo: '/brand/logo.svg' },
      }),
    });
    vi.stubGlobal('fetch', fetchMockSuccess);

    const branding = await getBranding();
    expect(branding).toEqual({
      productName: 'Acme',
      primaryColor: '#123456',
      logoUrl: 'https://app.pinsay.dev/brand/logo.svg',
    });
  });

  it('listProjects keeps maxSpecsKb when valid, else 32', async () => {
    const items = [
      { key: 'a', name: 'A', environments: [], maxSpecsKb: 8 },
      { key: 'b', name: 'B', environments: [] },
      { key: 'c', name: 'C', environments: [], maxSpecsKb: 'x' },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: items }) }));
    const res = await listProjects('t');
    expect(res.map((p) => p.maxSpecsKb)).toEqual([8, 32, 32]);
    expect(res[0].key).toBe('a');
  });

  it('(i) listWorkspaces GETs the endpoint with Bearer and maps rows, dropping bad ones', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ data: [{ workspaceId: 'ws-a', name: ' A ', current: true, pluginEnabled: true }, { name: 'bad' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await listWorkspaces('t');
    expect(res).toEqual([{ workspaceId: 'ws-a', name: 'A', current: true, pluginEnabled: true }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://app.pinsay.dev/api/figma-plugin/workspaces');
    expect(init.headers['Authorization']).toBe('Bearer t');
  });

  it('(j) listWorkspaces: 404 -> null, network failure -> null, 500 -> ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'nf', json: async () => ({}) }));
    expect(await listWorkspaces('t')).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')));
    expect(await listWorkspaces('t')).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'boom', json: async () => ({}) }));
    await expect(listWorkspaces('t')).rejects.toMatchObject({ name: 'Error', status: 500 });
    await expect(listWorkspaces('t')).rejects.toBeInstanceOf(ApiError);
  });

  it('(k) keysOf keeps only rows with a key', () => {
    expect(keysOf([{ workspaceId: 'a', apiKey: 'k' }, { workspaceId: 'b', apiKey: null }] as any)).toEqual({ a: 'k' });
    expect(keysOf(null)).toEqual({});
  });
});
