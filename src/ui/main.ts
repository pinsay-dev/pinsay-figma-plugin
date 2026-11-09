import { listen, onMessage, send, storage, exportSelection, openUrl } from './bridge';
import {
  type Branding,
  type PluginProject,
  type CommentItem,
  type FigmaPayload,
  ApiError,
  getBranding,
  listProjects,
  listWorkspaces,
  type WorkspaceInfo,
  searchComments,
  uploadRender,
  addFigmaReply,
  createDraft,
} from './api';
import { Session, signIn } from './session';
import { detectLang, getLang, setLang, dir, t } from './i18n';
import type { SelectionInfo } from '../shared/messages';
import { parseFigmaFileKey, buildFigmaUrl } from '../shared/figmaLink';
import {
  header,
  wsMenu,
  blockedPanel,
  signedOut,
  deviceCode,
  loading,
  frameCard,
  projectSelect,
  tabs,
  attachPanel,
  pinPanel,
  resultPanel,
  type PanelMessage,
  type Result,
  missingStep,
} from './view';

type Screen = 'signedOut' | 'deviceCode' | 'loading' | 'main';

type Done = { kind: 'attach'; n: number; noImage: boolean } | { kind: 'pin'; openUrl: string };

type State = {
  screen: Screen;
  branding: Branding;
  selection: SelectionInfo;
  documentName: string;
  figmaFileKey: string | null;
  fileKey: string | null;
  fileError: string | null;
  fileInputValue: string;
  projects: PluginProject[];
  selectedProjectKey: string | null;
  selectedEnvUrl: string | null;
  activeTab: 'attach' | 'pin';
  searchQuery: string;
  searchResults: CommentItem[];
  selectedCommentId: number | null;
  note: string;
  busy: boolean;
  signInMessage: string | null;
  userCode: string;
  verificationUrl: string;
  panelMessage: PanelMessage;
  thumbUrl: string | null;
  done: Done | null;
  workspaces: WorkspaceInfo[] | null;
  wsMenuOpen: boolean;
  blocked: boolean;
  pendingWorkspaceId: string | null;
};

const state: State = {
  screen: 'signedOut',
  branding: { productName: 'PinSay', primaryColor: '#6d28d9', logoUrl: null },
  selection: { valid: false, reason: 'none' },
  documentName: '',
  figmaFileKey: null,
  fileKey: null,
  fileError: null,
  fileInputValue: '',
  projects: [],
  selectedProjectKey: null,
  selectedEnvUrl: null,
  activeTab: 'attach',
  searchQuery: '',
  searchResults: [],
  selectedCommentId: null,
  note: '',
  busy: false,
  signInMessage: null,
  userCode: '',
  verificationUrl: '',
  panelMessage: null,
  thumbUrl: null,
  done: null,
  workspaces: null,
  wsMenuOpen: false,
  blocked: false,
  pendingWorkspaceId: null,
};

let session: Session;
let cancelled = false;
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
let searchSeq = 0;

const app = document.getElementById('app')!;

let lastHeight = 0;

/** Ask the sandbox to fit the panel to its content (clamped there to 240–720). */
function fit(): void {
  const h = Math.ceil(document.body.scrollHeight);
  if (h > 0 && h !== lastHeight) {
    lastHeight = h;
    send({ type: 'resize', height: h });
  }
}

