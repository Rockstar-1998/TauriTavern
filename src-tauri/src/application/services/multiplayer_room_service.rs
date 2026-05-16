use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;

use local_ip_address::local_ip;
use tokio::sync::Mutex;
use url::Url;

use crate::domain::errors::DomainError;
use crate::domain::models::multiplayer::{
    ApproveJoinDto, BroadcastEventDto, JoinRoomDto, MultiplayerModeState, MultiplayerStatusDto,
    RoomDescriptor, StartHostDto, SubmitContributionDto, WithdrawContributionDto,
};
use crate::infrastructure::multiplayer::client::{
    MultiplayerClientHandle, spawn_multiplayer_client,
};
use crate::infrastructure::multiplayer::protocol::ClientRoomMessage;
use crate::infrastructure::multiplayer::runtime::MultiplayerRuntime;
use crate::infrastructure::multiplayer::server::{
    MultiplayerServerHandle, spawn_multiplayer_server,
};

pub struct MultiplayerRoomService {
    runtime: Arc<MultiplayerRuntime>,
    server: Mutex<Option<MultiplayerServerHandle>>,
    client: Mutex<Option<MultiplayerClientHandle>>,
}

impl MultiplayerRoomService {
    pub fn new(runtime: Arc<MultiplayerRuntime>) -> Self {
        Self {
            runtime,
            server: Mutex::new(None),
            client: Mutex::new(None),
        }
    }

    pub async fn start_host(&self, dto: StartHostDto) -> Result<MultiplayerStatusDto, DomainError> {
        self.runtime.ensure_idle().await?;

        let listen_addr = SocketAddr::from((Ipv4Addr::UNSPECIFIED, dto.port.unwrap_or(0)));
        let server_handle = spawn_multiplayer_server(listen_addr, self.runtime.clone())
            .await
            .map_err(|error| DomainError::InternalError(error.to_string()))?;
        let advertise_ip = resolve_advertise_ip();
        let advertise_address = format!("{}:{}", advertise_ip, server_handle.addr.port());

        let status = self
            .runtime
            .enter_hosting(
                RoomDescriptor {
                    room_id: dto.room_id,
                    session_key: dto.session_key,
                    scope_id: dto.scope_id,
                    scope_name: dto.scope_name,
                    session_file: dto.session_file,
                },
                dto.nickname,
                dto.character_name,
                dto.character_avatar,
                dto.character_card,
                server_handle.addr.port(),
                advertise_address,
            )
            .await?;

        let mut server = self.server.lock().await;
        *server = Some(server_handle);
        Ok(status)
    }

    pub async fn stop_host(&self) -> Result<MultiplayerStatusDto, DomainError> {
        if let Some(server) = self.server.lock().await.take() {
            server.shutdown();
        }
        self.runtime.transition_to_idle().await?;
        self.runtime.current_status().await
    }

    pub async fn join_room(&self, dto: JoinRoomDto) -> Result<MultiplayerStatusDto, DomainError> {
        self.runtime.ensure_idle().await?;
        let url = normalize_room_ws_url(&dto.address)?;
        let client_handle =
            spawn_multiplayer_client(url, self.runtime.clone(), dto.clone()).await?;
        let status = self
            .runtime
            .enter_joining(dto.address, dto.nickname, client_handle.sender())
            .await?;
        let mut client = self.client.lock().await;
        *client = Some(client_handle);
        Ok(status)
    }

    pub async fn leave_room(&self) -> Result<MultiplayerStatusDto, DomainError> {
        if let Some(client) = self.client.lock().await.take() {
            client.shutdown();
        }
        self.runtime.transition_to_idle().await?;
        self.runtime.current_status().await
    }

    pub async fn submit_contribution(
        &self,
        dto: SubmitContributionDto,
    ) -> Result<MultiplayerStatusDto, DomainError> {
        let status = self.runtime.current_status().await?;
        match status.state {
            MultiplayerModeState::Hosting => {
                let (participant_id, nickname) = self.runtime.host_identity().await?;
                self.runtime
                    .submit_host_contribution(participant_id, nickname, dto.content)
                    .await?;
            }
            MultiplayerModeState::Joined => {
                let sender = self.runtime.client_sender().await?;
                let payload = serde_json::to_string(&ClientRoomMessage::SubmitContribution {
                    content: dto.content,
                })
                .map_err(|error| DomainError::InternalError(error.to_string()))?;
                sender.send(payload).map_err(|_| {
                    DomainError::InternalError("Failed to send contribution to host.".to_string())
                })?;
            }
            _ => {
                return Err(DomainError::InvalidData(
                    "Join or host a multiplayer room before sending messages.".to_string(),
                ));
            }
        }
        self.runtime.current_status().await
    }

    pub async fn withdraw_contribution(
        &self,
        dto: WithdrawContributionDto,
    ) -> Result<MultiplayerStatusDto, DomainError> {
        let status = self.runtime.current_status().await?;
        match status.state {
            MultiplayerModeState::Hosting => {
                let (participant_id, _) = self.runtime.host_identity().await?;
                self.runtime
                    .withdraw_host_contribution(participant_id, dto.contribution_id)
                    .await?;
            }
            MultiplayerModeState::Joined => {
                let sender = self.runtime.client_sender().await?;
                let payload = serde_json::to_string(&ClientRoomMessage::WithdrawContribution {
                    contribution_id: dto.contribution_id,
                })
                .map_err(|error| DomainError::InternalError(error.to_string()))?;
                sender.send(payload).map_err(|_| {
                    DomainError::InternalError(
                        "Failed to withdraw contribution via host.".to_string(),
                    )
                })?;
            }
            _ => {
                return Err(DomainError::InvalidData(
                    "No multiplayer room is active.".to_string(),
                ));
            }
        }
        self.runtime.current_status().await
    }

    pub async fn approve_join(
        &self,
        dto: ApproveJoinDto,
    ) -> Result<MultiplayerStatusDto, DomainError> {
        self.runtime
            .approve_join(&dto.request_id, dto.accept)
            .await?;
        self.runtime.current_status().await
    }

    pub async fn broadcast_event(
        &self,
        dto: BroadcastEventDto,
    ) -> Result<MultiplayerStatusDto, DomainError> {
        self.runtime
            .broadcast_host_event(&dto.event_type, dto.payload)
            .await?;
        self.runtime.current_status().await
    }
}

fn resolve_advertise_ip() -> IpAddr {
    local_ip().unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST))
}

fn normalize_room_ws_url(address: &str) -> Result<Url, DomainError> {
    let trimmed = address.trim();
    if trimmed.is_empty() {
        return Err(DomainError::InvalidData(
            "Host address is required.".to_string(),
        ));
    }

    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("ws://{}", trimmed)
    };

    let mut url =
        Url::parse(&candidate).map_err(|error| DomainError::InvalidData(error.to_string()))?;

    match url.scheme() {
        "http" => {
            url.set_scheme("ws").map_err(|_| {
                DomainError::InvalidData("Invalid room address scheme.".to_string())
            })?;
        }
        "https" => {
            url.set_scheme("wss").map_err(|_| {
                DomainError::InvalidData("Invalid room address scheme.".to_string())
            })?;
        }
        "ws" | "wss" => {}
        _ => {
            return Err(DomainError::InvalidData(
                "Room address must use ws, wss, http, or https.".to_string(),
            ));
        }
    }

    if url.path().is_empty() || url.path() == "/" {
        url.set_path("/v1/multiplayer/room");
    }

    Ok(url)
}
