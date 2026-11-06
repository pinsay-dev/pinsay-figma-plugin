import { describe, it, expect, beforeEach } from 'vitest';
import {
  KEYS_EN,
  KEYS_AR,
  ALL_AR,
  detectLang,
  setLang,
  t,
} from '../src/ui/i18n';

describe('i18n', () => {
  beforeEach(() => {
    setLang('en');
  });

  it('KEYS_EN and KEYS_AR are the same set', () => {
    expect(new Set(KEYS_EN)).toEqual(new Set(KEYS_AR));
    expect(KEYS_EN.length).toBe(KEYS_AR.length);
  });

  it('no AR string contains فيجما', () => {
    for (const str of ALL_AR) {
      expect(str).not.toContain('فيجما');
    }
  });

  it('every AR string whose EN twin contains Figma also contains Figma', () => {
    for (const key of KEYS_EN) {
      setLang('en');
      const enStr = t(key);
      setLang('ar');
      const arStr = t(key);
      if (enStr.includes('Figma')) {
        expect(arStr).toContain('Figma');
      }
    }
  });

  it('every {placeholder} in an EN string appears in its AR twin', () => {
    const placeholderRegex = /\{(\w+)\}/g;
    for (const key of KEYS_EN) {
      setLang('en');
      const enStr = t(key);
      setLang('ar');
      const arStr = t(key);

      const enPlaceholders = Array.from(enStr.matchAll(placeholderRegex), (m) => m[1]);
      const arPlaceholders = new Set(Array.from(arStr.matchAll(placeholderRegex), (m) => m[1]));

      for (const ph of enPlaceholders) {
        expect(arPlaceholders.has(ph)).toBe(true);
      }
    }
  });

  it('detectLang correctly resolves language', () => {
    expect(detectLang(undefined, 'ar-SA')).toBe('ar');
    expect(detectLang('en', 'ar')).toBe('en');
  });

  it('t("attach.done", { n: 4 }) replaces placeholder', () => {
    setLang('en');
    expect(t('attach.done', { n: 4 })).toBe('Frame attached to #4.');
  });
});
