import type { Branding, Environment, PluginProject, CommentItem, WorkspaceInfo } from './api';
import type { SelectionInfo } from '../shared/messages';
import { t } from './i18n';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export type PanelMessage = { kind: 'err'; text: string } | null;
export type Result = { kind: 'attach' | 'pin'; title: string; detail: string | null; openUrl: string | null };

const ICON_FRAME =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M5 1.5v13M11 1.5v13M1.5 5h13M1.5 11h13"/></svg>';
const ICON_SEARCH =
  '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><circle cx="5" cy="5" r="3.5"/><path d="M7.7 7.7 10.5 10.5"/></svg>';
const ICON_CHECK =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';
const ICON_CHEVRON =
  '<svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M1.5 3l2.5 2.5L6.5 3"/></svg>';
const ICON_TICK =
  '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2.5 6.5l2.5 2.5 4.5-5.5"/></svg>';
const SPINNER = '<span class="spinner" aria-hidden="true"></span>';

function initials(name: string): string {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  const s = parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return s || '?';
}

function langButton(): string {
  return `<button id="lang" class="ghost">${esc(t('lang.toggle'))}</button>`;
}

/** Main screen: one compact row. Other screens (user null): only the language button. */
export type HeaderWs = { name: string; open: boolean };
export function header(user: { name: string; email: string | null } | null, ws: HeaderWs | null = null): string {
  if (!user) return `<header class="hd hd-bare">${langButton()}</header>`;
  if (ws) {
    return (
      `<header class="hd">` +
      `<span class="avatar ws-avatar" aria-hidden="true">${esc(initials(ws.name))}</span>` +
      `<button id="ws" class="ws-btn" aria-haspopup="menu" aria-expanded="${ws.open}" aria-controls="ws-menu" title="${esc(t('ws.menuLabel'))}">` +
      `<span class="ws-name">${esc(ws.name)}</span>${ICON_CHEVRON}</button>` +
      langButton() +
      `<button id="signout" class="ghost">${esc(t('header.signout'))}</button>` +
      `</header>`
    );
  }
  return (
    `<header class="hd">` +
    `<span class="avatar" aria-hidden="true">${esc(initials(user.name))}</span>` +
    `<span class="user" title="${esc(user.email ?? user.name)}">${esc(user.name)}</span>` +
    langButton() +
    `<button id="signout" class="ghost">${esc(t('header.signout'))}</button>` +
    `</header>`
  );
}

/** The workspace menu under the header. `hasKey` = the plugin holds a key for that workspace. */
export function wsMenu(
  list: WorkspaceInfo[],
  currentId: string | null,
  hasKey: (id: string) => boolean,
  user: { name: string; email: string | null },
): string {
  const items = list
    .map((w) => {
      const isCurrent = w.workspaceId === currentId || (currentId === null && w.current);
      const off = !w.pluginEnabled;
      const sub = off ? t('ws.off') : !isCurrent && !hasKey(w.workspaceId) ? t('ws.addKey') : '';
      return (
        `<button role="menuitemradio" class="mi" data-ws="${esc(w.workspaceId)}" aria-checked="${isCurrent}"` +
        `${off ? ' aria-disabled="true"' : ''}>` +
        `<span class="mi-tick">${isCurrent ? ICON_TICK : ''}</span>` +
        `<span class="mi-text"><span class="mi-name">${esc(w.name)}</span>` +
        `${sub ? `<span class="mi-sub">${esc(sub)}</span>` : ''}</span></button>`
      );
    })
    .join('');
  return (
    `<div class="menu" id="ws-menu" role="menu" aria-label="${esc(t('ws.heading'))}">` +
    `<p class="menu-cap" title="${esc(user.email ?? user.name)}">${esc(t('ws.signedInAs', { name: user.name }))}</p>` +
    `<div class="menu-sep" role="separator"></div>` +
    `<p class="menu-head">${esc(t('ws.heading'))}</p>${items}</div>`
  );
}

