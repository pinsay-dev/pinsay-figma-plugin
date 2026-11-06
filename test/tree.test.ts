import { describe, it, expect } from 'vitest';
import { hex, mapJustify, mapAlign, mapSizing, variableToken } from '../src/tree';

describe('tree helpers', () => {
  it('hex', () => {
    expect(hex({ r: 1, g: 1, b: 1 })).toBe('#ffffff');
    expect(hex({ r: 0, g: 0, b: 0 }, 0.5)).toBe('#00000080');
  });
  it('mapJustify', () => {
    expect(mapJustify('MIN')).toBe('start');
    expect(mapJustify('CENTER')).toBe('center');
    expect(mapJustify('MAX')).toBe('end');
    expect(mapJustify('SPACE_BETWEEN')).toBe('between');
  });
  it('mapAlign', () => {
    expect(mapAlign('MIN')).toBe('start');
    expect(mapAlign('CENTER')).toBe('center');
    expect(mapAlign('MAX')).toBe('end');
    expect(mapAlign('BASELINE')).toBe('baseline');
  });
  it('mapSizing', () => {
    expect(mapSizing('FIXED')).toBe('fixed');
    expect(mapSizing('HUG')).toBe('hug');
    expect(mapSizing('FILL')).toBe('fill');
    expect(mapSizing(undefined)).toBeUndefined();
  });
  it('variableToken', () => {
    expect(variableToken('Color/Brand Primary')).toBe('--color-brand-primary');
    expect(variableToken('///')).toBeUndefined();
  });
});
