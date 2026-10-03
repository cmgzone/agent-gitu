import { describe, expect, it } from 'vitest';
import { parseAction } from '../src/agent/action-parser.js';

describe('acceptance criterion model input', () => {
  it.each(['set_criteria', 'add_criteria'])('preserves structured %s requirements and verification', (type) => {
    const action = parseAction({ action: { type, criteria: [
      ' Plain requirement ',
      { text: ' Page returns 200 ', verification: ' node check.cjs ', evidenceType: 'command_success' },
      null, {}, 123, '[object Object]', { text: '' }, { text: 'Visual review', evidenceType: 'unsupported' },
    ] } });
    expect(action).toEqual({ type, criteria: [
      'Plain requirement',
      { text: 'Page returns 200', verification: 'node check.cjs', evidenceType: 'command_success' },
      { text: 'Visual review' },
    ] });
  });
});
