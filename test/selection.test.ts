import { describe, it, expect } from 'vitest';
import { describeSelection } from '../src/selection';

describe('selection: describeSelection', () => {
  it('returns invalid with reason none when selection is empty', () => {
    expect(describeSelection([])).toEqual({ valid: false, reason: 'none' });
  });

  it('returns invalid with reason multiple when more than one node selected', () => {
    const nodes = [
      { id: '1:1', name: 'A', type: 'FRAME' },
      { id: '1:2', name: 'B', type: 'FRAME' },
    ];
    expect(describeSelection(nodes)).toEqual({ valid: false, reason: 'multiple' });
  });

  it('returns invalid with reason nested when node id contains instance path', () => {
    const nodes = [{ id: 'I1:2;3:4', name: 'Nested Node', type: 'FRAME' }];
    expect(describeSelection(nodes)).toEqual({
      valid: false,
      reason: 'nested',
      name: 'Nested Node',
      type: 'FRAME',
    });
  });

  it('returns invalid with reason unsupported when node type is not allowed', () => {
    const nodes = [{ id: '12:34', name: 'Title', type: 'TEXT' }];
    expect(describeSelection(nodes)).toEqual({
      valid: false,
      reason: 'unsupported',
      name: 'Title',
      type: 'TEXT',
    });
  });

  it('returns valid info for a supported FRAME node', () => {
    const nodes = [{ id: '12:34', name: 'Main Frame', type: 'FRAME', width: 320, height: 200 }];
    expect(describeSelection(nodes)).toEqual({
      valid: true,
      id: '12:34',
      name: 'Main Frame',
      type: 'FRAME',
      width: 320,
      height: 200,
    });
  });
});