function setThumb(png: Uint8Array | null): void {
  if (state.thumbUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(state.thumbUrl);
  state.thumbUrl =
    png && png.length && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(new Blob([new Uint8Array(png)], { type: 'image/png' }))
      : null;
}

function resultOf(d: Done): Result {
  return d.kind === 'attach'
    ? { kind: 'attach', title: t('attach.done', { n: d.n }), detail: d.noImage ? t('attach.noImage') : null, openUrl: null }
    : { kind: 'pin', title: t('pin.doneTitle'), detail: t('pin.done'), openUrl: d.openUrl };
}

async function updateFileKey(): Promise<void> {
  if (state.figmaFileKey) {
    state.fileKey = state.figmaFileKey;
  } else if (state.documentName) {
    const map = (await storage.get<Record<string, string>>('pinsay:fileKeys')) ?? {};
    state.fileKey = map[state.documentName] ?? null;
  } else {
    state.fileKey = null;
  }
}

async function handleError(e: unknown): Promise<void> {
  if (e instanceof ApiError && e.status === 401) {
    await session.signOut();
    state.screen = 'signedOut';
    state.signInMessage = t('error.signedOut');
    render();
    return;
  }
  const msg = e instanceof Error && e.message ? e.message : t('error.generic');
  if (state.screen === 'main') {
    state.panelMessage = { kind: 'err', text: msg };
  } else {
    // Not on the main screen yet (signed out, or the device-code screen right after approval): show the
    // error on the sign-in screen so the user is never left on "Waiting for approval in the browser…".
    state.screen = 'signedOut';
    state.signInMessage = msg;
  }
  render();
}

async function prepare(token: string): Promise<{
  f: FigmaPayload;
  render: { url: string; width: number; height: number } | null;
  noImage: boolean;
}> {
  const maxSpecsChars = (state.projects.find((p) => p.key === state.selectedProjectKey)?.maxSpecsKb ?? 32) * 1024;
  let ex = await exportSelection(2, maxSpecsChars);
  if (!ex.ok) throw new Error(ex.error);
  const figmaUrl = buildFigmaUrl(state.fileKey!, ex.nodeId);
  if (!figmaUrl) throw new Error('nested');
  const f = { figmaUrl, frameName: ex.frameName.slice(0, 200), specs: ex.specs };
  for (const scale of [2, 1] as const) {
    if (scale === 1) {
      ex = await exportSelection(1, maxSpecsChars);
      if (!ex.ok) break;
    }
    try {
      const url = await uploadRender(token, state.selectedProjectKey!, ex.png);
      return { f, render: { url, width: ex.width, height: ex.height }, noImage: false };
    } catch (e) {
      // 400 (too big for the plan's image size) or 413: try the smaller render once, then send without an image.
      if (!(e instanceof ApiError) || (e.status !== 400 && e.status !== 413)) throw e;
    }
  }
  return { f, render: null, noImage: true };
}

async function runSearch(q: string): Promise<void> {
  if (!state.selectedProjectKey) {
    state.searchResults = [];
    render();
    return;
  }
  const seq = ++searchSeq;
  try {
    const res = await session.withToken((t) => searchComments(t, state.selectedProjectKey!, q));
    if (seq !== searchSeq) return;
    state.searchResults = res;
    if (state.selectedCommentId !== null && !res.some((c) => c.id === state.selectedCommentId)) {
      state.selectedCommentId = null;
    }
    render();
  } catch (e) {
    if (seq !== searchSeq) return;
    await handleError(e);
  }
}

async function getLastProject(): Promise<string | undefined> {
  const map = (await storage.get<Record<string, string>>('pinsay:lastProjects')) ?? {};
  const id = session.auth?.workspaceId ?? '_';
  if (map[id]) return map[id];
  const legacy = await storage.get<string>('pinsay:lastProject');
  if (legacy) await storage.remove('pinsay:lastProject');
  return legacy;
}

async function setLastProject(key: string): Promise<void> {
  const map = (await storage.get<Record<string, string>>('pinsay:lastProjects')) ?? {};
  map[session.auth?.workspaceId ?? '_'] = key;
  await storage.set('pinsay:lastProjects', map);
}

async function loadProjects(): Promise<void> {
  try {
    if (state.screen !== 'main') {
      state.screen = 'loading';
      render();
    }
    let ws: WorkspaceInfo[] | null = null;
    try {
      ws = await session.withToken(listWorkspaces);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) throw e;
      ws = null;
    }
    state.workspaces = ws;
    if (ws) {
      const cur = ws.find((w) => w.current);
      if (cur) await session.adoptCurrent(cur.workspaceId);
      await session.pruneKeys(ws.map((w) => w.workspaceId));
    }
    let list: PluginProject[];
    try {
      list = await session.withToken(listProjects);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && ws && ws.length > 1) {
        state.projects = [];
        state.selectedProjectKey = null;
        state.selectedEnvUrl = null;
        state.blocked = true;
        state.screen = 'main';
        render();
        return;
      }
      throw e;
    }
    state.blocked = false;
    state.projects = list;
    const last = await getLastProject();
    if (last && list.some((p) => p.key === last)) {
      state.selectedProjectKey = last;
    } else {
      state.selectedProjectKey = list[0]?.key ?? null;
      if (state.selectedProjectKey) {
        await setLastProject(state.selectedProjectKey);
      }
    }
    const currentProj = list.find((p) => p.key === state.selectedProjectKey);
    state.selectedEnvUrl = currentProj?.environments[0]?.url ?? null;
    state.screen = 'main';
    await updateFileKey();
    render();
    await runSearch('');
  } catch (e) {
    await handleError(e);
  }
}

