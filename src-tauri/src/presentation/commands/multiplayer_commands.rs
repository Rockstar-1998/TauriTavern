use std::sync::Arc;

use tauri::State;

use crate::app::AppState;
use crate::domain::models::multiplayer::{
    ApproveJoinDto, BroadcastEventDto, JoinRoomDto, MultiplayerStatusDto, StartHostDto,
    SubmitContributionDto, WithdrawContributionDto,
};
use crate::presentation::commands::helpers::{log_command, map_command_error};
use crate::presentation::errors::CommandError;

#[tauri::command]
pub async fn multiplayer_start_host(
    app_state: State<'_, Arc<AppState>>,
    dto: StartHostDto,
) -> Result<MultiplayerStatusDto, CommandError> {
    log_command("multiplayer_start_host");
    app_state
        .multiplayer_room_service
        .start_host(dto)
        .await
        .map_err(map_command_error("Failed to start multiplayer host"))
}

#[tauri::command]
pub async fn multiplayer_stop_host(
    app_state: State<'_, Arc<AppState>>,
) -> Result<MultiplayerStatusDto, CommandError> {
    log_command("multiplayer_stop_host");
    app_state
        .multiplayer_room_service
        .stop_host()
        .await
        .map_err(map_command_error("Failed to stop multiplayer host"))
}

#[tauri::command]
pub async fn multiplayer_join_room(
    app_state: State<'_, Arc<AppState>>,
    dto: JoinRoomDto,
) -> Result<MultiplayerStatusDto, CommandError> {
    log_command("multiplayer_join_room");
    app_state
        .multiplayer_room_service
        .join_room(dto)
        .await
        .map_err(map_command_error("Failed to join multiplayer room"))
}

#[tauri::command]
pub async fn multiplayer_leave_room(
    app_state: State<'_, Arc<AppState>>,
) -> Result<MultiplayerStatusDto, CommandError> {
    log_command("multiplayer_leave_room");
    app_state
        .multiplayer_room_service
        .leave_room()
        .await
        .map_err(map_command_error("Failed to leave multiplayer room"))
}

#[tauri::command]
pub async fn multiplayer_submit_contribution(
    app_state: State<'_, Arc<AppState>>,
    dto: SubmitContributionDto,
) -> Result<MultiplayerStatusDto, CommandError> {
    log_command("multiplayer_submit_contribution");
    app_state
        .multiplayer_room_service
        .submit_contribution(dto)
        .await
        .map_err(map_command_error(
            "Failed to submit multiplayer contribution",
        ))
}

#[tauri::command]
pub async fn multiplayer_withdraw_contribution(
    app_state: State<'_, Arc<AppState>>,
    dto: WithdrawContributionDto,
) -> Result<MultiplayerStatusDto, CommandError> {
    log_command("multiplayer_withdraw_contribution");
    app_state
        .multiplayer_room_service
        .withdraw_contribution(dto)
        .await
        .map_err(map_command_error(
            "Failed to withdraw multiplayer contribution",
        ))
}

#[tauri::command]
pub async fn multiplayer_approve_join(
    app_state: State<'_, Arc<AppState>>,
    dto: ApproveJoinDto,
) -> Result<MultiplayerStatusDto, CommandError> {
    log_command("multiplayer_approve_join");
    app_state
        .multiplayer_room_service
        .approve_join(dto)
        .await
        .map_err(map_command_error(
            "Failed to approve multiplayer join request",
        ))
}

#[tauri::command]
pub async fn multiplayer_broadcast_event(
    app_state: State<'_, Arc<AppState>>,
    dto: BroadcastEventDto,
) -> Result<MultiplayerStatusDto, CommandError> {
    log_command("multiplayer_broadcast_event");
    app_state
        .multiplayer_room_service
        .broadcast_event(dto)
        .await
        .map_err(map_command_error("Failed to broadcast multiplayer event"))
}