export function blockedPanel(): string {
  return `<section class="card notice" role="status"><p>${esc(t('ws.blocked'))}</p><p class="muted">${esc(t('ws.blockedHint'))}</p></section>`;
}

function brand(b: Branding): string {
  const logo = b.logoUrl ? `<img class="brand-logo" src="${esc(b.logoUrl)}" alt="${esc(b.productName)}">` : '';
  return logo || `<p class="brand-name">${esc(b.productName)}</p>`;
}

export function signedOut(b: Branding, message: string | null): string {
  const title = esc(t('signin.title', { product: b.productName }));
  const body = esc(t('signin.body', { product: b.productName }));
  const btn = esc(t('signin.button', { product: b.productName }));
  const msg = message ? `<p class="msg err" role="alert">${esc(message)}</p>` : '';
  return `<section class="hero">${brand(b)}<h1>${title}</h1><p class="muted">${body}</p>${msg}<button id="signin" class="primary">${btn}</button></section>`;
}

export function deviceCode(b: Branding, code: string): string {
  const pCode = esc(t('signin.code'));
  const btnOpen = esc(t('signin.open', { product: b.productName }));
  const pWait = esc(t('signin.waiting'));
  const btnCancel = esc(t('signin.cancel'));
  return `<section class="hero"><p class="muted">${pCode}</p><div class="code" dir="ltr">${esc(code)}</div><button id="open-browser" class="primary">${btnOpen}</button><p class="muted wait" role="status">${SPINNER}${pWait}</p><button id="cancel" class="ghost">${btnCancel}</button></section>`;
}

export function loading(): string {
  return `<section class="hero loading">${SPINNER}<p class="muted" role="status">${esc(t('loading'))}</p></section>`;
}

/** The frame card: thumbnail + name + size, or the selection hint. `thumbUrl` is a blob: URL or null. */
export function selectionCard(sel: SelectionInfo, thumbUrl: string | null): string {
  if (sel.valid) {
    const name = esc(sel.name ?? '');
    const w = Math.round(sel.width ?? 0);
    const h = Math.round(sel.height ?? 0);
    const size = esc(t('sel.size', { w, h }));
    const thumb = thumbUrl ? `<img src="${esc(thumbUrl)}" alt="">` : ICON_FRAME;
    return `<div class="sel ok"><div class="thumb">${thumb}</div><div class="sel-meta"><strong class="sel-name" title="${name}">${name}</strong><span class="muted" dir="ltr">${size}</span></div></div>`;
  }
  const hint = esc(t(`sel.${sel.reason ?? 'none'}`));
  return `<div class="sel hint"><div class="thumb empty">${ICON_FRAME}</div><p class="muted">${hint}</p></div>`;
}

export function fileLinkRow(fileKeyKnown: boolean, error: string | null): string {
  if (fileKeyKnown) {
    return `<div class="file-ok"><span class="muted">${esc(t('file.linked'))}</span><button id="file-change" class="ghost sm">${esc(t('file.change'))}</button></div>`;
  }
  const label = esc(t('file.label'));
  const help = esc(t('file.help'));
  const save = esc(t('file.save'));
  const errLine = error ? `<p class="msg err" role="alert">${esc(error)}</p>` : '';
  return `<div class="file-row"><label for="file-link">${label}</label><div class="inline"><input id="file-link" type="url" dir="ltr" placeholder="https://www.figma.com/design/…"><button id="file-save" class="secondary">${save}</button></div><p class="muted help">${help}</p>${errLine}</div>`;
}

export function frameCard(sel: SelectionInfo, thumbUrl: string | null, fileKeyKnown: boolean, fileError: string | null): string {
  return `<section class="card">${selectionCard(sel, thumbUrl)}${fileLinkRow(fileKeyKnown, fileError)}</section>`;
}

export function projectSelect(projects: PluginProject[], selectedKey: string | null): string {
  if (projects.length === 0) {
    return `<p class="muted">${esc(t('project.none'))}</p>`;
  }
  const opts = projects
    .map((p) => `<option value="${esc(p.key)}"${p.key === selectedKey ? ' selected' : ''}>${esc(p.name)}</option>`)
    .join('');
  return `<div class="field"><label for="project">${esc(t('project.label'))}</label><select id="project">${opts}</select></div>`;
}