function render(): void {
  document.documentElement.lang = getLang();
  document.documentElement.dir = dir();
  document.documentElement.style.setProperty('--accent', state.branding.primaryColor);

  const activeId = document.activeElement?.id;
  let selStart: number | null = null;
  let selEnd: number | null = null;
  if (activeId && (activeId === 'search' || activeId === 'note' || activeId === 'file-link')) {
    const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
    selStart = el.selectionStart;
    selEnd = el.selectionEnd;
  }

  const curProj = state.projects.find((p) => p.key === state.selectedProjectKey);
  const currentEnvs = curProj?.environments ?? [];
  if (!state.selectedEnvUrl && currentEnvs.length > 0) {
    state.selectedEnvUrl = currentEnvs[0]!.url;
  }

  const isSignedIn = !!session?.auth?.apiKey;
  const hasValidSel = state.selection?.valid === true;
  const hasFileKey = !!state.fileKey;
  const hasProject = !!state.selectedProjectKey;
  const canSubmitAttach = isSignedIn && hasValidSel && hasFileKey && hasProject && state.selectedCommentId !== null;
  const canSubmitPin = isSignedIn && hasValidSel && hasFileKey && hasProject && !!state.selectedEnvUrl;
  const step = missingStep({
    tab: state.activeTab,
    hasFileKey,
    hasValidSel,
    hasProject,
    hasComment: state.selectedCommentId !== null,
    hasEnv: !!state.selectedEnvUrl,
  });
  const submitHint = step ? t(`hint.${step}`) : null;

  let html = '';
  if (state.screen === 'signedOut') {
    html = header(null) + signedOut(state.branding, state.signInMessage);
  } else if (state.screen === 'deviceCode') {
    html = header(null) + deviceCode(state.branding, state.userCode);
  } else if (state.screen === 'loading') {
    html = header(null) + loading();
  } else {
    const email = session?.auth?.email || null;
    const name = session?.auth?.displayName || email || '';
    const wsList = state.workspaces;
    const curWs =
      wsList?.find((w) => w.workspaceId === session.auth?.workspaceId) ?? wsList?.find((w) => w.current) ?? null;
    const hd = header({ name, email }, curWs ? { name: curWs.name, open: state.wsMenuOpen } : null);
    const menu = curWs && state.wsMenuOpen ? wsMenu(wsList!, curWs.workspaceId, (id) => session.hasKey(id), { name, email }) : '';
    let panel: string;
    if (state.blocked) {
      panel = '';
    } else if (state.done) {
      panel = resultPanel(resultOf(state.done));
    } else if (state.activeTab === 'attach') {
      panel = attachPanel({
        query: state.searchQuery,
        results: state.searchResults,
        selectedId: state.selectedCommentId,
        note: state.note,
        canSubmit: canSubmitAttach,
        busy: state.busy,
        message: state.panelMessage,
        hint: submitHint,
      });
    } else {
      panel = pinPanel({
        envs: currentEnvs,
        envUrl: state.selectedEnvUrl,
        note: state.note,
        canSubmit: canSubmitPin,
        busy: state.busy,
        message: state.panelMessage,
        hint: submitHint,
        productName: state.branding.productName,
      });
    }
    html = state.blocked
      ? hd + menu + blockedPanel()
      : hd +
      menu +
      frameCard(state.selection, state.thumbUrl, !!state.fileKey, state.fileError) +
      tabs(state.activeTab) +
      projectSelect(state.projects, state.selectedProjectKey) +
      panel;
  }

  app.innerHTML = html;

  if (state.fileInputValue) {
    const fileLinkEl = document.getElementById('file-link') as HTMLInputElement | null;
    if (fileLinkEl) fileLinkEl.value = state.fileInputValue;
  }

  if (activeId && selStart !== null && selEnd !== null) {
    const el = document.getElementById(activeId) as HTMLInputElement | HTMLTextAreaElement | null;
    if (el && typeof el.focus === 'function') {
      el.focus();
      try {
        el.setSelectionRange(selStart, selEnd);
      } catch {
        // ignore
      }
    }
  }

  attachListeners(canSubmitAttach, canSubmitPin);
  fit();
}

