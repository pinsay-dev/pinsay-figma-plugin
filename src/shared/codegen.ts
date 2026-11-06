// Pure code generator: turns a CodeNode tree into the specs v2 text (HTML + Tailwind, HTML + CSS with variables).
export type Paint = { color?: string; token?: string; gradient?: string; image?: boolean };
// color: lowercase '#rrggbb' or '#rrggbbaa'. token: CSS custom property name incl. leading '--'. gradient: CSS value.
export type Layout = {
  mode: 'row' | 'col'; gap: number; wrap: boolean;
  justify: 'start' | 'center' | 'end' | 'between';
  align: 'start' | 'center' | 'end' | 'baseline';
  pt: number; pr: number; pb: number; pl: number;
};
export type Sizing = 'fixed' | 'hug' | 'fill';
export type TextInfo = {
  characters: string; fontFamily?: string; fontSize: number; fontWeight: number;
  lineHeightPx?: number; letterSpacingPx?: number; align: 'left' | 'center' | 'right' | 'justify'; color?: Paint;
};
export type CodeNode = {
  name: string; type: string; // Figma node type: FRAME, TEXT, RECTANGLE, ...
  x: number; y: number; width: number; height: number; opacity: number;
  layout?: Layout; sizingH?: Sizing; sizingV?: Sizing;
  absolute: boolean; // positioned absolutely inside its parent
  fill?: Paint; stroke?: { color?: string; token?: string; weight: number };
  radius?: number | [number, number, number, number]; // [tl, tr, br, bl]
  shadow?: { x: number; y: number; blur: number; spread: number; color: string; inset: boolean };
  text?: TextInfo; // only for TEXT
  css: Record<string, string>; // getCSSAsync() of this node
  children: CodeNode[];
};
export const MAX_DEPTH = 6;
export const MAX_NODES = 100;
export const DEFAULT_MAX_SPECS_CHARS = 32 * 1024;
export const SPECS_V2_HEADER = 'PinSay Figma specs v2';

export function clean(s: string): string {
  // Control characters out (newlines become spaces): names are one line each.
  return s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
}

function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function px(n: number): string {
  return `${num(n)}px`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function textHtml(s: string): string {
  return escapeHtml(s.trim()).replace(/\r\n?|\n|\u2028|\u2029/g, '<br>');
}

function slug(name: string): string {
  let s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  s = s.slice(0, 24).replace(/-+$/, '');
  if (!s) return 'n';
  if (!/^[a-z]/.test(s)) return `n-${s}`;
  return s;
}

const SCALE = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96];

function tw(n: number): string {
  const q = n / 4;
  return SCALE.includes(q) ? num(q) : `[${px(n)}]`;
}

type ColorLike = { color?: string; token?: string; gradient?: string };

function twColor(prefix: 'bg' | 'text' | 'border', p: ColorLike | undefined): string {
  if (!p) return '';
  if (p.token) return `${prefix}-[var(${p.token})]`;
  if (prefix === 'bg' && p.gradient) return `bg-[${p.gradient.replace(/\s+/g, '_')}]`;
  if (!p.color) return '';
  if (p.color === '#ffffff') return `${prefix}-white`;
  if (p.color === '#000000') return `${prefix}-black`;
  return `${prefix}-[${p.color}]`;
}

const SVG_TYPES = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'LINE'];
const BOX_TYPES = ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'GROUP'];

function tagOf(node: CodeNode, parentTag: string | undefined, isRoot: boolean): string {
  if (node.type === 'TEXT') {
    const t = node.text;
    if (parentTag === 'button') return 'span';
    if (t && t.fontSize >= 32) return 'h1';
    if (t && t.fontSize >= 24) return 'h2';
    if (t && t.fontSize >= 20 && t.fontWeight >= 600) return 'h3';
    if (/\b(label|caption|tag|badge)\b/i.test(node.name)) return 'span';
    return 'p';
  }
  if (node.fill?.image === true) return 'img';
  if (SVG_TYPES.includes(node.type)) return 'svg';
  if (BOX_TYPES.includes(node.type) && /\b(button|btn|cta)\b/i.test(node.name) && parentTag !== 'button') return 'button';
  if (isRoot) return 'section';
  return 'div';
}

