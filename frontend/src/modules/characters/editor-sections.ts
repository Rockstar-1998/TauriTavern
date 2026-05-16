export type CharacterEditorSection =
  | 'basic-info'
  | 'character-setup'
  | 'conversation-parameters'
  | 'prompt-and-notes';

export const CHARACTER_EDITOR_SECTION_ORDER: CharacterEditorSection[] = [
  'basic-info',
  'character-setup',
  'conversation-parameters',
  'prompt-and-notes',
];