async function startSignIn(): Promise<void> {
  const wasSignedIn = !!session.auth?.apiKey;
  cancelled = false;
  state.signInMessage = null;
  const outcome = await signIn(
    session,
    `${state.branding.productName} for Figma`,
    (s) => {
      state.screen = 'deviceCode';
      state.userCode = s.userCode;
      state.verificationUrl = s.verificationUrl;
      openUrl(s.verificationUrl);
      render();
    },
    () => cancelled,
  );
  if (cancelled) return;
  if (outcome === 'approved') {
    const pending = state.pendingWorkspaceId;
    state.pendingWorkspaceId = null;
    if (pending && session.hasKey(pending)) await session.useWorkspace(pending);
    resetWorkspaceState();
    await loadProjects();
    return;
  }
  state.pendingWorkspaceId = null;
  const msg =
    outcome === 'denied'
      ? t('signin.denied')
      : outcome === 'expired'
        ? t('signin.expired')
        : outcome === 'error'
          ? t('signin.error', { product: state.branding.productName })
          : null;
  if (wasSignedIn && session.auth?.apiKey) {
    state.screen = 'main';
    state.panelMessage = msg ? { kind: 'err', text: msg } : null;
  } else {
    state.screen = 'signedOut';
    state.signInMessage = msg;
  }
  render();
}

function resetWorkspaceState(): void {
  state.projects = [];
  state.selectedProjectKey = null;
  state.selectedEnvUrl = null;
  state.searchQuery = '';
  state.searchResults = [];
  state.selectedCommentId = null;
  state.done = null;
  state.panelMessage = null;
  state.blocked = false;
  state.wsMenuOpen = false;
  searchSeq++;
}

async function chooseWorkspace(id: string): Promise<void> {
  state.wsMenuOpen = false;
  const w = state.workspaces?.find((x) => x.workspaceId === id);
  if (!w || id === session.auth?.workspaceId) {
    render();
    return;
  }
  if (!w.pluginEnabled) {
    render();
    return;
  }
  if (!session.hasKey(id)) {
    state.pendingWorkspaceId = id;
    render();
    await startSignIn();
    return;
  }
  await session.useWorkspace(id);
  resetWorkspaceState();
  state.screen = 'loading';
  await loadProjects();
}

function menuItems(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('#ws-menu .mi'));
}

