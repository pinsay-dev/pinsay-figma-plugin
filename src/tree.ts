// Pure helpers for the selection walk in code.ts (no `figma` global, so they can be unit-tested).
import type { Layout, Sizing } from './shared/codegen';

function h2(v: number): string {
  return Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
}

export function hex(c: { r: number; g: number; b: number }, a = 1): string {
  const base = `#${h2(c.r)}${h2(c.g)}${h2(c.b)}`;
  return a < 1 ? base + h2(a) : base;
}

export function mapJustify(v: string | undefined): Layout['justify'] {
  switch (v) {
    case 'CENTER': return 'center';
    case 'MAX': return 'end';
    case 'SPACE_BETWEEN': return 'between';
    default: return 'start';
  }
}

export function mapAlign(v: string | undefined): Layout['align'] {
  switch (v) {
    case 'CENTER': return 'center';
    case 'MAX': return 'end';
    case 'BASELINE': return 'baseline';
    default: return 'start';
  }
}

export function mapSizing(v: string | undefined): Sizing | undefined {
  switch (v) {
    case 'FIXED': return 'fixed';
    case 'HUG': return 'hug';
    case 'FILL': return 'fill';
    default: return undefined;
  }
}

export function variableToken(name: string): string | undefined {
  const t = '--' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return t === '--' ? undefined : t;
}
