import { Button } from '@/shared/components/ui';
import { useMotionMount, usePressMotion } from '@/shared/motion/runtime';
import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';

export function CreateSessionGreetingModal(props: {
  open: boolean;
  greetings: string[];
  onClose: () => void;
  onSelect: (greeting: string) => void;
}) {
  return (
    <WorkbenchModal open={props.open} onClose={props.onClose} title="选择开局内容" size="md">
      <div class="grid gap-4">
        {props.greetings.map((greeting, index) => {
          let cardRef: HTMLButtonElement | undefined;
          useMotionMount(() => cardRef, 'card', { delay: index * 0.04 });
          usePressMotion(() => cardRef);
          return (
            <button
              ref={cardRef}
              type="button"
              class="tt-card-surface rounded-[1.6rem] px-5 py-5 text-left transition hover:bg-slate-50"
              onClick={() => props.onSelect(greeting)}
            >
              <div class="text-sm font-semibold text-slate-900">开局 {index + 1}</div>
              <div class="mt-2 whitespace-pre-wrap text-sm text-slate-600">{greeting}</div>
            </button>
          );
        })}
      </div>
      <div class="mt-6 flex justify-end">
        <Button variant="secondary" onClick={props.onClose}>取消</Button>
      </div>
    </WorkbenchModal>
  );
}