type Info = { index: number; parent?: CodeNode; tag: string };

function prepare(root: CodeNode): Map<CodeNode, Info> {
  const map = new Map<CodeNode, Info>();
  let i = 0;
  const walk = (n: CodeNode, parent: CodeNode | undefined) => {
    i += 1;
    const parentTag = parent ? map.get(parent)!.tag : undefined;
    map.set(n, { index: i, parent, tag: tagOf(n, parentTag, !parent) });
    for (const c of n.children) walk(c, n);
  };
  walk(root, undefined);
  return map;
}

function html(root: CodeNode, info: Map<CodeNode, Info>, classOf: (n: CodeNode) => string): string {
  const lines: string[] = [];
  const walk = (node: CodeNode, depth: number) => {
    const ind = '  '.repeat(depth);
    const tag = info.get(node)!.tag;
    const c = classOf(node);
    const attr = c ? ` class="${escapeHtml(c)}"` : '';
    if (tag === 'img') {
      lines.push(`${ind}<img${attr} src="" alt="${escapeHtml(node.name)}">`);
    } else if (tag === 'svg') {
      lines.push(`${ind}<svg${attr} width="${num(node.width)}" height="${num(node.height)}" role="img" aria-label="${escapeHtml(node.name)}"></svg>`);
    } else if (node.type === 'TEXT' && node.text) {
      lines.push(`${ind}<${tag}${attr}>${textHtml(node.text.characters)}</${tag}>`);
    } else {
      const open = tag === 'button' ? `<button type="button"${attr}>` : `<${tag}${attr}>`;
      if (!node.children.length) {
        lines.push(`${ind}${open}</${tag}>`);
      } else {
        lines.push(`${ind}${open}`);
        for (const ch of node.children) walk(ch, depth + 1);
        lines.push(`${ind}</${tag}>`);
      }
    }
  };
  walk(root, 0);
  return lines.join('\n');
}

const RADIUS: Record<number, string> = { 2: 'rounded-sm', 4: 'rounded', 6: 'rounded-md', 8: 'rounded-lg', 12: 'rounded-xl', 16: 'rounded-2xl', 24: 'rounded-3xl' };
const TEXT_SIZE: Record<number, string> = { 12: 'text-xs', 14: 'text-sm', 16: 'text-base', 18: 'text-lg', 20: 'text-xl', 24: 'text-2xl', 30: 'text-3xl', 36: 'text-4xl', 48: 'text-5xl', 60: 'text-6xl' };
const WEIGHT: Record<number, string> = { 100: 'thin', 200: 'extralight', 300: 'light', 400: 'normal', 500: 'medium', 600: 'semibold', 700: 'bold', 800: 'extrabold', 900: 'black' };

