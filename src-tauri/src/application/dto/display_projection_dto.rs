use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DisplayProjectionReasonDto {
    #[default]
    Default,
    Edit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectChatDisplayRequestDto {
    pub payload: Value,
    #[serde(default)]
    pub preset_draft: Option<Value>,
    #[serde(default)]
    pub start_index: Option<usize>,
    #[serde(default)]
    pub total_messages: Option<usize>,
    #[serde(default)]
    pub target_message_index: Option<usize>,
    #[serde(default)]
    pub persist_canonical: bool,
    #[serde(default)]
    pub source_text_override: Option<String>,
    #[serde(default)]
    pub reason: DisplayProjectionReasonDto,
    #[serde(default)]
    pub user_name: String,
    #[serde(default)]
    pub assistant_name: String,
    #[serde(default)]
    pub group_name: Option<String>,
    #[serde(default)]
    pub is_group: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectChatDisplayResponseDto {
    pub payload: Value,
}
