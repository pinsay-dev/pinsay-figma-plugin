import { describe, it, expect, beforeEach } from 'vitest';
import { attachPanel, header, selectionCard, pinPanel, resultPanel, signedOut, wsMenu, blockedPanel } from '../src/ui/view';
import { setLang, t } from '../src/ui/i18n';
import type { CommentItem } from '../src/ui/api';

describe('view', () => {
  beforeEach(() => {
    setLang('en');
  });

  it('(a) attachPanel escapes HTML in body and route', () => {
    const item: CommentItem = {
      id: 1,
      number: 42,
      body: '<img src=x onerror=alert(1)>',
      route: '/a"b',
      statusKey: 'open',
      authorName: 'Test',
    };
    const html = attachPanel({
      query: '',
      results: [item],
      selectedId: null,
      note: '',
      canSubmit: true,
      busy: false,
      message: null,
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('/a&quot;b');
  });

  it('(b) header: main row has initials, name, lang and signout; signed-out header has only lang', () => {
    const html = header({ name: 'Sara Ali', email: 'sara@x.dev' });
    expect(html).not.toContain('<img');
    expect(html).toContain('Sara Ali');
    expect(html).toContain('>SA<');
    expect(html).toContain('title="sara@x.dev"');
    expect(html).toContain('id="signout"');
    expect(html).toContain('id="lang"');
    const bare = header(null);
    expect(bare).toContain('id="lang"');
    expect(bare).not.toContain('id="signout"');
  });

  it('(c) selectionCard renders reason in current language', () => {
    const htmlEn = selectionCard({ valid: false, reason: 'nested' }, null);
    expect(htmlEn).toContain(t('sel.nested'));

    setLang('ar');
    const htmlAr = selectionCard({ valid: false, reason: 'nested' }, null);
    expect(htmlAr).toContain(t('sel.nested'));
    expect(htmlAr).toContain('حدّد الإطار أو المكوّن كاملًا');
  });

  it('(d) attachPanel renders #attach button disabled when canSubmit is false', () => {
    const html = attachPanel({
      query: '',
      results: [],
      selectedId: null,
      note: '',
      canSubmit: false,
      busy: false,
      message: null,
    });
    expect(html).toMatch(/<button id="attach"[^>]*disabled/);
  });

  it('(e) pinPanel with empty envs contains env.none text with product replaced', () => {
    const html = pinPanel({
      envs: [],
      envUrl: null,
      note: '',
      canSubmit: false,
      busy: false,
      message: null,
      productName: 'AcmeApp',
    });
    expect(html).toContain(t('env.none', { product: 'AcmeApp' }));
    expect(html).toContain('AcmeApp');
  });

  it('(f) selectionCard shows the thumbnail when given, the frame glyph when not', () => {
    const sel = { valid: true, id: '1:2', name: 'Card <b>', type: 'FRAME', width: 258, height: 72 };
    expect(selectionCard(sel, 'blob:abc')).toContain('<img src="blob:abc"');
    const noThumb = selectionCard(sel, null);
    expect(noThumb).not.toContain('<img');
    expect(noThumb).toContain('<svg');
    expect(noThumb).toContain('Card &lt;b&gt;');
    expect(noThumb).toContain('258 × 72');
  });

  it('(g) resultPanel escapes the title and shows "open again" only with a URL', () => {
    const pin = resultPanel({ kind: 'pin', title: '<x>', detail: 'd', openUrl: 'https://x.dev' });
    expect(pin).toContain('&lt;x&gt;');
    expect(pin).toContain('id="result-open"');
    expect(pin).toContain('id="result-again"');
    const attach = resultPanel({ kind: 'attach', title: 'ok', detail: null, openUrl: null });
    expect(attach).not.toContain('id="result-open"');
    expect(attach).toContain('id="result-again"');
  });

  it('(h) signedOut shows the branding logo, or the product name without one', () => {
    const withLogo = signedOut({ productName: 'Acme', primaryColor: '#000', logoUrl: 'https://x.dev/l.png' }, null);
    expect(withLogo).toContain('class="brand-logo"');
    const noLogo = signedOut({ productName: 'Acme', primaryColor: '#000', logoUrl: null }, 'oops');
    expect(noLogo).toContain('class="brand-name"');
    expect(noLogo).toContain('role="alert"');
  });

  it('(i) busy submit shows the spinner and stays disabled', () => {
    const html = pinPanel({ envs: [{ name: 'prod', url: 'https://x.dev' }], envUrl: 'https://x.dev', note: '', canSubmit: true, busy: true, message: null });
    expect(html).toMatch(/<button id="pin"[^>]*disabled/);
    expect(html).toContain('class="spinner"');
    expect(html).toContain(t('busy'));
  });

  it('header with a workspace shows the menu button; without one keeps the user name', () => {
    const user = { name: 'Ann', email: 'a@x' };
    const h = header(user, { name: 'Acme Co', open: false });
    expect(h).toContain('id="ws"');
    expect(h).toContain('aria-expanded="false"');
    expect(h).toContain('Acme Co');
    expect(h).toContain('>AC<');
    expect(h).toContain('id="signout"');
    expect(header(user)).toContain('class="user"');
  });

  it('wsMenu marks current, disabled and no-key items and escapes names', () => {
    const w = (id: string, name: string, enabled = true, current = false) => ({ workspaceId: id, name, current, pluginEnabled: enabled });
    const html = wsMenu(
      [w('a', 'A', true, true), w('b', 'B'), w('c', 'C'), w('d', 'D', false), w('e', '<img src=x>')],
      'a',
      (id) => id !== 'c' && id !== 'd',
      { name: 'Ann', email: 'a@x' },
    );
    const item = (id: string) => html.split('<button').find((x) => x.includes(`data-ws="${id}"`))!;
    expect(item('a')).toContain('aria-checked="true"');
    expect(item('d')).toContain('aria-disabled="true"');
    expect(item('d')).toContain(t('ws.off'));
    expect(item('c')).toContain(t('ws.addKey'));
    expect(item('b')).not.toContain('mi-sub');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img src=x&gt;');
  });

  it('blockedPanel is translated', () => {
    setLang('ar');
    expect(blockedPanel()).toContain('تكامل Figma غير مفعل لمساحة العمل هذه.');
  });
});