function twClasses(node: CodeNode, parent: CodeNode | undefined, tag: string): string {
  const out: string[] = [];
  const l = node.layout;
  if (l) {
    out.push('flex', l.mode === 'row' ? 'flex-row' : 'flex-col');
    if (l.wrap) out.push('flex-wrap');
    if (l.gap > 0) out.push(`gap-${tw(l.gap)}`);
    if (l.justify === 'center') out.push('justify-center');
    else if (l.justify === 'end') out.push('justify-end');
    else if (l.justify === 'between') out.push('justify-between');
    out.push({ start: 'items-start', center: 'items-center', end: 'items-end', baseline: 'items-baseline' }[l.align]);
    if (l.pt === l.pr && l.pr === l.pb && l.pb === l.pl && l.pt > 0) out.push(`p-${tw(l.pt)}`);
    else if (l.pt === l.pb && l.pl === l.pr) {
      if (l.pt > 0) out.push(`py-${tw(l.pt)}`);
      if (l.pl > 0) out.push(`px-${tw(l.pl)}`);
    } else {
      if (l.pt > 0) out.push(`pt-${tw(l.pt)}`);
      if (l.pr > 0) out.push(`pr-${tw(l.pr)}`);
      if (l.pb > 0) out.push(`pb-${tw(l.pb)}`);
      if (l.pl > 0) out.push(`pl-${tw(l.pl)}`);
    }
  }
  const pr = parent?.layout?.mode;
  const isText = node.type === 'TEXT';
  const sizing: string[] = [];
  if (node.sizingH === 'fixed') sizing.push(`w-[${px(node.width)}]`);
  else if (node.sizingH === 'fill') sizing.push(pr === 'row' ? 'flex-1' : 'w-full');
  else if (node.sizingH === undefined && !isText) sizing.push(`w-[${px(node.width)}]`);
  if (node.sizingV === 'fixed') sizing.push(`h-[${px(node.height)}]`);
  else if (node.sizingV === 'fill') sizing.push(pr === 'col' ? 'flex-1' : 'h-full');
  else if (node.sizingV === undefined && !isText) sizing.push(`h-[${px(node.height)}]`);
  for (const s of sizing) if (!(s === 'flex-1' && out.includes('flex-1'))) out.push(s);
  if (node.children.some((c) => c.absolute)) out.push('relative');
  if (node.absolute) out.push(`absolute left-[${px(node.x)}] top-[${px(node.y)}]`);
  if (!isText && tag !== 'img') out.push(twColor('bg', node.fill));
  const st = node.stroke;
  if (st && st.weight > 0) {
    out.push(st.weight === 1 ? 'border' : `border-[${px(st.weight)}]`);
    out.push(twColor('border', st));
  }
  const r = node.radius;
  if (typeof r === 'number') {
    if (r >= 9999) out.push('rounded-full');
    else if (r !== 0) out.push(RADIUS[r] ?? `rounded-[${px(r)}]`);
  } else if (r) {
    (['tl', 'tr', 'br', 'bl'] as const).forEach((k, i) => {
      if (r[i] > 0) out.push(`rounded-${k}-[${px(r[i])}]`);
    });
  }
  const sh = node.shadow;
  if (sh) out.push(`shadow-[${sh.inset ? 'inset_' : ''}${px(sh.x)}_${px(sh.y)}_${px(sh.blur)}_${px(sh.spread)}_${sh.color}]`);
  if (node.opacity < 1) {
    const p = Math.round(node.opacity * 100);
    out.push(p % 5 === 0 ? `opacity-${p}` : `opacity-[${num(node.opacity)}]`);
  }
  const t = node.text;
  if (isText && t) {
    out.push(TEXT_SIZE[t.fontSize] ?? `text-[${px(t.fontSize)}]`);
    out.push(WEIGHT[t.fontWeight] ? `font-${WEIGHT[t.fontWeight]}` : `font-[${t.fontWeight}]`);
    if (t.fontFamily) out.push(`font-['${t.fontFamily.replace(/'/g, '').replace(/ /g, '_')}']`);
    if (t.lineHeightPx !== undefined) out.push(`leading-[${px(t.lineHeightPx)}]`);
    if (t.letterSpacingPx !== undefined && t.letterSpacingPx !== 0) out.push(`tracking-[${px(t.letterSpacingPx)}]`);
    if (t.align === 'center') out.push('text-center');
    else if (t.align === 'right') out.push('text-right');
    else if (t.align === 'justify') out.push('text-justify');
    out.push(twColor('text', t.color ?? node.fill));
  }
  return out.filter(Boolean).join(' ');
}

function tailwindOutput(root: CodeNode): string {
  const info = prepare(root);
  return html(root, info, (n) => twClasses(n, info.get(n)!.parent, info.get(n)!.tag));
}

