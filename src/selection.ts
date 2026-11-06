import type { SelectionInfo } from './shared/messages';

const OK_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'GROUP', 'SECTION']);
const PLAIN_ID = /^\d+:\d+$/;

type NodeLike = { id: string; name: string; type: string; width?: number; height?: number };

export function describeSelection(nodes: readonly NodeLike[]): SelectionInfo {
  if (nodes.length === 0) return { valid: false, reason: 'none' };
  if (nodes.length > 1) return { valid: false, reason: 'multiple' };
  const n = nodes[0];
  // Layers inside an instance have ids like "I12:34;56:78": no stable link exists for them.
  if (!PLAIN_ID.test(n.id)) return { valid: false, reason: 'nested', name: n.name, type: n.type };
  if (!OK_TYPES.has(n.type)) return { valid: false, reason: 'unsupported', name: n.name, type: n.type };
  return { valid: true, id: n.id, name: n.name, type: n.type, width: n.width ?? 0, height: n.height ?? 0 };
}