export function tabs(active: 'attach' | 'pin'): string {
  return `<div class="seg" role="tablist"><button role="tab" data-tab="attach" aria-selected="${active === 'attach'}">${esc(t('tab.attach'))}</button><button role="tab" data-tab="pin" aria-selected="${active === 'pin'}">${esc(t('tab.pin'))}</button></div>`;
}

function noteField(note: string): string {
  return `<div class="field"><label for="note">${esc(t('note.label'))}</label><textarea id="note" maxlength="2000" placeholder="${esc(t('note.placeholder'))}">${esc(note)}</textarea></div>`;
}

function submit(id: 'attach' | 'pin', label: string, canSubmit: boolean, busy: boolean, message: PanelMessage): string {
  const msg = message ? `<p class="msg err" role="alert">${esc(message.text)}</p>` : '';
  const inner = busy ? `${SPINNER}${esc(t('busy'))}` : esc(label);
  return `${msg}<button id="${id}" class="primary"${canSubmit && !busy ? '' : ' disabled'}${busy ? ' aria-busy="true"' : ''}>${inner}</button>`;
}

export function attachPanel(s: {
  query: string;
  results: CommentItem[];
  selectedId: number | null;
  note: string;
  canSubmit: boolean;
  busy: boolean;
  message: PanelMessage;
}): string {
  const searchInput = `<div class="search">${ICON_SEARCH}<input id="search" type="search" placeholder="${esc(t('search.placeholder'))}" value="${esc(s.query)}" aria-label="${esc(t('search.placeholder'))}"></div>`;
  let listPart = '';
  if (s.results.length === 0) {
    listPart = `<p class="muted empty">${esc(t('search.empty'))}</p>`;
  } else {
    const items = s.results
      .map(
        (item) =>
          `<li role="option" data-id="${item.id}" aria-selected="${item.id === s.selectedId}"><span class="row"><span class="num" dir="ltr">#${item.number}</span><span class="route" dir="ltr">${esc(item.route)}</span></span><span class="snip" dir="auto">${esc(item.body)}</span></li>`,
      )
      .join('');
    listPart = `<ul class="list" role="listbox">${items}</ul>`;
  }
  return `<div class="panel attach-panel">${searchInput}${listPart}${noteField(s.note)}${submit('attach', t('attach.button'), s.canSubmit, s.busy, s.message)}</div>`;
}

export function pinPanel(s: {
  envs: Environment[];
  envUrl: string | null;
  note: string;
  canSubmit: boolean;
  busy: boolean;
  message: PanelMessage;
  productName?: string;
}): string {
  const envPart =
    s.envs.length === 0
      ? `<p class="muted">${esc(t('env.none', { product: s.productName ?? 'PinSay' }))}</p>`
      : `<div class="field"><label for="env">${esc(t('env.label'))}</label><select id="env">${s.envs
          .map(
            (e) =>
              `<option value="${esc(e.url)}"${e.url === s.envUrl ? ' selected' : ''}>${esc(e.name)} — ${esc(e.url)}</option>`,
          )
          .join('')}</select></div>`;
  return `<div class="panel pin-panel">${envPart}${noteField(s.note)}${submit('pin', t('pin.button'), s.canSubmit, s.busy, s.message)}</div>`;
}

/** Shown in place of the tab panel after a successful send. */
export function resultPanel(r: Result): string {
  const detail = r.detail ? `<p class="muted">${esc(r.detail)}</p>` : '';
  const open = r.openUrl ? `<button id="result-open" class="secondary">${esc(t('pin.openAgain'))}</button>` : '';
  return `<div class="panel result" role="status"><div class="result-icon">${ICON_CHECK}</div><p class="result-title">${esc(r.title)}</p>${detail}<div class="result-actions">${open}<button id="result-again" class="primary">${esc(t('result.again'))}</button></div></div>`;
}
