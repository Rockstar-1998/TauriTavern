use std::collections::HashMap;
use std::sync::Arc;

use serde_json::{Value, json, to_value};
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, mpsc};
use uuid::Uuid;

use crate::domain::errors::DomainError;
use crate::domain::models::multiplayer::{
    ContributionEnvelope, ContributionWithdrawnEnvelope, JoinApprovedEvent, JoinRejectedEvent,
    JoinRequestEvent, MultiplayerEnvelope, MultiplayerModeState, MultiplayerStatusDto,
    RoomDescriptor, RoomParticipant, RoomSnapshotEnvelope,
};

#[derive(Debug, Default)]
pub struct ServerPeerState {
    pub request_id: Option<String>,
    pub participant_id: Option<String>,
}

pub type SharedServerPeerState = Arc<Mutex<ServerPeerState>>;

type OutgoingTx = mpsc::UnboundedSender<String>;

const MAX_ROOM_PARTICIPANTS: usize = 4;

struct PendingJoinRequest {
    nickname: String,
    character_name: String,
    character_avatar: String,
    character_card: Value,
    sender: OutgoingTx,
    peer_state: SharedServerPeerState,
}

struct HostedRoomState {
    descriptor: RoomDescriptor,
    host_participant_id: String,
    nickname: String,
    port: u16,
    advertise_address: String,
    next_seq: u64,
    active_round_id: Option<String>,
    participants: HashMap<String, RoomParticipant>,
    pending_joins: HashMap<String, PendingJoinRequest>,
    participant_senders: HashMap<String, OutgoingTx>,
    contribution_authors: HashMap<String, String>,
    latest_snapshot: Option<RoomSnapshotEnvelope>,
}

struct ClientRoomState {
    address: String,
    nickname: String,
    room_id: Option<String>,
    participant_id: Option<String>,
    sender: OutgoingTx,
}

struct RuntimeState {
    mode: MultiplayerModeState,
    hosted: Option<HostedRoomState>,
    client: Option<ClientRoomState>,
}

pub struct MultiplayerRuntime {
    app_handle: AppHandle,
    state: Mutex<RuntimeState>,
}

