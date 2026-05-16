use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MultiplayerModeState {
    Idle,
    Hosting,
    Joining,
    Joined,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RoomDescriptor {
    pub room_id: String,
    pub session_key: String,
    pub scope_id: String,
    pub scope_name: String,
    pub session_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RoomParticipant {
    pub participant_id: String,
    pub nickname: String,
    #[serde(default)]
    pub is_host: bool,
    #[serde(default)]
    pub connected_at: u64,
    #[serde(default)]
    pub character_name: String,
    #[serde(default)]
    pub character_avatar: String,
    #[serde(default)]
    pub character_card: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct JoinRequestEvent {
    pub request_id: String,
    pub nickname: String,
    #[serde(default)]
    pub character_name: String,
    #[serde(default)]
    pub character_avatar: String,
    pub requested_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct JoinApprovedEvent {
    pub participant_id: String,
    pub nickname: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct JoinRejectedEvent {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ContributionEnvelope {
    pub contribution_id: String,
    pub room_round_id: String,
    pub participant_id: String,
    pub nickname: String,
    pub content: String,
    #[serde(default)]
    pub pending: bool,
    pub sent_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ContributionWithdrawnEnvelope {
    pub contribution_id: String,
    pub participant_id: String,
    pub withdrawn_at: u64,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AssistantStreamEnvelope {
    pub assistant_message_key: String,
    #[serde(default)]
    pub delta: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RoomSnapshotEnvelope {
    pub room_id: String,
    pub session_key: String,
    pub session_file: String,
    pub scope_id: String,
    pub scope_name: String,
    #[serde(default)]
    pub bindings: Value,
    #[serde(default)]
    pub participants: Vec<RoomParticipant>,
    #[serde(default)]
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct MultiplayerStatusDto {
    pub state: MultiplayerModeState,
    pub room_id: Option<String>,
    pub address: Option<String>,
    pub port: Option<u16>,
    pub participant_id: Option<String>,
    pub nickname: Option<String>,
    pub is_host: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct MultiplayerEnvelope {
    #[serde(rename = "type")]
    pub event_type: String,
    pub room_id: String,
    #[serde(default)]
    pub seq: u64,
    #[serde(default)]
    pub sent_at: u64,
    #[serde(default)]
    pub payload: Value,
}

impl MultiplayerEnvelope {
    pub fn new(
        event_type: impl Into<String>,
        room_id: impl Into<String>,
        seq: u64,
        sent_at: u64,
        payload: Value,
    ) -> Self {
        Self {
            event_type: event_type.into(),
            room_id: room_id.into(),
            seq,
            sent_at,
            payload,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct StartHostDto {
    pub room_id: String,
    pub session_key: String,
    pub scope_id: String,
    pub scope_name: String,
    pub session_file: String,
    pub nickname: String,
    #[serde(default)]
    pub character_name: String,
    #[serde(default)]
    pub character_avatar: String,
    #[serde(default)]
    pub character_card: Value,
    pub port: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct JoinRoomDto {
    pub address: String,
    pub nickname: String,
    #[serde(default)]
    pub character_name: String,
    #[serde(default)]
    pub character_avatar: String,
    #[serde(default)]
    pub character_card: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SubmitContributionDto {
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct WithdrawContributionDto {
    pub contribution_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ApproveJoinDto {
    pub request_id: String,
    pub accept: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct BroadcastEventDto {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(default)]
    pub payload: Value,
}
