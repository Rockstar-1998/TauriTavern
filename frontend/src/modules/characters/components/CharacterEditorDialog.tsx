import type { JSX } from 'solid-js';

import type { CharacterEditorModalState } from '../controller';

import { CharacterEditorModal } from './CharacterEditorModal';

export function CharacterEditorDialog(props: { modal: CharacterEditorModalState }): JSX.Element {
  if (props.modal.mode === 'create') {
    return (
      <CharacterEditorModal
        open
        mode="create"
        form={props.modal.form}
        worldNames={props.modal.worldNames}
        pending={props.modal.pending}
        onClose={props.modal.onClose}
        onSubmit={props.modal.onSubmit}
        onChange={props.modal.onChange}
      />
    );
  }

  return (
    <CharacterEditorModal
      open
      mode="edit"
      section={props.modal.section}
      form={props.modal.form}
      worldNames={props.modal.worldNames}
      pending={props.modal.pending}
      onClose={props.modal.onClose}
      onSubmit={props.modal.onSubmit}
      onChange={props.modal.onChange}
    />
  );
}
