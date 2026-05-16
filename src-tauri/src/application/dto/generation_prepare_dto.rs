use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Mode of generation: reply, regenerate, or continue.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GenerationMode {
    Reply,
    Regenerate,
    Continue,
}

/// Frontend sends this to request a fully prepared generation request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrepareGenerationRequestDto {
    /// The full chat payload (header + messages).
    pub payload: Value,
    /// Generation mode.
    pub mode: GenerationMode,
    /// Target message index for regenerate/continue (1-based from messages, not header).
    #[serde(default)]
    pub target_message_index: Option<usize>,
    /// Fallback provider draft from current UI settings.
    pub fallback_draft: Value,
    /// Current user name.
    pub user_name: String,
    /// Current assistant/character name.
    pub assistant_name: String,
    /// Character detail (description, personality, scenario, mes_example, system_prompt, etc.).
    #[serde(default)]
    pub character: Option<Value>,
    /// Group detail if in group chat.
    #[serde(default)]
    pub group: Option<Value>,
    /// Multiplayer participants with role-card payload already synchronized from the room state.
    #[serde(default)]
    pub multiplayer_participants: Vec<Value>,
    /// Whether windowed chat needs full hydration (frontend passes pre-hydrated payload).
    #[serde(default)]
    pub hydrated: bool,
    /// Total message count for windowed chat (may exceed payload length).
    #[serde(default)]
    pub total_messages: Option<usize>,
    /// Start index for windowed chat history.
    #[serde(default)]
    pub start_index: Option<usize>,
}

/// A single issue or notice from the prepare pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrepareGenerationIssueDto {
    pub code: String,
    pub severity: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Vec<String>>,
}

/// A notice for the frontend to display (toast).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrepareGenerationNoticeDto {
    pub code: String,
    pub tone: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// Sanitize stats from prompt manager repair.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PromptRepairStatsDto {
    pub renamed: usize,
    pub generated: usize,
    pub removed_order: usize,
    pub added_order: usize,
}

/// Prompt manager sanitize result metadata.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PromptSanitizeStatusDto {
    pub inherited: bool,
    pub migrated: bool,
    pub migrated_map: bool,
    pub repaired: bool,
    pub stats: PromptRepairStatsDto,
}

/// Request sanitize result metadata.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RequestSanitizeStatusDto {
    pub removed: Vec<String>,
    pub stream_adjusted: bool,
}

/// Token usage summary for the prepared request.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PrepareGenerationUsageDto {
    pub model: String,
    pub prompt_tokens: usize,
    pub max_context_tokens: usize,
    pub remaining_context_tokens: usize,
    pub usage_ratio: f64,
    pub within_limit: bool,
}

/// The fully prepared generation response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrepareGenerationResponseDto {
    /// The ready-to-send generation request (matches GenerationRequest schema).
    pub request: Value,
    /// Preset draft used (for display-period regex projection on frontend).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preset_draft: Option<Value>,
    /// Normalized session bindings if preset name was normalized.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub normalized_bindings: Option<Value>,
    /// Blocking issues that prevented preparation.
    pub issues: Vec<PrepareGenerationIssueDto>,
    /// Non-blocking notices for frontend toasts.
    pub notices: Vec<PrepareGenerationNoticeDto>,
    /// Prompt manager sanitize status.
    pub prompt_status: PromptSanitizeStatusDto,
    /// Request sanitize status.
    pub request_status: RequestSanitizeStatusDto,
    /// Token usage summary for the prepared request.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<PrepareGenerationUsageDto>,
    /// Resolved preset name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preset_name: Option<String>,
    /// Whether preset was restored from defaults.
    #[serde(default)]
    pub preset_restored_default: bool,
}
