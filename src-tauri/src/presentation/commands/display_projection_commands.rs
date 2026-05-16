use std::sync::Arc;

use tauri::State;

use crate::app::AppState;
use crate::application::dto::display_projection_dto::{
    ProjectChatDisplayRequestDto, ProjectChatDisplayResponseDto,
};
use crate::presentation::commands::helpers::{log_command, map_command_error};
use crate::presentation::errors::CommandError;

#[tauri::command]
pub async fn project_chat_display(
    dto: ProjectChatDisplayRequestDto,
    app_state: State<'_, Arc<AppState>>,
) -> Result<ProjectChatDisplayResponseDto, CommandError> {
    log_command("project_chat_display");

    app_state
        .display_projection_service
        .project_chat_display(dto)
        .await
        .map_err(map_command_error("Failed to project chat display"))
}
