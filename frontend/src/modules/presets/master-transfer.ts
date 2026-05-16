export type MasterSectionId = 'instruct' | 'context' | 'sysprompt' | 'preset' | 'reasoning' | 'srw';

export type MasterExportSnapshot = Partial<Record<MasterSectionId, Record<string, unknown>>>;

export type MasterImportDetectionResult =
  | { kind: 'invalid'; sections: []; payloadBySection: {}; fileName: string }
  | { kind: 'legacy'; sections: MasterSectionId[]; payloadBySection: Partial<Record<MasterSectionId, Record<string, unknown>>>; fileName: string }
  | { kind: 'bundle'; sections: MasterSectionId[]; payloadBySection: Partial<Record<MasterSectionId, Record<string, unknown>>>; fileName: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isPossiblyInstructData(data: Record<string, unknown>): boolean {
  return typeof data.name === 'string' && 'input_sequence' in data && 'output_sequence' in data;
}

function isPossiblyContextData(data: Record<string, unknown>): boolean {
  return typeof data.name === 'string' && 'story_string' in data;
}

function isPossiblySystemPromptData(data: Record<string, unknown>): boolean {
  return typeof data.name === 'string' && 'content' in data;
}

function isPossiblyTextCompletionData(data: Record<string, unknown>): boolean {
  return 'temp' in data && 'top_k' in data && 'top_p' in data && 'rep_pen' in data;
}

function isPossiblyReasoningData(data: Record<string, unknown>): boolean {
  return typeof data.name === 'string' && 'prefix' in data && 'suffix' in data && 'separator' in data;
}

function isPossiblyStartReplyWithData(data: Record<string, unknown>): boolean {
  return 'value' in data && 'show' in data;
}

export function defaultMasterSectionSelection(): Record<MasterSectionId, boolean> {
  return {
    instruct: true,
    context: true,
    sysprompt: true,
    preset: false,
    reasoning: true,
    srw: false,
  };
}

export function detectMasterImportSections(data: unknown, fileName: string): MasterImportDetectionResult {
  const source = asRecord(data);
  if (Object.keys(source).length === 0) {
    return { kind: 'invalid', sections: [], payloadBySection: {}, fileName };
  }

  if (isPossiblyInstructData(source)) {
    return { kind: 'legacy', sections: ['instruct'], payloadBySection: { instruct: source }, fileName };
  }
  if (isPossiblyContextData(source)) {
    return { kind: 'legacy', sections: ['context'], payloadBySection: { context: source }, fileName };
  }
  if (isPossiblySystemPromptData(source)) {
    return { kind: 'legacy', sections: ['sysprompt'], payloadBySection: { sysprompt: source }, fileName };
  }
  if (isPossiblyTextCompletionData(source)) {
    return { kind: 'legacy', sections: ['preset'], payloadBySection: { preset: source }, fileName };
  }
  if (isPossiblyReasoningData(source)) {
    return { kind: 'legacy', sections: ['reasoning'], payloadBySection: { reasoning: source }, fileName };
  }
  if (isPossiblyStartReplyWithData(source)) {
    return { kind: 'legacy', sections: ['srw'], payloadBySection: { srw: source }, fileName };
  }

  const payloadBySection: Partial<Record<MasterSectionId, Record<string, unknown>>> = {};
  const sections: MasterSectionId[] = [];
  const candidates: Array<[MasterSectionId, (input: Record<string, unknown>) => boolean]> = [
    ['instruct', isPossiblyInstructData],
    ['context', isPossiblyContextData],
    ['sysprompt', isPossiblySystemPromptData],
    ['preset', isPossiblyTextCompletionData],
    ['reasoning', isPossiblyReasoningData],
    ['srw', isPossiblyStartReplyWithData],
  ];

  for (const [sectionId, validator] of candidates) {
    const sectionPayload = asRecord(source[sectionId]);
    if (Object.keys(sectionPayload).length > 0 && validator(sectionPayload)) {
      sections.push(sectionId);
      payloadBySection[sectionId] = sectionPayload;
    }
  }

  if (sections.length === 0) {
    return { kind: 'invalid', sections: [], payloadBySection: {}, fileName };
  }

  return { kind: 'bundle', sections, payloadBySection, fileName };
}

export function buildMasterExportPayload(selectedSections: MasterSectionId[], snapshot: MasterExportSnapshot): Record<string, unknown> {
  return Object.fromEntries(
    selectedSections
      .filter((sectionId) => snapshot[sectionId])
      .map((sectionId) => [sectionId, snapshot[sectionId]]),
  );
}
