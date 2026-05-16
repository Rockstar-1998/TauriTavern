use std::sync::Arc;

use tauri::State;

use crate::app::AppState;
use crate::application::dto::generation_prepare_dto::{
    PrepareGenerationRequestDto, PrepareGenerationResponseDto,
};
use crate::presentation::commands::helpers::{log_command, map_command_error};
use crate::presentation::errors::CommandError;

#[tauri::command]
pub async fn prepare_generation(
    dto: PrepareGenerationRequestDto,
    app_state: State<'_, Arc<AppState>>,
) -> Result<PrepareGenerationResponseDto, CommandError> {
    log_command("prepare_generation");

    app_state
        .generation_prepare_service
        .prepare(dto)
        .await
        .map_err(map_command_error("Failed to prepare generation"))
}
