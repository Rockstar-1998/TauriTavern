use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationTraceDto {
    pub request_id: String,
    pub created_at: String,
    pub streamed: bool,
    pub request: Value,
    pub response: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationTraceResultDto {
    pub path: String,
}
