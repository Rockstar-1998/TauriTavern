import { describe, expect, it } from 'vitest';

import { buildMasterExportPayload, defaultMasterSectionSelection, detectMasterImportSections } from './master-transfer';

describe('master transfer helpers', () => {
  it('detects legacy instruct template files', () => {
    const detection = detectMasterImportSections({ name: 'Alpaca', input_sequence: '### Instruction:', output_sequence: '### Response:' }, 'alpaca.json');
    expect(detection.kind).toBe('legacy');
    expect(detection.sections).toEqual(['instruct']);
  });

  it('detects multi-section master bundles', () => {
    const detection = detectMasterImportSections({
      instruct: { name: 'Alpaca', input_sequence: '### Instruction:', output_sequence: '### Response:' },
      context: { name: 'Default', story_string: 'Story' },
      srw: { value: 'Hello', show: true },
    }, 'bundle.json');

    expect(detection.kind).toBe('bundle');
    expect(detection.sections).toEqual(['instruct', 'context', 'srw']);
  });

  it('keeps legacy default master export selection', () => {
    expect(defaultMasterSectionSelection()).toEqual({
      instruct: true,
      context: true,
      sysprompt: true,
      preset: false,
      reasoning: true,
      srw: false,
    });
  });

  it('builds export payload from selected sections only', () => {
    const payload = buildMasterExportPayload(['context', 'srw'], {
      context: { name: 'Default', story_string: 'Story' },
      srw: { value: 'Hi', show: true },
      instruct: { name: 'Ignored' },
    });

    expect(payload).toEqual({
      context: { name: 'Default', story_string: 'Story' },
      srw: { value: 'Hi', show: true },
    });
  });
});