function attachListeners(canSubmitAttach: boolean, canSubmitPin: boolean): void {
  const btnSignIn = document.getElementById('signin');
  if (btnSignIn) {
    btnSignIn.addEventListener('click', () => {
      void startSignIn();
    });
  }

  const btnOpen = document.getElementById('open-browser');
  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      if (state.verificationUrl) openUrl(state.verificationUrl);
    });
  }

  const btnCancel = document.getElementById('cancel');
  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      cancelled = true;
      state.pendingWorkspaceId = null;
      state.screen = session.auth?.apiKey ? 'main' : 'signedOut';
      state.signInMessage = null;
      render();
    });
  }

  const btnSignout = document.getElementById('signout');
  if (btnSignout) {
    btnSignout.addEventListener('click', async () => {
      await session.signOut();
      state.screen = 'signedOut';
      state.signInMessage = null;
      state.panelMessage = null;
      state.workspaces = null;
      state.pendingWorkspaceId = null;
      state.wsMenuOpen = false;
      state.blocked = false;
      render();
    });
  }

  const btnWs = document.getElementById('ws');
  if (btnWs) {
    btnWs.addEventListener('click', (e) => {
      e.stopPropagation();
      state.wsMenuOpen = !state.wsMenuOpen;
      render();
      if (state.wsMenuOpen) (menuItems().find((b) => b.getAttribute('aria-checked') === 'true') ?? menuItems()[0])?.focus();
    });
  }
  menuItems().forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (b.getAttribute('aria-disabled') === 'true') return;
      void chooseWorkspace(b.dataset.ws ?? '');
    });
  });

  const btnLang = document.getElementById('lang');
  if (btnLang) {
    btnLang.addEventListener('click', async () => {
      const next = getLang() === 'en' ? 'ar' : 'en';
      setLang(next);
      await storage.set('pinsay:lang', next);
      render();
    });
  }

  const btnFileSave = document.getElementById('file-save');
  if (btnFileSave) {
    btnFileSave.addEventListener('click', async () => {
      const input = (document.getElementById('file-link') as HTMLInputElement | null)?.value ?? '';
      const parsed = parseFigmaFileKey(input);
      if (!parsed) {
        state.fileError = t('file.invalid');
        render();
        return;
      }
      state.fileError = null;
      state.fileKey = parsed;
      state.fileInputValue = '';
      if (state.documentName) {
        const map = (await storage.get<Record<string, string>>('pinsay:fileKeys')) ?? {};
        map[state.documentName] = parsed;
        const keys = Object.keys(map);
        if (keys.length > 50) {
          delete map[keys[0]!];
        }
        await storage.set('pinsay:fileKeys', map);
      }
      render();
    });
  }

  const btnFileChange = document.getElementById('file-change');
  if (btnFileChange) {
    btnFileChange.addEventListener('click', async () => {
      state.fileKey = null;
      state.fileError = null;
      state.fileInputValue = '';
      if (state.documentName) {
        const map = (await storage.get<Record<string, string>>('pinsay:fileKeys')) ?? {};
        delete map[state.documentName];
        await storage.set('pinsay:fileKeys', map);
      }
      render();
    });
  }

  const inputFileLink = document.getElementById('file-link') as HTMLInputElement | null;
  if (inputFileLink) {
    inputFileLink.addEventListener('input', () => {
      state.fileInputValue = inputFileLink.value;
    });
  }

  const selProject = document.getElementById('project') as HTMLSelectElement | null;
  if (selProject) {
    selProject.addEventListener('change', async () => {
      state.selectedProjectKey = selProject.value;
      await setLastProject(state.selectedProjectKey);
      const p = state.projects.find((proj) => proj.key === state.selectedProjectKey);
      state.selectedEnvUrl = p?.environments[0]?.url ?? null;
      state.panelMessage = null;
      state.done = null;
      state.selectedCommentId = null;
      render();
      await runSearch(state.searchQuery);
    });
  }

  const tabBtns = document.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab') as 'attach' | 'pin';
      if (tab && tab !== state.activeTab) {
        state.activeTab = tab;
        state.panelMessage = null;
        state.done = null;
        render();
      }
    });
  });

  const inputSearch = document.getElementById('search') as HTMLInputElement | null;
  if (inputSearch) {
    inputSearch.addEventListener('input', () => {
      state.searchQuery = inputSearch.value;
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        runSearch(state.searchQuery);
      }, 300);
    });
  }

  const listEl = document.querySelector('.list');
  if (listEl) {
    listEl.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest('li[role="option"]') as HTMLElement | null;
      if (li && li.dataset.id) {
        state.selectedCommentId = Number(li.dataset.id);
        render();
      }
    });
  }

  const areaNote = document.getElementById('note') as HTMLTextAreaElement | null;
  if (areaNote) {
    areaNote.addEventListener('input', () => {
      state.note = areaNote.value;
    });
  }

  const selEnv = document.getElementById('env') as HTMLSelectElement | null;
  if (selEnv) {
    selEnv.addEventListener('change', () => {
      state.selectedEnvUrl = selEnv.value;
      state.panelMessage = null;
      render();
    });
  }

  const btnAttach = document.getElementById('attach') as HTMLButtonElement | null;
  if (btnAttach) {
    btnAttach.addEventListener('click', async () => {
      if (!canSubmitAttach || state.busy) return;
      state.busy = true;
      state.panelMessage = null;
      render();
      try {
        const p = await session.withToken(async (t) => {
          const prep = await prepare(t);
          await addFigmaReply(t, state.selectedCommentId!, state.note, prep.f, prep.render);
          return prep;
        });
        const selComment = state.searchResults.find((c) => c.id === state.selectedCommentId);
        const n = selComment ? selComment.number : state.selectedCommentId!;
        state.done = { kind: 'attach', n, noImage: p.noImage };
        state.note = '';
      } catch (e) {
        await handleError(e);
      } finally {
        state.busy = false;
        render();
      }
    });
  }

  const btnPin = document.getElementById('pin') as HTMLButtonElement | null;
  if (btnPin) {
    btnPin.addEventListener('click', async () => {
      if (!canSubmitPin || state.busy) return;
      state.busy = true;
      state.panelMessage = null;
      render();
      try {
        const draft = await session.withToken(async (t) => {
          const prep = await prepare(t);
          return createDraft(t, state.selectedProjectKey!, state.selectedEnvUrl!, state.note, prep.f, prep.render);
        });
        openUrl(draft.openUrl);
        state.done = { kind: 'pin', openUrl: draft.openUrl };
        state.note = '';
      } catch (e) {
        await handleError(e);
      } finally {
        state.busy = false;
        render();
      }
    });
  }

  const btnAgain = document.getElementById('result-again');
  if (btnAgain) {
    btnAgain.addEventListener('click', () => {
      state.done = null;
      state.panelMessage = null;
      render();
    });
  }

  const btnOpenAgain = document.getElementById('result-open');
  if (btnOpenAgain) {
    btnOpenAgain.addEventListener('click', () => {
      if (state.done?.kind === 'pin') openUrl(state.done.openUrl);
    });
  }
}

