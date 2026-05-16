import { For, Show } from 'solid-js';

import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import { Button, Tag } from '@/shared/components/ui';
import type { RoomParticipant, RoomStatus } from '@/types/multiplayer';

type PendingJoinRequest = {
  request_id: string;
  nickname: string;
  character_name?: string;
  character_avatar?: string;
  requested_at: number;
};

export function RoomPanelModal(props: {
  open: boolean;
  status: RoomStatus;
  roomSummary: string;
  participants: RoomParticipant[];
  pendingJoinRequests: PendingJoinRequest[];
  onClose: () => void;
  onStartHost?: () => void;
  onOpenJoin?: () => void;
  onStopOrLeave?: () => void;
  onApproveJoin?: (requestId: string, accept: boolean) => void;
}) {
  return (
    <WorkbenchModal open={props.open} onClose={props.onClose} title="联机房间" size="lg">
      <div class="grid gap-6">
        <div class="tt-card-surface rounded-[1.6rem] px-5 py-5">
          <div class="flex flex-wrap items-center gap-3">
            <div class="text-lg font-semibold text-slate-900">{props.roomSummary || '未连接房间'}</div>
            <Tag>{props.status.state}</Tag>
            <Show when={props.status.is_host}><Tag tone="success">房主</Tag></Show>
          </div>
          <div class="mt-3 grid gap-2 text-sm text-slate-600">
            <div>地址：{props.status.address ?? '—'}</div>
            <div>房间：{props.status.room_id ?? '—'}</div>
            <div>本地参与者：{props.status.nickname ?? '—'}</div>
            <div>人数：{props.participants.length} / 4</div>
          </div>
          <div class="mt-4 flex flex-wrap gap-3">
            <Show when={props.status.state === 'idle'}>
              <Button onClick={props.onStartHost}>启动房间</Button>
              <Button variant="secondary" onClick={props.onOpenJoin}>加入房间</Button>
            </Show>
            <Show when={props.status.state !== 'idle'}>
              <Button variant="danger" onClick={props.onStopOrLeave}>{props.status.is_host ? '停止房间' : '离开房间'}</Button>
            </Show>
          </div>
        </div>

        <div class="tt-card-surface rounded-[1.6rem] px-5 py-5">
          <div class="text-lg font-semibold text-slate-900">参与者</div>
          <div class="mt-4 space-y-3">
            <For each={props.participants}>
              {(participant) => (
                <div class="flex items-center justify-between rounded-[1rem] bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <div class="min-w-0">
                    <div class="truncate font-medium text-slate-900">{participant.nickname}</div>
                    <Show when={participant.character_name}>
                      <div class="mt-1 truncate text-xs text-slate-500">角色卡：{participant.character_name}</div>
                    </Show>
                  </div>
                  <div class="flex gap-2">
                    <Show when={participant.is_host}><Tag tone="success">房主</Tag></Show>
                    <Tag>{participant.participant_id}</Tag>
                  </div>
                </div>
              )}
            </For>
            <Show when={props.participants.length === 0}>
              <div class="text-sm text-slate-500">暂无参与者。</div>
            </Show>
          </div>
        </div>

        <Show when={props.status.is_host}>
          <div class="tt-card-surface rounded-[1.6rem] px-5 py-5">
            <div class="text-lg font-semibold text-slate-900">待审批加入</div>
            <div class="mt-4 space-y-3">
              <For each={props.pendingJoinRequests}>
                {(request) => (
                  <div class="flex flex-wrap items-center justify-between gap-3 rounded-[1rem] bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <div class="min-w-0">
                      <div class="truncate font-medium text-slate-900">{request.nickname}</div>
                      <Show when={request.character_name}>
                        <div class="mt-1 truncate text-xs text-slate-500">角色卡：{request.character_name}</div>
                      </Show>
                    </div>
                    <div class="flex gap-2">
                      <Button variant="secondary" onClick={() => props.onApproveJoin?.(request.request_id, false)}>拒绝</Button>
                      <Button onClick={() => props.onApproveJoin?.(request.request_id, true)}>通过</Button>
                    </div>
                  </div>
                )}
              </For>
              <Show when={props.pendingJoinRequests.length === 0}>
                <div class="text-sm text-slate-500">当前没有加入申请。</div>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </WorkbenchModal>
  );
}
