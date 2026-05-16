use std::sync::Arc;

use tauri::State;

use crate::app::AppState;
use crate::application::dto::generation_binding_dto::{
    ResolveGenerationBindingsRequestDto, ResolveGenerationBindingsResponseDto,
};
use crate::presentation::commands::helpers::{log_command, map_command_error};
use crate::presentation::errors::CommandError;

#[tauri::command]
pub async fn resolve_generation_bindings(
    dto: ResolveGenerationBindingsRequestDto,
    app_state: State<'_, Arc<AppState>>,
) -> Result<ResolveGenerationBindingsResponseDto, CommandError> {
    log_command("resolve_generation_bindings");

    app_state
        .generation_binding_service
        .resolve_generation_bindings(dto.payload, dto.fallback_draft)
        .await
        .map_err(map_command_error("Failed to resolve generation bindings"))
}