async function init(): Promise<void> {
  listen();
  onMessage(async (msg) => {
    if (msg.type === 'selection') {
      const prevId = state.selection.valid ? state.selection.id : undefined;
      state.selection = msg.selection;
      state.documentName = msg.documentName;
      state.figmaFileKey = msg.fileKey;
      const nextId = msg.selection.valid ? msg.selection.id : undefined;
      if (nextId !== prevId) {
        setThumb(null);
        state.done = null;
      }
      await updateFileKey();
      render();
    } else if (msg.type === 'thumb') {
      if (state.selection.valid && state.selection.id === msg.id) {
        setThumb(msg.png);
        render();
      }
    }
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => fit()).observe(document.body);
  document.addEventListener('click', (e) => {
    if (!state.wsMenuOpen) return;
    const el = e.target as Element | null;
    if (el && el.closest('#ws-menu, #ws')) return;
    state.wsMenuOpen = false;
    render();
  });
  document.addEventListener('keydown', (e) => {
    if (!state.wsMenuOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      state.wsMenuOpen = false;
      render();
      document.getElementById('ws')?.focus();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = menuItems();
      if (!items.length) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : i <= 0 ? items.length - 1 : i - 1;
      items[next]!.focus();
    }
  });

  const storedLang = await storage.get<string>('pinsay:lang');
  setLang(detectLang(storedLang, navigator.language));

  state.branding = await getBranding();
  session = new Session(storage);

  send({ type: 'ready' });

  const hasSession = await session.load();
  if (hasSession) {
    await loadProjects();
  } else {
    state.screen = 'signedOut';
    render();
  }
}

init();
