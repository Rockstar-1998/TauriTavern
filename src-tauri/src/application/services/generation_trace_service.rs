use std::path::PathBuf;
use std::sync::Arc;

use chrono::Utc;
use serde::Serialize;
use tokio::fs;

use crate::application::dto::generation_trace_dto::{GenerationTraceDto, GenerationTraceResultDto};
use crate::application::errors::ApplicationError;
use crate::application::services::user_directory_service::UserDirectoryService;

const TRACE_DIRECTORY_NAME: &str = "generation-traces";

#[derive(Debug, Serialize)]
struct GenerationTraceFile<'a> {
    request_id: &'a str,
    created_at: &'a str,
    saved_at: String,
    streamed: bool,
    request: &'a serde_json::Value,
    response: &'a serde_json::Value,
}

pub struct GenerationTraceService {
    user_directory_service: Arc<UserDirectoryService>,
}

impl GenerationTraceService {
    pub fn new(user_directory_service: Arc<UserDirectoryService>) -> Self {
        Self {
            user_directory_service,
        }
    }

    pub async fn save_generation_trace(
        &self,
        dto: GenerationTraceDto,
    ) -> Result<GenerationTraceResultDto, ApplicationError> {
        let request_id = dto.request_id.trim();
        if request_id.is_empty() {
            return Err(ApplicationError::ValidationError(
                "Generation trace request_id is required".to_string(),
            ));
        }

        let created_at = if dto.created_at.trim().is_empty() {
            Utc::now().to_rfc3339()
        } else {
            dto.created_at.clone()
        };

        let directory = self
            .user_directory_service
            .get_default_user_directory()
            .await?;
        let traces_dir = PathBuf::from(directory.files).join(TRACE_DIRECTORY_NAME);

        fs::create_dir_all(&traces_dir).await.map_err(|error| {
            ApplicationError::InternalError(format!(
                "Failed to create generation trace directory: {}",
                error
            ))
        })?;

        let timestamp = Utc::now().format("%Y%m%d-%H%M%S%.3f").to_string();
        let safe_id = sanitize_request_id(request_id);
        let filename = format!("trace-{}-{}.json", timestamp, safe_id);
        let target_path = traces_dir.join(&filename);

        let payload = GenerationTraceFile {
            request_id,
            created_at: &created_at,
            saved_at: Utc::now().to_rfc3339(),
            streamed: dto.streamed,
            request: &dto.request,
            response: &dto.response,
        };

        let serialized = serde_json::to_vec_pretty(&payload).map_err(|error| {
            ApplicationError::InternalError(format!(
                "Failed to serialize generation trace: {}",
                error
            ))
        })?;

        fs::write(&target_path, serialized).await.map_err(|error| {
            ApplicationError::InternalError(format!("Failed to save generation trace: {}", error))
        })?;

        Ok(GenerationTraceResultDto {
            path: target_path.to_string_lossy().to_string(),
        })
    }
}

fn sanitize_request_id(raw: &str) -> String {
    let mut result = String::with_capacity(raw.len());
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            result.push(ch);
        } else {
            result.push('_');
        }
    }

    if result.is_empty() {
        "trace".to_string()
    } else {
        result
    }
}
