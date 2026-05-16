import { createSignal } from 'solid-js';

import { useMotionMount } from '@/shared/motion/runtime';
import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import { Button, Field, Input } from '@/shared/components/ui';

export function JoinRoomModal(props: {
  open: boolean;
  initialNickname?: string;
  onClose: () => void;
  onJoin: (input: { address: string; nickname: string }) => void;
}) {
  let formRef: HTMLDivElement | undefined;
  const [address, setAddress] = createSignal('');
  const [nickname, setNickname] = createSignal(props.initialNickname ?? '');

  const submit = () => {
    props.onJoin({ address: address().trim(), nickname: nickname().trim() });
  };

  useMotionMount(() => formRef, 'panel', { delay: 0.05 });

  return (
    <WorkbenchModal open={props.open} onClose={props.onClose} title="加入房间" size="md">
      <div ref={formRef} class="grid gap-5">
        <Field label="地址">
          <Input value={address()} onInput={(event) => setAddress(event.currentTarget.value)} placeholder="192.168.1.10:4000" />
        </Field>
        <Field label="昵称">
          <Input value={nickname()} onInput={(event) => setNickname(event.currentTarget.value)} placeholder="你的昵称" />
        </Field>
        <div class="rounded-[1rem] bg-slate-50 px-4 py-3 text-sm text-slate-500">
          加入房间时会携带当前会话绑定的角色卡信息，并由房主统一发起回复生成。
        </div>
      </div>
      <div class="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={props.onClose}>取消</Button>
        <Button onClick={submit} disabled={!address().trim() || !nickname().trim()}>加入</Button>
      </div>
    </WorkbenchModal>
  );
}
