use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolveGenerationBindingsRequestDto {
    pub payload: Value,
    pub fallback_draft: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolveGenerationBindingsResponseDto {
    pub draft: Value,
    pub preset_name: Option<String>,
    pub preset_name_normalized_from: Option<String>,
    pub preset_name_normalization: Option<String>,
    pub preset_restored_default: bool,
    pub normalized_bindings: Option<Value>,
    pub preset_draft: Option<Value>,
    pub world_info_block: String,
    pub issues: Vec<GenerationBindingIssueDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationBindingIssueDto {
    pub code: String,
    pub severity: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Vec<String>>,
}