impl MultiplayerRuntime {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            state: Mutex::new(RuntimeState {
                mode: MultiplayerModeState::Idle,
                hosted: None,
                client: None,
            }),
        }
    }

    pub async fn ensure_idle(&self) -> Result<(), DomainError> {
        let state = self.state.lock().await;
        if state.mode != MultiplayerModeState::Idle {
            return Err(DomainError::InvalidData(
                "Another multiplayer room is already active.".to_string(),
            ));
        }
        Ok(())
    }

    pub async fn enter_hosting(
        &self,
        descriptor: RoomDescriptor,
        nickname: String,
        character_name: String,
        character_avatar: String,
        character_card: Value,
        port: u16,
        advertise_address: String,
    ) -> Result<MultiplayerStatusDto, DomainError> {
        let host_participant_id = format!("host-{}", Uuid::new_v4());
        let connected_at = now_ms();
        let participant = RoomParticipant {
            participant_id: host_participant_id.clone(),
            nickname: nickname.clone(),
            is_host: true,
            connected_at,
            character_name,
            character_avatar,
            character_card,
        };

        {
            let mut state = self.state.lock().await;
            if state.mode != MultiplayerModeState::Idle {
                return Err(DomainError::InvalidData(
                    "Another multiplayer room is already active.".to_string(),
                ));
            }

            let mut participants = HashMap::new();
            participants.insert(host_participant_id.clone(), participant);
            state.mode = MultiplayerModeState::Hosting;
            state.client = None;
            state.hosted = Some(HostedRoomState {
                descriptor: descriptor.clone(),
                host_participant_id: host_participant_id.clone(),
                nickname: nickname.clone(),
                port,
                advertise_address: advertise_address.clone(),
                next_seq: 1,
                active_round_id: None,
                participants,
                pending_joins: HashMap::new(),
                participant_senders: HashMap::new(),
                contribution_authors: HashMap::new(),
                latest_snapshot: Some(RoomSnapshotEnvelope {
                    room_id: descriptor.room_id.clone(),
                    session_key: descriptor.session_key.clone(),
                    session_file: descriptor.session_file.clone(),
                    scope_id: descriptor.scope_id.clone(),
                    scope_name: descriptor.scope_name.clone(),
                    bindings: json!({}),
                    participants: vec![],
                    payload: json!([]),
                }),
            });
        }

        let status = self.current_status().await?;
        self.emit_room_status(status.clone())?;
        Ok(status)
    }

    pub async fn enter_joining(
        &self,
        address: String,
        nickname: String,
        sender: OutgoingTx,
    ) -> Result<MultiplayerStatusDto, DomainError> {
        {
            let mut state = self.state.lock().await;
            if state.mode != MultiplayerModeState::Idle {
                return Err(DomainError::InvalidData(
                    "Another multiplayer room is already active.".to_string(),
                ));
            }

            state.mode = MultiplayerModeState::Joining;
            state.hosted = None;
            state.client = Some(ClientRoomState {
                address,
                nickname,
                room_id: None,
                participant_id: None,
                sender,
            });
        }

        let status = self.current_status().await?;
        self.emit_room_status(status.clone())?;
        Ok(status)
    }

    pub async fn handle_remote_envelope(
        &self,
        envelope: &MultiplayerEnvelope,
    ) -> Result<(), DomainError> {
        match envelope.event_type.as_str() {
            "join_approved" => {
                let participant_id = envelope
                    .payload
                    .get("participant_id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let room_id = envelope.room_id.clone();
                let should_emit = {
                    let mut state = self.state.lock().await;
                    if let Some(client) = state.client.as_mut() {
                        client.participant_id = Some(participant_id);
                        client.room_id = Some(room_id);
                        state.mode = MultiplayerModeState::Joined;
                        true
                    } else {
                        false
                    }
                };
                if should_emit {
                    let status = self.current_status().await?;
                    self.emit_room_status(status)?;
                }
            }
            "join_rejected" => {
                self.transition_to_idle().await?;
            }
            _ => {}
        }

        self.emit_app_event(envelope)?;
        Ok(())
    }

    pub async fn handle_client_disconnect(&self, reason: Option<&str>) -> Result<(), DomainError> {
        let had_remote_room = {
            let state = self.state.lock().await;
            state.mode == MultiplayerModeState::Joining
                || state.mode == MultiplayerModeState::Joined
        };
        if had_remote_room {
            self.transition_to_idle().await?;
            if let Some(message) = reason.filter(|value| !value.trim().is_empty()) {
                let envelope = MultiplayerEnvelope::new(
                    "room_error",
                    "",
                    0,
                    now_ms(),
                    json!({ "message": message }),
                );
                self.emit_app_event(&envelope)?;
            }
        }
        Ok(())
    }

    pub async fn transition_to_idle(&self) -> Result<(), DomainError> {
        {
            let mut state = self.state.lock().await;
            state.mode = MultiplayerModeState::Idle;
            state.hosted = None;
            state.client = None;
        }
        let status = self.current_status().await?;
        self.emit_room_status(status)?;
        Ok(())
    }

    pub async fn current_status(&self) -> Result<MultiplayerStatusDto, DomainError> {
        let state = self.state.lock().await;
        Ok(match state.mode {
            MultiplayerModeState::Idle => MultiplayerStatusDto {
                state: MultiplayerModeState::Idle,
                room_id: None,
                address: None,
                port: None,
                participant_id: None,
                nickname: None,
                is_host: false,
            },
            MultiplayerModeState::Hosting => {
                let hosted = state.hosted.as_ref().ok_or_else(|| {
                    DomainError::InternalError("Hosted room state missing.".to_string())
                })?;
                MultiplayerStatusDto {
                    state: MultiplayerModeState::Hosting,
                    room_id: Some(hosted.descriptor.room_id.clone()),
                    address: Some(hosted.advertise_address.clone()),
                    port: Some(hosted.port),
                    participant_id: Some(hosted.host_participant_id.clone()),
                    nickname: Some(hosted.nickname.clone()),
                    is_host: true,
                }
            }
            MultiplayerModeState::Joining | MultiplayerModeState::Joined => {
                let client = state.client.as_ref().ok_or_else(|| {
                    DomainError::InternalError("Client room state missing.".to_string())
                })?;
                MultiplayerStatusDto {
                    state: state.mode,
                    room_id: client.room_id.clone(),
                    address: Some(client.address.clone()),
                    port: None,
                    participant_id: client.participant_id.clone(),
                    nickname: Some(client.nickname.clone()),
                    is_host: false,
                }
            }
        })
    }

    pub async fn client_sender(&self) -> Result<OutgoingTx, DomainError> {
        let state = self.state.lock().await;
        let client = state.client.as_ref().ok_or_else(|| {
            DomainError::InvalidData("No active multiplayer client connection.".to_string())
        })?;
        Ok(client.sender.clone())
    }

    pub async fn register_pending_join(
        &self,
        room_id: String,
        nickname: String,
        character_name: String,
        character_avatar: String,
        character_card: Value,
        sender: OutgoingTx,
        peer_state: SharedServerPeerState,
    ) -> Result<(), DomainError> {
        let envelope = {
            let mut state = self.state.lock().await;
            if state.mode != MultiplayerModeState::Hosting {
                return Err(DomainError::InvalidData(
                    "No hosted room is active.".to_string(),
                ));
            }
            let hosted = state.hosted.as_mut().ok_or_else(|| {
                DomainError::InternalError("Hosted room state missing.".to_string())
            })?;
            if hosted.descriptor.room_id != room_id {
                return Err(DomainError::InvalidData(
                    "Room id does not match host.".to_string(),
                ));
            }

            let request_id = Uuid::new_v4().to_string();
            let requested_at = now_ms();
            {
                let mut peer = peer_state.lock().await;
                peer.request_id = Some(request_id.clone());
            }

            hosted.pending_joins.insert(
                request_id.clone(),
                PendingJoinRequest {
                    nickname: nickname.clone(),
                    character_name,
                    character_avatar,
                    character_card,
                    sender,
                    peer_state,
                },
            );

            let payload = to_value(JoinRequestEvent {
                request_id: request_id.clone(),
                nickname,
                character_name: hosted
                    .pending_joins
                    .get(&request_id)
                    .map(|pending| pending.character_name.clone())
                    .unwrap_or_default(),
                character_avatar: hosted
                    .pending_joins
                    .get(&request_id)
                    .map(|pending| pending.character_avatar.clone())
                    .unwrap_or_default(),
                requested_at,
            })
            .map_err(|error| DomainError::InternalError(error.to_string()))?;
            self.next_envelope_locked(hosted, "join_requested", payload)
        }?;

        self.emit_app_event(&envelope)?;
        Ok(())
    }

    pub async fn approve_join(&self, request_id: &str, accept: bool) -> Result<(), DomainError> {
        let mut app_envelopes = Vec::new();
        let mut direct_messages: Vec<(OutgoingTx, MultiplayerEnvelope)> = Vec::new();
        {
            let mut state = self.state.lock().await;
            if state.mode != MultiplayerModeState::Hosting {
                return Err(DomainError::InvalidData(
                    "No hosted room is active.".to_string(),
                ));
            }
            let hosted = state.hosted.as_mut().ok_or_else(|| {
                DomainError::InternalError("Hosted room state missing.".to_string())
            })?;
            let pending = hosted.pending_joins.remove(request_id).ok_or_else(|| {
                DomainError::NotFound(format!("Join request not found: {}", request_id))
            })?;

            if !accept {
                direct_messages.push((
                    pending.sender,
                    MultiplayerEnvelope::new(
                        "join_rejected",
                        hosted.descriptor.room_id.clone(),
                        0,
                        now_ms(),
                        to_value(JoinRejectedEvent {
                            message: "Join request rejected by host.".to_string(),
                        })
                        .map_err(|error| DomainError::InternalError(error.to_string()))?,
                    ),
                ));
            } else if hosted.participants.len() >= MAX_ROOM_PARTICIPANTS {
                direct_messages.push((
                    pending.sender,
                    MultiplayerEnvelope::new(
                        "join_rejected",
                        hosted.descriptor.room_id.clone(),
                        0,
                        now_ms(),
                        to_value(JoinRejectedEvent {
                            message: format!(
                                "Room is full. Up to {} participants are allowed.",
                                MAX_ROOM_PARTICIPANTS
                            ),
                        })
                        .map_err(|error| DomainError::InternalError(error.to_string()))?,
                    ),
                ));
            } else {
                let participant_id = format!("player-{}", Uuid::new_v4());
                let participant = RoomParticipant {
                    participant_id: participant_id.clone(),
                    nickname: pending.nickname.clone(),
                    is_host: false,
                    connected_at: now_ms(),
                    character_name: pending.character_name.clone(),
                    character_avatar: pending.character_avatar.clone(),
                    character_card: pending.character_card.clone(),
                };
                {
                    let mut peer = pending.peer_state.lock().await;
                    peer.participant_id = Some(participant_id.clone());
                }
                hosted
                    .participants
                    .insert(participant_id.clone(), participant.clone());
                hosted
                    .participant_senders
                    .insert(participant_id.clone(), pending.sender.clone());

                if let Some(snapshot) = hosted.latest_snapshot.as_mut() {
                    snapshot.participants = hosted.participants.values().cloned().collect();
                }
                direct_messages.push((
                    pending.sender.clone(),
                    MultiplayerEnvelope::new(
                        "join_approved",
                        hosted.descriptor.room_id.clone(),
                        0,
                        now_ms(),
                        to_value(JoinApprovedEvent {
                            participant_id: participant_id.clone(),
                            nickname: pending.nickname.clone(),
                        })
                        .map_err(|error| DomainError::InternalError(error.to_string()))?,
                    ),
                ));
                let snapshot = hosted
                    .latest_snapshot
                    .clone()
                    .unwrap_or(RoomSnapshotEnvelope {
                        room_id: hosted.descriptor.room_id.clone(),
                        session_key: hosted.descriptor.session_key.clone(),
                        session_file: hosted.descriptor.session_file.clone(),
                        scope_id: hosted.descriptor.scope_id.clone(),
                        scope_name: hosted.descriptor.scope_name.clone(),
                        bindings: json!({}),
                        participants: hosted.participants.values().cloned().collect(),
                        payload: json!([]),
                    });
                direct_messages.push((
                    pending.sender,
                    MultiplayerEnvelope::new(
                        "room_snapshot",
                        hosted.descriptor.room_id.clone(),
                        0,
                        now_ms(),
                        to_value(snapshot)
                            .map_err(|error| DomainError::InternalError(error.to_string()))?,
                    ),
                ));
                app_envelopes.push(
                    self.next_envelope_locked(
                        hosted,
                        "participant_joined",
                        to_value(participant)
                            .map_err(|error| DomainError::InternalError(error.to_string()))?,
                    )?,
                );
            }
        }

        for (sender, message) in direct_messages {
            let text = serde_json::to_string(&message)
                .map_err(|error| DomainError::InternalError(error.to_string()))?;
            sender.send(text).map_err(|_| {
                DomainError::InternalError("Failed to send multiplayer direct message.".to_string())
            })?;
        }

        for envelope in app_envelopes {
            self.broadcast_host_envelope(&envelope).await?;
        }
        Ok(())
    }

    pub async fn submit_host_contribution(
        &self,
        participant_id: String,
        nickname: String,
        content: String,
    ) -> Result<(), DomainError> {
        let envelope = {
            let mut state = self.state.lock().await;
            let hosted = state
                .hosted
                .as_mut()
                .ok_or_else(|| DomainError::InvalidData("No hosted room is active.".to_string()))?;
            if !hosted.participants.contains_key(&participant_id) {
                return Err(DomainError::InvalidData(
                    "Participant is not in the room.".to_string(),
                ));
            }
            let room_round_id = hosted.active_round_id.clone().unwrap_or_else(|| {
                let next = format!("round-{}", Uuid::new_v4());
                hosted.active_round_id = Some(next.clone());
                next
            });
            let contribution_id = format!("contrib-{}", Uuid::new_v4());
            hosted
                .contribution_authors
                .insert(contribution_id.clone(), participant_id.clone());
            let payload = to_value(ContributionEnvelope {
                contribution_id,
                room_round_id,
                participant_id,
                nickname,
                content,
                pending: true,
                sent_at: now_ms(),
            })
            .map_err(|error| DomainError::InternalError(error.to_string()))?;
            self.next_envelope_locked(hosted, "contribution_added", payload)
        }?;

        self.broadcast_host_envelope(&envelope).await
    }

    pub async fn withdraw_host_contribution(
        &self,
        participant_id: String,
        contribution_id: String,
    ) -> Result<(), DomainError> {
        let envelope = {
            let mut state = self.state.lock().await;
            let hosted = state
                .hosted
                .as_mut()
                .ok_or_else(|| DomainError::InvalidData("No hosted room is active.".to_string()))?;
            let owner = hosted
                .contribution_authors
                .get(&contribution_id)
                .cloned()
                .ok_or_else(|| DomainError::NotFound("Contribution not found.".to_string()))?;
            let is_host = participant_id == hosted.host_participant_id;
            if owner != participant_id && !is_host {
                return Err(DomainError::AuthenticationError(
                    "Only the contribution author or host can withdraw it.".to_string(),
                ));
            }
            hosted.contribution_authors.remove(&contribution_id);
            let payload = to_value(ContributionWithdrawnEnvelope {
                contribution_id,
                participant_id,
                withdrawn_at: now_ms(),
            })
            .map_err(|error| DomainError::InternalError(error.to_string()))?;
            self.next_envelope_locked(hosted, "contribution_withdrawn", payload)
        }?;

        self.broadcast_host_envelope(&envelope).await
    }

    pub async fn broadcast_host_event(
        &self,
        event_type: &str,
        payload: Value,
    ) -> Result<(), DomainError> {
        let envelope = {
            let mut state = self.state.lock().await;
            let hosted = state
                .hosted
                .as_mut()
                .ok_or_else(|| DomainError::InvalidData("No hosted room is active.".to_string()))?;
            match event_type {
                "room_snapshot" => {
                    let mut snapshot: RoomSnapshotEnvelope =
                        serde_json::from_value(payload.clone())
                            .map_err(|error| DomainError::InvalidData(error.to_string()))?;
                    snapshot.participants = hosted.participants.values().cloned().collect();
                    hosted.latest_snapshot = Some(snapshot.clone());
                    self.next_envelope_locked(
                        hosted,
                        event_type,
                        to_value(snapshot)
                            .map_err(|error| DomainError::InternalError(error.to_string()))?,
                    )
                }
                "bindings_updated" => {
                    if let Some(snapshot) = hosted.latest_snapshot.as_mut() {
                        snapshot.bindings = payload.clone();
                        snapshot.participants = hosted.participants.values().cloned().collect();
                    }
                    self.next_envelope_locked(hosted, event_type, payload)
                }
                "assistant_stream_done" | "assistant_stream_aborted" => {
                    hosted.active_round_id = None;
                    self.next_envelope_locked(hosted, event_type, payload)
                }
                _ => self.next_envelope_locked(hosted, event_type, payload),
            }
        }?;

        self.broadcast_host_envelope(&envelope).await
    }

    pub async fn handle_peer_message(
        &self,
        peer_state: SharedServerPeerState,
        sender: OutgoingTx,
        message_type: &str,
        payload: Value,
    ) -> Result<(), DomainError> {
        match message_type {
            "join_request" => {
                let room_id = payload
                    .get("room_id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let nickname = payload
                    .get("nickname")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .trim()
                    .to_string();
                if nickname.is_empty() {
                    return Err(DomainError::InvalidData(
                        "Nickname is required.".to_string(),
                    ));
                }
                let character_name = payload
                    .get("character_name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .trim()
                    .to_string();
                let character_avatar = payload
                    .get("character_avatar")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .trim()
                    .to_string();
                let character_card = payload
                    .get("character_card")
                    .cloned()
                    .unwrap_or(Value::Null);
                self.register_pending_join(
                    room_id,
                    nickname,
                    character_name,
                    character_avatar,
                    character_card,
                    sender,
                    peer_state,
                )
                .await
            }
            "submit_contribution" => {
                let content = payload
                    .get("content")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .trim()
                    .to_string();
                if content.is_empty() {
                    return Err(DomainError::InvalidData(
                        "Contribution content is required.".to_string(),
                    ));
                }
                let participant_id = {
                    let peer = peer_state.lock().await;
                    peer.participant_id.clone().ok_or_else(|| {
                        DomainError::AuthenticationError(
                            "Join approval is required before sending contributions.".to_string(),
                        )
                    })?
                };
                let nickname = {
                    let state = self.state.lock().await;
                    state
                        .hosted
                        .as_ref()
                        .and_then(|hosted| hosted.participants.get(&participant_id))
                        .map(|participant| participant.nickname.clone())
                        .ok_or_else(|| {
                            DomainError::InvalidData("Participant is not in the room.".to_string())
                        })?
                };
                self.submit_host_contribution(participant_id, nickname, content)
                    .await
            }
            "withdraw_contribution" => {
                let contribution_id = payload
                    .get("contribution_id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                if contribution_id.trim().is_empty() {
                    return Err(DomainError::InvalidData(
                        "Contribution id is required.".to_string(),
                    ));
                }
                let participant_id = {
                    let peer = peer_state.lock().await;
                    peer.participant_id.clone().ok_or_else(|| {
                        DomainError::AuthenticationError(
                            "Join approval is required before withdrawing contributions."
                                .to_string(),
                        )
                    })?
                };
                self.withdraw_host_contribution(participant_id, contribution_id)
                    .await
            }
            _ => Err(DomainError::InvalidData(
                "Unsupported multiplayer client message.".to_string(),
            )),
        }
    }

    pub async fn unregister_peer(
        &self,
        peer_state: SharedServerPeerState,
    ) -> Result<(), DomainError> {
        let maybe_envelope = {
            let mut state = self.state.lock().await;
            let Some(hosted) = state.hosted.as_mut() else {
                return Ok(());
            };
            let peer = peer_state.lock().await;
            if let Some(request_id) = peer.request_id.clone() {
                hosted.pending_joins.remove(&request_id);
            }
            let Some(participant_id) = peer.participant_id.clone() else {
                return Ok(());
            };
            if participant_id == hosted.host_participant_id {
                return Ok(());
            }
            let participant = hosted.participants.remove(&participant_id);
            hosted.participant_senders.remove(&participant_id);
            if let Some(snapshot) = hosted.latest_snapshot.as_mut() {
                snapshot.participants = hosted.participants.values().cloned().collect();
            }
            participant.map(|participant| {
                self.next_envelope_locked(
                    hosted,
                    "participant_left",
                    to_value(participant).expect("participant serialization should succeed"),
                )
            })
        };

        if let Some(result) = maybe_envelope {
            let envelope = result?;
            self.broadcast_host_envelope(&envelope).await?;
        }
        Ok(())
    }

    pub async fn host_identity(&self) -> Result<(String, String), DomainError> {
        let state = self.state.lock().await;
        let hosted = state
            .hosted
            .as_ref()
            .ok_or_else(|| DomainError::InvalidData("No hosted room is active.".to_string()))?;
        Ok((hosted.host_participant_id.clone(), hosted.nickname.clone()))
    }

    fn next_envelope_locked(
        &self,
        hosted: &mut HostedRoomState,
        event_type: &str,
        payload: Value,
    ) -> Result<MultiplayerEnvelope, DomainError> {
        let envelope = MultiplayerEnvelope::new(
            event_type,
            hosted.descriptor.room_id.clone(),
            hosted.next_seq,
            now_ms(),
            payload,
        );
        hosted.next_seq += 1;
        Ok(envelope)
    }

    async fn broadcast_host_envelope(
        &self,
        envelope: &MultiplayerEnvelope,
    ) -> Result<(), DomainError> {
        let text = serde_json::to_string(envelope)
            .map_err(|error| DomainError::InternalError(error.to_string()))?;
        let stale_participants = {
            let state = self.state.lock().await;
            let hosted = state
                .hosted
                .as_ref()
                .ok_or_else(|| DomainError::InvalidData("No hosted room is active.".to_string()))?;
            let mut stale = Vec::new();
            for (participant_id, sender) in &hosted.participant_senders {
                if sender.send(text.clone()).is_err() {
                    stale.push(participant_id.clone());
                }
            }
            stale
        };

        if !stale_participants.is_empty() {
            let mut state = self.state.lock().await;
            if let Some(hosted) = state.hosted.as_mut() {
                for participant_id in stale_participants {
                    hosted.participant_senders.remove(&participant_id);
                }
            }
        }

        self.emit_app_event(envelope)
    }

    fn emit_room_status(&self, status: MultiplayerStatusDto) -> Result<(), DomainError> {
        let envelope = MultiplayerEnvelope::new(
            "room_status",
            status.room_id.clone().unwrap_or_default(),
            0,
            now_ms(),
            to_value(status).map_err(|error| DomainError::InternalError(error.to_string()))?,
        );
        self.emit_app_event(&envelope)
    }

    pub fn emit_app_event(&self, envelope: &MultiplayerEnvelope) -> Result<(), DomainError> {
        self.app_handle
            .emit("multiplayer:event", envelope)
            .map_err(|error| DomainError::InternalError(error.to_string()))
    }
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
