// postMessage contract between the sandbox (src/code.ts) and the UI iframe (src/ui/*).
export type SelectionInvalid = 'none' | 'multiple' | 'nested' | 'unsupported';
export type SelectionInfo = {
  valid: boolean;
  reason?: SelectionInvalid;
  id?: string; // "12:34"
  name?: string;
  type?: string;
  width?: number;
  height?: number;
};

export type ToCode =
  | { type: 'ready' }
  | { type: 'storage-get'; reqId: number; key: string }
  | { type: 'storage-set'; reqId: number; key: string; value: unknown }
  | { type: 'storage-delete'; reqId: number; key: string }
  | { type: 'open-url'; url: string }
  | { type: 'export'; reqId: number; scale: 1 | 2; maxSpecsChars: number }
  | { type: 'notify'; text: string }
  | { type: 'resize'; height: number };

export type ToUi =
  | { type: 'selection'; selection: SelectionInfo; documentName: string; fileKey: string | null }
  | { type: 'storage-result'; reqId: number; value: unknown }
  | { type: 'export-result'; reqId: number; ok: true; png: Uint8Array; specs: string; frameName: string; nodeId: string; width: number; height: number }
  | { type: 'export-result'; reqId: number; ok: false; error: string }
  | { type: 'thumb'; id: string; png: Uint8Array | null };

/** Only these keys may be read or written through the bridge. */
export const STORAGE_KEYS = ['pinsay:auth', 'pinsay:session', 'pinsay:lang', 'pinsay:fileKeys', 'pinsay:lastProject'] as const;
