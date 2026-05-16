use std::path::PathBuf;
use std::sync::Arc;

use tauri::State;

use crate::app::AppState;
use crate::application::dto::player_persona_dto::{PlayerPersonaDto, SavePlayerPersonaDto};
use crate::presentation::commands::helpers::{log_command, map_command_error};
use crate::presentation::errors::CommandError;

#[tauri::command]
pub async fn list_player_personas(
    app_state: State<'_, Arc<AppState>>,
) -> Result<Vec<PlayerPersonaDto>, CommandError> {
    log_command("list_player_personas");

    app_state
        .player_persona_service
        .list_player_personas()
        .await
        .map_err(map_command_error("Failed to list player personas"))
}

#[tauri::command]
pub async fn get_player_persona(
    id: String,
    app_state: State<'_, Arc<AppState>>,
) -> Result<PlayerPersonaDto, CommandError> {
    log_command(format!("get_player_persona {}", id));

    app_state
        .player_persona_service
        .get_player_persona(&id)
        .await
        .map_err(map_command_error("Failed to get player persona"))
}

#[tauri::command]
pub async fn save_player_persona(
    dto: SavePlayerPersonaDto,
    avatar_path: Option<String>,
    app_state: State<'_, Arc<AppState>>,
) -> Result<PlayerPersonaDto, CommandError> {
    log_command(format!("save_player_persona {}", dto.name));

    let avatar_path_buf = avatar_path.as_deref().map(PathBuf::from);
    app_state
        .player_persona_service
        .save_player_persona(dto, avatar_path_buf.as_deref())
        .await
        .map_err(map_command_error("Failed to save player persona"))
}

#[tauri::command]
pub async fn delete_player_persona(
    id: String,
    app_state: State<'_, Arc<AppState>>,
) -> Result<(), CommandError> {
    log_command(format!("delete_player_persona {}", id));

    app_state
        .player_persona_service
        .delete_player_persona(&id)
        .await
        .map_err(map_command_error("Failed to delete player persona"))
}

#[tauri::command]
pub async fn read_player_persona_avatar_asset(
    file: String,
    app_state: State<'_, Arc<AppState>>,
) -> Result<Vec<u8>, CommandError> {
    log_command(format!("read_player_persona_avatar_asset {}", file));

    app_state
        .player_persona_service
        .read_player_persona_avatar(&file)
        .await
        .map_err(map_command_error("Failed to read player persona avatar"))
}
