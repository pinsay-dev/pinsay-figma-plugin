import { describe, it, expect } from 'vitest';
import { buildSpecsV2, type CodeNode } from '../src/shared/codegen';

const base = (o: Partial<CodeNode> & { name: string; type: string; width: number; height: number }): CodeNode => ({
  x: 0, y: 0, opacity: 1, absolute: false, css: {}, children: [], ...o,
});

const text = (name: string, characters: string, fontSize = 16, fontWeight = 400): CodeNode =>
  base({ name, type: 'TEXT', width: 100, height: 20, sizingH: 'hug', sizingV: 'hug', text: { characters, fontSize, fontWeight, align: 'left' } });

const frame = (children: CodeNode[], o: Partial<CodeNode> = {}): CodeNode =>
  base({ name: 'Root', type: 'FRAME', width: 100, height: 100, children, ...o });

const card = (): CodeNode =>
  base({
    name: 'Card', type: 'FRAME', width: 320, height: 180,
    layout: { mode: 'col', gap: 16, wrap: false, justify: 'start', align: 'start', pt: 24, pr: 24, pb: 24, pl: 24 },
    sizingH: 'fixed', sizingV: 'hug', fill: { color: '#ffffff' }, stroke: { color: '#e5e7eb', weight: 1 }, radius: 12,
    css: { display: 'flex', 'flex-direction': 'column', gap: '16px', padding: '24px', 'border-radius': '12px', border: '1px solid #E5E7EB', background: '#FFF' },
    children: [
      base({
        name: 'Title', type: 'TEXT', width: 200, height: 28, sizingH: 'hug', sizingV: 'hug',
        text: { characters: 'Upgrade to Pro', fontFamily: 'Inter', fontSize: 20, fontWeight: 700, align: 'left', color: { color: '#111827' } },
        css: { color: '#111827', 'font-family': 'Inter', 'font-size': '20px', 'font-weight': '700' },
      }),
      base({
        name: 'CTA Button', type: 'FRAME', width: 120, height: 40,
        layout: { mode: 'row', gap: 8, wrap: false, justify: 'center', align: 'center', pt: 10, pr: 20, pb: 10, pl: 20 },
        sizingH: 'hug', sizingV: 'hug', fill: { color: '#6d28d9', token: '--brand' }, radius: 8,
        css: { display: 'flex', padding: '10px 20px', 'justify-content': 'center', 'align-items': 'center', gap: '8px', 'border-radius': '8px', background: 'var(--brand, #6D28D9)' },
        children: [
          base({
            name: 'Label', type: 'TEXT', width: 60, height: 20, sizingH: 'hug', sizingV: 'hug',
            text: { characters: 'Get & Go', fontSize: 14, fontWeight: 600, align: 'left', color: { color: '#ffffff' } },
            css: { color: '#FFF', 'font-size': '14px', 'font-weight': '600' },
          }),
        ],
      }),
    ],
  });

function parts(out: string) {
  const lines = out.split('\n');
  const a = lines.indexOf('--- HTML + Tailwind ---');
  const b = lines.indexOf('--- HTML + CSS ---');
  return { tailwind: lines.slice(a + 1, b - 1).join('\n'), css: lines.slice(b + 1).join('\n') };
}

const tw = (n: CodeNode) => parts(buildSpecsV2(n, 'x')).tailwind;
const css = (n: CodeNode) => parts(buildSpecsV2(n, 'x')).css;