const SPACE_KEYS = ['gap', 'row-gap', 'column-gap', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'];
const RADIUS_KEYS = ['border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'];
const COLOR_KEYS = ['background', 'background-color', 'color', 'border', 'border-color', 'border-top', 'border-right', 'border-bottom', 'border-left', 'outline', 'fill', 'stroke'];

type Group = Map<string, { name: string; value: string }>;

function cssOutput(root: CodeNode): string {
  const info = prepare(root);
  const tokens = new Map<string, string>();
  const groups: Record<'color' | 'space' | 'radius' | 'font' | 'shadow', Group> = {
    color: new Map(), space: new Map(), radius: new Map(), font: new Map(), shadow: new Map(),
  };
  const reg = (g: keyof typeof groups, literal: string): string => {
    const key = literal.toLowerCase();
    let e = groups[g].get(key);
    if (!e) {
      e = { name: `--${g}-${groups[g].size + 1}`, value: literal };
      groups[g].set(key, e);
    }
    return `var(${e.name})`;
  };
  const rules: string[] = [];
  const className = (n: CodeNode) => `${slug(n.name)}-${info.get(n)!.index}`;
  const walk = (node: CodeNode) => {
    const decls: string[] = [];
    for (const k of Object.keys(node.css).sort()) {
      let v = node.css[k];
      if (!v) continue;
      for (const m of v.matchAll(/var\((--[A-Za-z0-9_-]+)\s*,\s*([^)]*)\)/g)) {
        if (!tokens.has(m[1])) tokens.set(m[1], m[2].trim());
      }
      if (!v.includes('var(')) {
        if (k === 'box-shadow') v = reg('shadow', v);
        else if (SPACE_KEYS.includes(k)) v = reg('space', v);
        else if (RADIUS_KEYS.includes(k)) v = reg('radius', v);
        else if (k === 'font-family') v = reg('font', v);
        else if (COLOR_KEYS.includes(k)) v = v.replace(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g, (m) => reg('color', m));
      }
      decls.push(`${k}: ${v}`);
    }
    const hasPos = 'position' in node.css;
    if (node.absolute && !hasPos) decls.push('position: absolute', `left: ${px(node.x)}`, `top: ${px(node.y)}`);
    if (node.children.some((c) => c.absolute) && !hasPos) decls.push('position: relative');
    if (decls.length) rules.push(`  .${className(node)} { ${decls.join('; ')}; }`);
    for (const c of node.children) walk(c);
  };
  walk(root);
  const vars: string[] = [];
  for (const [name, value] of tokens) vars.push(`    ${name}: ${value};`);
  for (const g of Object.values(groups)) for (const e of g.values()) vars.push(`    ${e.name}: ${e.value};`);
  const lines = ['<style>'];
  if (vars.length) lines.push('  :root {', ...vars, '  }');
  lines.push(...rules, '</style>', html(root, info, className));
  return lines.join('\n');
}

function count(n: CodeNode): number {
  return 1 + n.children.reduce((s, c) => s + count(c), 0);
}

function prune(root: CodeNode, limit: number): CodeNode {
  let left = limit;
  const walk = (n: CodeNode): CodeNode => {
    left -= 1;
    const children: CodeNode[] = [];
    for (const c of n.children) {
      if (left <= 0) break;
      children.push(walk(c));
    }
    return { ...n, children };
  };
  return walk(root);
}

export function buildSpecsV2(root: CodeNode, frameName: string, maxChars = DEFAULT_MAX_SPECS_CHARS): string {
  const total = count(root);
  const head = [SPECS_V2_HEADER, `Frame: ${clean(frameName)}`, `Size: ${Math.round(root.width)} × ${Math.round(root.height)}`];
  const render = (limit: number): string => {
    const t = prune(root, limit);
    const note = limit < total ? `\n<!-- truncated: ${limit} of ${total} layers -->` : '';
    return [...head, '', '--- HTML + Tailwind ---', tailwindOutput(t) + note, '', '--- HTML + CSS ---', cssOutput(t) + note].join('\n');
  };
  let limit = total;
  let out = render(limit);
  while (out.length > maxChars && limit > 1) {
    limit = Math.max(1, Math.floor(limit * 0.75));
    out = render(limit);
  }
  if (out.length > maxChars) return head.join('\n');
  return out;
}
