use std::sync::Arc;

use serde_json::Value;
use tauri::State;

use crate::app::AppState;
use crate::presentation::commands::helpers::{log_command, map_command_error};
use crate::presentation::errors::CommandError;

#[tauri::command]
pub async fn get_workbench_stats(
    app_state: State<'_, Arc<AppState>>,
) -> Result<Value, CommandError> {
    log_command("get_workbench_stats");

    app_state
        .workbench_stats_service
        .get_stats()
        .await
        .map_err(map_command_error("Failed to get workbench stats"))
}

#[tauri::command]
pub async fn update_workbench_stats(
    stats: Value,
    app_state: State<'_, Arc<AppState>>,
) -> Result<Value, CommandError> {
    log_command("update_workbench_stats");

    app_state
        .workbench_stats_service
        .update_stats(stats)
        .await
        .map_err(map_command_error("Failed to update workbench stats"))
}

#[tauri::command]
pub async fn recreate_workbench_stats(
    app_state: State<'_, Arc<AppState>>,
) -> Result<Value, CommandError> {
    log_command("recreate_workbench_stats");

    app_state
        .workbench_stats_service
        .recreate_stats()
        .await
        .map_err(map_command_error("Failed to recreate workbench stats"))
}
