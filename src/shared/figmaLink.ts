// Figma SPEC (PLAN D2): same rule as pinsay-api FigmaLink.cs and pinsay-widget/src/figma.ts. Keep the three in step.
export type FigmaParsed = { fileKey: string; nodeId: string; kind: string; url: string };

const KEY = /^[A-Za-z0-9_-]{6,64}$/;
const NODE = /^(\d{1,10})[-:](\d{1,10})$/;
const KINDS = ['design', 'file', 'board', 'proto'];

export function parseFigmaLink(input: string | null | undefined): FigmaParsed | null {
  if (!input) return null;
  const text = input.trim();
  if (!text || text.length > 2000) return null;
  let u: URL;
  try { u = new URL(text); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  if (host !== 'figma.com' && host !== 'www.figma.com') return null;
  const seg = u.pathname.split('/').filter(Boolean);
  if (seg.length < 2) return null;
  const kind = seg[0].toLowerCase();
  if (!KINDS.includes(kind)) return null;
  const fileKey = seg.length >= 4 && seg[2] === 'branch' ? seg[3] : seg[1];
  if (!KEY.test(fileKey)) return null;
  const raw = u.searchParams.get('node-id');
  if (raw === null) return null;
  const m = NODE.exec(raw.trim());
  if (!m) return null;
  const stored = kind === 'file' ? 'design' : kind;
  return { fileKey, nodeId: `${m[1]}:${m[2]}`, kind: stored, url: `https://www.figma.com/${stored}/${fileKey}?node-id=${m[1]}-${m[2]}` };
}

/** The file key of any Figma file link (node-id optional): the designer pastes the file's link once per file. */
export function parseFigmaFileKey(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = input.trim();
  if (!text || text.length > 2000) return null;
  let u: URL;
  try { u = new URL(text); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  if (host !== 'figma.com' && host !== 'www.figma.com') return null;
  const seg = u.pathname.split('/').filter(Boolean);
  if (seg.length < 2 || !KINDS.includes(seg[0].toLowerCase())) return null;
  const fileKey = seg.length >= 4 && seg[2] === 'branch' ? seg[3] : seg[1];
  return KEY.test(fileKey) ? fileKey : null;
}

/** The canonical frame link the API accepts, from a file key and a node id "12:34"; null when either is malformed. */
export function buildFigmaUrl(fileKey: string, nodeId: string): string | null {
  if (!KEY.test(fileKey)) return null;
  const m = /^(\d{1,10}):(\d{1,10})$/.exec(nodeId);
  if (!m) return null;
  return `https://www.figma.com/design/${fileKey}?node-id=${m[1]}-${m[2]}`;
}
