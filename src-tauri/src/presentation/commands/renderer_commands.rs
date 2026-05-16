use std::sync::Arc;

use tauri::State;

use crate::app::AppState;
use crate::domain::models::renderer::{
    DeleteRendererPackageResult, ImportRendererPackageDto, RendererManifest,
};
use crate::presentation::commands::helpers::{log_command, map_command_error};
use crate::presentation::errors::CommandError;

#[tauri::command]
pub async fn list_renderer_packages(
    app_state: State<'_, Arc<AppState>>,
) -> Result<Vec<RendererManifest>, CommandError> {
    log_command("list_renderer_packages");

    app_state
        .renderer_service
        .list_renderers()
        .await
        .map_err(map_command_error("Failed to list renderer packages"))
}

#[tauri::command]
pub async fn import_renderer_package(
    dto: ImportRendererPackageDto,
    app_state: State<'_, Arc<AppState>>,
) -> Result<RendererManifest, CommandError> {
    log_command(format!("import_renderer_package {}", dto.file_name));

    app_state
        .renderer_service
        .import_renderer_package(&dto.file_name, &dto.data)
        .await
        .map_err(map_command_error("Failed to import renderer package"))
}

#[tauri::command]
pub async fn delete_renderer_package(
    renderer_id: String,
    app_state: State<'_, Arc<AppState>>,
) -> Result<DeleteRendererPackageResult, CommandError> {
    log_command(format!("delete_renderer_package {}", renderer_id));

    app_state
        .renderer_service
        .delete_renderer_package(&renderer_id)
        .await
        .map(|ok| DeleteRendererPackageResult { ok })
        .map_err(map_command_error("Failed to delete renderer package"))
}
