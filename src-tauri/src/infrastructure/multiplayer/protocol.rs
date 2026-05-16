use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientRoomMessage {
    JoinRequest {
        room_id: String,
        nickname: String,
        character_name: String,
        character_avatar: String,
        character_card: Value,
    },
    SubmitContribution { content: String },
    WithdrawContribution { contribution_id: String },
}
