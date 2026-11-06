import { describe, it, expect } from 'vitest';
import { parseFigmaLink, parseFigmaFileKey, buildFigmaUrl } from '../src/shared/figmaLink';

describe('figmaLink: parseFigmaLink (same rules as FigmaLink.cs and pinsay-widget)', () => {
  const validCases = [
    {
      input: 'https://www.figma.com/design/AbC123xyz456/Checkout?node-id=12-34',
      fileKey: 'AbC123xyz456',
      nodeId: '12:34',
      kind: 'design',
      url: 'https://www.figma.com/design/AbC123xyz456?node-id=12-34',
    },
    {
      input: 'https://figma.com/file/AbC123xyz456/Old?node-id=12%3A34&t=x',
      fileKey: 'AbC123xyz456',
      nodeId: '12:34',
      kind: 'design',
      url: 'https://www.figma.com/design/AbC123xyz456?node-id=12-34',
    },
    {
      input: 'https://www.figma.com/board/AbC123xyz456/Flow?node-id=0-1',
      fileKey: 'AbC123xyz456',
      nodeId: '0:1',
      kind: 'board',
      url: 'https://www.figma.com/board/AbC123xyz456?node-id=0-1',
    },
    {
      input: 'https://www.figma.com/proto/AbC123xyz456/P?node-id=5-6&scaling=min-zoom',
      fileKey: 'AbC123xyz456',
      nodeId: '5:6',
      kind: 'proto',
      url: 'https://www.figma.com/proto/AbC123xyz456?node-id=5-6',
    },
    {
      input: 'https://www.figma.com/design/AbC123xyz456/branch/BrN987654321/Name?node-id=1-2',
      fileKey: 'BrN987654321',
      nodeId: '1:2',
      kind: 'design',
      url: 'https://www.figma.com/design/BrN987654321?node-id=1-2',
    },
    {
      input: '  https://WWW.FIGMA.COM/design/AbC123xyz456?node-id=1-2  ',
      fileKey: 'AbC123xyz456',
      nodeId: '1:2',
      kind: 'design',
      url: 'https://www.figma.com/design/AbC123xyz456?node-id=1-2',
    },
  ];

  for (const tc of validCases) {
    it(`parses valid link: ${tc.input.trim()}`, () => {
      const res = parseFigmaLink(tc.input);
      expect(res).not.toBeNull();
      expect(res?.fileKey).toBe(tc.fileKey);
      expect(res?.nodeId).toBe(tc.nodeId);
      expect(res?.kind).toBe(tc.kind);
      expect(res?.url).toBe(tc.url);
    });
  }

  const invalidCases = [
    'http://www.figma.com/design/AbC123xyz456/X?node-id=1-2',
    'https://evil.com/design/AbC123xyz456?node-id=1-2',
    'https://figma.com.evil.com/design/AbC123xyz456?node-id=1-2',
    'https://www.figma.com/design/AbC123xyz456/X',
    'https://www.figma.com/design/AbC123xyz456/X?node-id=abc',
    'https://www.figma.com/community/file/123?node-id=1-2',
    'https://www.figma.com/design/ab/X?node-id=1-2',
    'https://www.figma.com/design/AbC123xyz456/X?node-id=1-2;3-4',
    '',
    '   ',
    null,
    undefined,
    'https://www.figma.com/design/AbC123xyz456?node-id=1-2&q=' + 'a'.repeat(2001 - 'https://www.figma.com/design/AbC123xyz456?node-id=1-2&q='.length),
  ];

  for (const input of invalidCases) {
    it(`rejects invalid link: ${String(input).slice(0, 50)}`, () => {
      expect(parseFigmaLink(input)).toBeNull();
    });
  }
});

describe('figmaLink: parseFigmaFileKey', () => {
  it('extracts key from design URL', () => {
    expect(parseFigmaFileKey('https://www.figma.com/design/AbCdEf123456/Name')).toBe('AbCdEf123456');
  });

  it('extracts key from file URL with query param', () => {
    expect(parseFigmaFileKey('https://www.figma.com/file/AbCdEf123456/Name?node-id=1-2')).toBe('AbCdEf123456');
  });

  it('extracts branch key from branch URL', () => {
    expect(parseFigmaFileKey('https://www.figma.com/design/AbCdEf123456/branch/BrAnCh654321/Name')).toBe('BrAnCh654321');
  });

  it('rejects non-https protocol', () => {
    expect(parseFigmaFileKey('http://www.figma.com/design/AbCdEf123456/x')).toBeNull();
  });

  it('rejects non-figma host', () => {
    expect(parseFigmaFileKey('https://evil.com/design/AbCdEf123456/x')).toBeNull();
  });

  it('rejects invalid key length', () => {
    expect(parseFigmaFileKey('https://www.figma.com/design/abc/x')).toBeNull();
  });
});

describe('figmaLink: buildFigmaUrl', () => {
  it('builds canonical frame URL from fileKey and nodeId', () => {
    expect(buildFigmaUrl('AbCdEf123456', '12:34')).toBe('https://www.figma.com/design/AbCdEf123456?node-id=12-34');
  });

  it('returns null for nested node id', () => {
    expect(buildFigmaUrl('AbCdEf123456', 'I1:2;3:4')).toBeNull();
  });

  it('roundtrips with parseFigmaLink', () => {
    const url = buildFigmaUrl('AbCdEf123456', '12:34');
    expect(url).not.toBeNull();
    const parsed = parseFigmaLink(url!);
    expect(parsed).toEqual({
      fileKey: 'AbCdEf123456',
      nodeId: '12:34',
      kind: 'design',
      url: 'https://www.figma.com/design/AbCdEf123456?node-id=12-34',
    });
  });
});
