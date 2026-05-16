import { Button } from '@/shared/components/ui';
import { useMotionMount, usePressMotion } from '@/shared/motion/runtime';
import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';

export function CreateSessionModeModal(props: {
  open: boolean;
  onClose: () => void;
  onSelectSingle: () => void;
  onSelectMultiplayer: () => void;
}) {
  let singleRef: HTMLButtonElement | undefined;
  let multiRef: HTMLButtonElement | undefined;

  useMotionMount(() => singleRef, 'card');
  useMotionMount(() => multiRef, 'card', { delay: 0.05 });
  usePressMotion(() => singleRef);
  usePressMotion(() => multiRef);

  return (
    <WorkbenchModal open={props.open} onClose={props.onClose} title="选择会话模式" size="md">
      <div class="grid gap-4">
        <button ref={singleRef} type="button" class="tt-card-surface rounded-[1.6rem] px-5 py-5 text-left transition hover:bg-slate-50" onClick={props.onSelectSingle}>
          <div class="text-lg font-semibold text-slate-900">单人会话</div>
          <div class="mt-2 text-sm text-slate-500">保持当前单机聊天流程。</div>
        </button>
        <button ref={multiRef} type="button" class="tt-card-surface rounded-[1.6rem] px-5 py-5 text-left transition hover:bg-slate-50" onClick={props.onSelectMultiplayer}>
          <div class="text-lg font-semibold text-slate-900">联机会话（房主）</div>
          <div class="mt-2 text-sm text-slate-500">创建多人房间，由你统一触发生成与转发回复。</div>
        </button>
      </div>
      <div class="mt-6 flex justify-end">
        <Button variant="secondary" onClick={props.onClose}>取消</Button>
      </div>
    </WorkbenchModal>
  );
}