describe('codegen: buildSpecsV2', () => {
  it('renders the card fixture exactly', () => {
    const out = buildSpecsV2(card(), 'Card');
    expect(out.split('\n').slice(0, 3)).toEqual(['PinSay Figma specs v2', 'Frame: Card', 'Size: 320 × 180']);
    const p = parts(out);
    expect(p.tailwind).toBe(`<section class="flex flex-col gap-4 items-start p-6 w-[320px] bg-white border border-[#e5e7eb] rounded-xl">
  <h3 class="text-xl font-bold font-['Inter'] text-[#111827]">Upgrade to Pro</h3>
  <button type="button" class="flex flex-row gap-2 justify-center items-center py-2.5 px-5 bg-[var(--brand)] rounded-lg">
    <span class="text-sm font-semibold text-white">Get &amp; Go</span>
  </button>
</section>`);
    expect(p.css).toBe(`<style>
  :root {
    --brand: #6D28D9;
    --color-1: #FFF;
    --color-2: #E5E7EB;
    --color-3: #111827;
    --space-1: 16px;
    --space-2: 24px;
    --space-3: 8px;
    --space-4: 10px 20px;
    --radius-1: 12px;
    --radius-2: 8px;
    --font-1: Inter;
  }
  .card-1 { background: var(--color-1); border: 1px solid var(--color-2); border-radius: var(--radius-1); display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2); }
  .title-2 { color: var(--color-3); font-family: var(--font-1); font-size: 20px; font-weight: 700; }
  .cta-button-3 { align-items: center; background: var(--brand, #6D28D9); border-radius: var(--radius-2); display: flex; gap: var(--space-3); justify-content: center; padding: var(--space-4); }
  .label-4 { color: var(--color-1); font-size: 14px; font-weight: 600; }
</style>
<section class="card-1">
  <h3 class="title-2">Upgrade to Pro</h3>
  <button type="button" class="cta-button-3">
    <span class="label-4">Get &amp; Go</span>
  </button>
</section>`);
  });

  it('picks heading and span tags for text', () => {
    expect(tw(frame([text('T', 'a', 32)]))).toContain('<h1');
    expect(tw(frame([text('T', 'a', 24)]))).toContain('<h2');
    expect(tw(frame([text('T', 'a', 16, 400)]))).toContain('<p');
    expect(tw(frame([text('Caption', 'a', 12)]))).toContain('<span');
  });

  it('escapes text and turns newlines into br on one line', () => {
    const out = tw(frame([text('T', '<b>"x"</b>\nline2')]));
    const line = out.split('\n').find((l) => l.includes('line2'))!;
    expect(line).toContain('&lt;b&gt;&quot;x&quot;&lt;/b&gt;<br>line2');
  });

  it('renders img and svg', () => {
    const img = tw(frame([base({ name: 'Photo', type: 'RECTANGLE', width: 10, height: 10, fill: { image: true, color: '#ff0000' } })]));
    expect(img).toMatch(/<img class="[^"]*" src="" alt="Photo">/);
    expect(img).not.toMatch(/<img[^>]*bg-/);
    const svg = tw(frame([base({ name: 'Icon', type: 'VECTOR', width: 10, height: 10 })]));
    expect(svg).toMatch(/<svg [^>]*role="img" aria-label="Icon"><\/svg>/);
  });

  it('handles absolute children', () => {
    const n = frame([base({ name: 'Kid', type: 'RECTANGLE', width: 5, height: 5, absolute: true, x: 10, y: 20 })]);
    const t = tw(n).split('\n');
    expect(t[0]).toContain('relative');
    expect(t[1]).toContain('absolute left-[10px] top-[20px]');
    const c = css(n);
    expect(c).toContain('position: absolute; left: 10px; top: 20px; }');
    expect(c).toContain('position: relative; }');
  });

  it('uses the spacing scale', () => {
    const lay = (gap: number, pt: number, pr: number, pb: number, pl: number) =>
      frame([], { layout: { mode: 'row', gap, wrap: false, justify: 'start', align: 'start', pt, pr, pb, pl } });
    expect(tw(lay(13, 0, 0, 0, 0))).toContain('gap-[13px]');
    expect(tw(lay(0, 4, 8, 4, 8))).toContain('py-1 px-2');
    expect(tw(lay(0, 1, 2, 3, 4))).toContain('pt-[1px] pr-0.5 pb-[3px] pl-1');
  });

  it('handles radius', () => {
    expect(tw(frame([], { radius: [4, 4, 0, 0] }))).toContain('rounded-tl-[4px] rounded-tr-[4px]');
    expect(tw(frame([], { type: 'ELLIPSE', radius: 9999 }))).toContain('rounded-full');
  });

  it('handles shadow', () => {
    const n = frame([], {
      shadow: { x: 0, y: 4, blur: 12, spread: 0, color: '#0000001a', inset: false },
      css: { 'box-shadow': '0 4px 12px rgba(0,0,0,0.1)' },
    });
    expect(tw(n)).toContain('shadow-[0px_4px_12px_0px_#0000001a]');
    expect(css(n)).toContain('box-shadow: var(--shadow-1)');
    expect(css(n)).toContain('--shadow-1: 0 4px 12px rgba(0,0,0,0.1);');
  });

  it('handles opacity', () => {
    expect(tw(frame([], { opacity: 0.5 }))).toContain('opacity-50');
    expect(tw(frame([], { opacity: 0.33 }))).toContain('opacity-[0.33]');
  });

  it('fits to size by pruning layers', () => {
    const kids = Array.from({ length: 150 }, (_, i) => text(`T${i}`, 'x'.repeat(300)));
    const out = buildSpecsV2(frame(kids), 'Big', 8000);
    expect(out.length).toBeLessThanOrEqual(8000);
    const p = parts(out);
    for (const s of [p.tailwind, p.css]) {
      const last = s.split('\n').pop()!;
      expect(last).toMatch(/^<!-- truncated: \d+ of 151 layers -->$/);
    }
    expect((out.match(/<p/g) ?? []).length).toBe((out.match(/<\/p>/g) ?? []).length);
    expect(out).toContain('</section>');
  });

  it('falls back to the header when nothing fits', () => {
    const out = buildSpecsV2(card(), 'Card', 60);
    expect(out).toBe(['PinSay Figma specs v2', 'Frame: Card', 'Size: 320 × 180'].join('\n'));
  });

  it('keeps section markers unique', () => {
    const out = buildSpecsV2(frame([text('T', '--- HTML + CSS ---')]), 'x');
    expect(out.split('\n').filter((l) => l === '--- HTML + CSS ---')).toHaveLength(1);
  });
});
