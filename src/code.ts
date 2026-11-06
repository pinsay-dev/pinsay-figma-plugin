// Figma sandbox side. Runs inside Figma with the plugin API; no network here (the UI iframe does all fetches).
import { describeSelection } from './selection';
import { buildSpecsV2, MAX_DEPTH, MAX_NODES, DEFAULT_MAX_SPECS_CHARS, type CodeNode, type Paint } from './shared/codegen';
import { hex, mapJustify, mapAlign, mapSizing, variableToken } from './tree';
import { STORAGE_KEYS, type ToCode, type ToUi } from './shared/messages';

figma.showUI(__html__, { width: 360, height: 480, themeColors: true });

function post(msg: ToUi): void {
  figma.ui.postMessage(msg);
}

function currentFileKey(): string | null {
  // Only private/organisation plugins get figma.fileKey; Community plugins get undefined (the UI asks for the link).
  const k = (figma as unknown as { fileKey?: string }).fileKey;
  return typeof k === 'string' && k ? k : null;
}

let thumbTimer: ReturnType<typeof setTimeout> | null = null;

/** A small PNG of the selected node for the UI's frame card (longer side 96 px). */
function scheduleThumb(id: string): void {
  if (thumbTimer) clearTimeout(thumbTimer);
  thumbTimer = setTimeout(async () => {
    thumbTimer = null;
    const node = figma.currentPage.selection[0];
    if (!node || node.id !== id || figma.currentPage.selection.length !== 1) return;
    let png: Uint8Array | null = null;
    try {
      const w = 'width' in node ? node.width : 0;
      const h = 'height' in node ? node.height : 0;
      png = await node.exportAsync({
        format: 'PNG',
        constraint: w >= h ? { type: 'WIDTH', value: 96 } : { type: 'HEIGHT', value: 96 },
      });
    } catch {
      png = null;
    }
    const still = figma.currentPage.selection;
    if (still.length !== 1 || still[0]!.id !== id) return;
    post({ type: 'thumb', id, png });
  }, 150);
}

function sendSelection(): void {
  const selection = describeSelection(figma.currentPage.selection as unknown as readonly { id: string; name: string; type: string; width?: number; height?: number }[]);
  post({
    type: 'selection',
    selection,
    documentName: figma.root.name,
    fileKey: currentFileKey(),
  });
  if (selection.valid && selection.id) scheduleThumb(selection.id);
}

function allowedKey(key: string): boolean {
  return (STORAGE_KEYS as readonly string[]).includes(key);
}

const isMixed = (v: unknown): boolean => typeof v === 'symbol';
const NO_CHILDREN = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'LINE', 'TEXT'];

async function tokenOf(paint: { boundVariables?: { color?: { id?: string } } }): Promise<string | undefined> {
  const id = paint.boundVariables?.color?.id;
  if (!id) return undefined;
  try {
    const v = await figma.variables.getVariableByIdAsync(id);
    return v ? variableToken(v.name) : undefined;
  } catch {
    return undefined;
  }
}

