use std::sync::Arc;

use tauri::State;

use crate::app::AppState;
use crate::application::dto::generation_trace_dto::{GenerationTraceDto, GenerationTraceResultDto};
use crate::presentation::commands::helpers::{log_command, map_command_error};
use crate::presentation::errors::CommandError;

#[tauri::command]
pub async fn save_generation_trace(
    dto: GenerationTraceDto,
    app_state: State<'_, Arc<AppState>>,
) -> Result<GenerationTraceResultDto, CommandError> {
    log_command(format!("save_generation_trace {}", dto.request_id));

    app_state
        .generation_trace_service
        .save_generation_trace(dto)
        .await
        .map_err(map_command_error("Failed to save generation trace"))
}