async function toCodeTree(root: SceneNode): Promise<CodeNode> {
  let count = 0;
  const walk = async (n: SceneNode, p: SceneNode | null, depth: number): Promise<CodeNode> => {
    count++;
    const any = n as any;
    const parent = p as any;
    let css: Record<string, string> = {};
    try { css = await n.getCSSAsync(); } catch { css = {}; }

    let x = 0;
    let y = 0;
    if (p) {
      x = 'x' in n ? n.x : 0;
      y = 'y' in n ? n.y : 0;
      if (p.type === 'GROUP') { x -= parent.x; y -= parent.y; }
    }

    const node: CodeNode = {
      name: n.name,
      type: n.type,
      x, y,
      width: 'width' in n ? n.width : 0,
      height: 'height' in n ? n.height : 0,
      opacity: 'opacity' in n ? n.opacity : 1,
      absolute: false,
      css,
      children: [],
    };

    if ('layoutMode' in n && (any.layoutMode === 'HORIZONTAL' || any.layoutMode === 'VERTICAL')) {
      node.layout = {
        mode: any.layoutMode === 'HORIZONTAL' ? 'row' : 'col',
        gap: any.itemSpacing,
        wrap: any.layoutWrap === 'WRAP',
        justify: mapJustify(any.primaryAxisAlignItems),
        align: mapAlign(any.counterAxisAlignItems),
        pt: any.paddingTop, pr: any.paddingRight, pb: any.paddingBottom, pl: any.paddingLeft,
      };
    }
    if ('layoutSizingHorizontal' in n) node.sizingH = mapSizing(any.layoutSizingHorizontal);
    if ('layoutSizingVertical' in n) node.sizingV = mapSizing(any.layoutSizingVertical);

    if (p) {
      node.absolute =
        ('layoutPositioning' in n && any.layoutPositioning === 'ABSOLUTE') ||
        !('layoutMode' in p) || parent.layoutMode === 'NONE' || parent.layoutMode === 'GRID';
    }

    if ('fills' in n && Array.isArray(any.fills)) {
      const paint = any.fills.find((f: any) => f.visible !== false);
      if (paint) {
        if (paint.type === 'SOLID') {
          const fill: Paint = { color: hex(paint.color, paint.opacity ?? 1) };
          const token = await tokenOf(paint);
          if (token) fill.token = token;
          node.fill = fill;
        } else if (typeof paint.type === 'string' && paint.type.startsWith('GRADIENT_')) {
          if (typeof css.background === 'string' && css.background.includes('gradient(')) node.fill = { gradient: css.background };
        } else if (paint.type === 'IMAGE') {
          node.fill = { image: true };
        }
      }
    }

    if ('strokes' in n && Array.isArray(any.strokes)) {
      const paint = any.strokes.find((f: any) => f.visible !== false && f.type === 'SOLID');
      if (paint) {
        const stroke: NonNullable<CodeNode['stroke']> = {
          color: hex(paint.color, paint.opacity ?? 1),
          weight: typeof any.strokeWeight === 'number' ? any.strokeWeight : 1,
        };
        const token = await tokenOf(paint);
        if (token) stroke.token = token;
        node.stroke = stroke;
      }
    }

    if ('cornerRadius' in n && typeof any.cornerRadius === 'number') {
      if (any.cornerRadius !== 0) node.radius = any.cornerRadius;
    } else if ('cornerRadius' in n && isMixed(any.cornerRadius) && 'topLeftRadius' in n) {
      node.radius = [any.topLeftRadius, any.topRightRadius, any.bottomRightRadius, any.bottomLeftRadius];
    }
    if (n.type === 'ELLIPSE' && node.radius === undefined) node.radius = 9999;

    if ('effects' in n && Array.isArray(any.effects)) {
      const e = any.effects.find((f: any) => f.visible !== false && (f.type === 'DROP_SHADOW' || f.type === 'INNER_SHADOW'));
      if (e) {
        node.shadow = {
          x: e.offset.x, y: e.offset.y, blur: e.radius, spread: e.spread ?? 0,
          color: hex(e.color, e.color.a ?? 1), inset: e.type === 'INNER_SHADOW',
        };
      }
    }

    if (n.type === 'TEXT') {
      const t = n as TextNode;
      let fontSize = 16;
      if (typeof t.fontSize === 'number') fontSize = t.fontSize;
      else if (t.characters.length > 0) {
        try { fontSize = t.getRangeFontSize(0, 1) as number; } catch { fontSize = 16; }
      }
      const lh: any = t.lineHeight;
      const ls: any = t.letterSpacing;
      const px = (v: any): number | undefined => {
        if (!v || isMixed(v)) return undefined;
        if (v.unit === 'PIXELS') return v.value;
        if (v.unit === 'PERCENT') return (v.value / 100) * fontSize;
        return undefined;
      };
      const alignMap: Record<string, 'left' | 'center' | 'right' | 'justify'> = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' };
      node.text = {
        characters: t.characters,
        fontSize,
        fontWeight: typeof t.fontWeight === 'number' ? t.fontWeight : 400,
        fontFamily: !isMixed(t.fontName) ? (t.fontName as FontName).family : undefined,
        lineHeightPx: px(lh),
        letterSpacingPx: px(ls),
        align: alignMap[t.textAlignHorizontal] ?? 'left',
        color: node.fill,
      };
    }

    if ('children' in n && !NO_CHILDREN.includes(n.type) && depth < MAX_DEPTH) {
      for (const c of (n as ChildrenMixin).children) {
        if (count >= MAX_NODES) break;
        if (c.visible === false) continue;
        node.children.push(await walk(c, n, depth + 1));
      }
    }
    return node;
  };
  return walk(root, null, 0);
}

async function exportSelection(reqId: number, scale: 1 | 2, maxSpecsChars: number): Promise<void> {
  const sel = figma.currentPage.selection;
  const info = describeSelection(sel as unknown as readonly { id: string; name: string; type: string }[]);
  if (!info.valid) {
    post({ type: 'export-result', reqId, ok: false, error: info.reason ?? 'none' });
    return;
  }
  const node = sel[0];
  try {
    const png = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
    const width = 'width' in node ? node.width : 0;
    const height = 'height' in node ? node.height : 0;
    const tree = await toCodeTree(node);
    const cap = Number.isFinite(maxSpecsChars) && maxSpecsChars > 0 ? Math.min(maxSpecsChars, 64 * 1024) : DEFAULT_MAX_SPECS_CHARS;
    const specs = buildSpecsV2(tree, node.name, cap);
    post({ type: 'export-result', reqId, ok: true, png, specs, frameName: node.name, nodeId: node.id, width: Math.round(width * scale), height: Math.round(height * scale) });
  } catch (e) {
    post({ type: 'export-result', reqId, ok: false, error: e instanceof Error ? e.message : 'export failed' });
  }
}

figma.on('selectionchange', sendSelection);
figma.on('currentpagechange', sendSelection);

figma.ui.onmessage = async (msg: ToCode) => {
  switch (msg.type) {
    case 'ready':
      sendSelection();
      return;
    case 'storage-get':
      post({ type: 'storage-result', reqId: msg.reqId, value: allowedKey(msg.key) ? await figma.clientStorage.getAsync(msg.key) : undefined });
      return;
    case 'storage-set':
      if (allowedKey(msg.key)) await figma.clientStorage.setAsync(msg.key, msg.value);
      post({ type: 'storage-result', reqId: msg.reqId, value: true });
      return;
    case 'storage-delete':
      if (allowedKey(msg.key)) await figma.clientStorage.deleteAsync(msg.key);
      post({ type: 'storage-result', reqId: msg.reqId, value: true });
      return;
    case 'open-url':
      if (/^https?:\/\//i.test(msg.url)) figma.openExternal(msg.url);
      return;
    case 'export':
      await exportSelection(msg.reqId, msg.scale, msg.maxSpecsChars);
      return;
    case 'notify':
      figma.notify(String(msg.text).slice(0, 200));
      return;
    case 'resize': {
      const h = Math.round(Number(msg.height));
      if (Number.isFinite(h)) figma.ui.resize(360, Math.min(720, Math.max(240, h)));
      return;
    }
  }
};
