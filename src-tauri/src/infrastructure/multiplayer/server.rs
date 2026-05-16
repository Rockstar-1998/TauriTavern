use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    Router,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
    routing::get,
};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{mpsc, oneshot};

use crate::domain::errors::DomainError;
use crate::infrastructure::multiplayer::protocol::ClientRoomMessage;
use crate::infrastructure::multiplayer::runtime::{MultiplayerRuntime, ServerPeerState};

pub struct MultiplayerServerHandle {
    pub addr: SocketAddr,
    shutdown_tx: oneshot::Sender<()>,
    _task: tokio::task::JoinHandle<()>,
}

impl MultiplayerServerHandle {
    pub fn shutdown(self) {
        let _ = self.shutdown_tx.send(());
    }
}

pub async fn spawn_multiplayer_server(
    addr: SocketAddr,
    runtime: Arc<MultiplayerRuntime>,
) -> std::io::Result<MultiplayerServerHandle> {
    let listener = tokio::net::TcpListener::bind(addr).await?;
    let addr = listener.local_addr()?;
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    let app = Router::new()
        .route("/v1/multiplayer/room", get(handle_ws))
        .with_state(runtime);

    let task = tokio::spawn(async move {
        if let Err(error) = axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        })
        .await
        {
            tracing::error!("Multiplayer server failed: {}", error);
        }
    });

    Ok(MultiplayerServerHandle {
        addr,
        shutdown_tx,
        _task: task,
    })
}

async fn handle_ws(
    ws: WebSocketUpgrade,
    State(runtime): State<Arc<MultiplayerRuntime>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(error) = handle_socket(socket, runtime).await {
            tracing::error!("Multiplayer socket error: {}", error);
        }
    })
}

async fn handle_socket(
    socket: WebSocket,
    runtime: Arc<MultiplayerRuntime>,
) -> Result<(), DomainError> {
    let (mut sink, mut stream) = socket.split();
    let (outgoing_tx, mut outgoing_rx) = mpsc::unbounded_channel::<String>();
    let peer_state = Arc::new(tokio::sync::Mutex::new(ServerPeerState::default()));

    let writer = tokio::spawn(async move {
        while let Some(message) = outgoing_rx.recv().await {
            if sink.send(Message::Text(message.into())).await.is_err() {
                break;
            }
        }
    });

    while let Some(message) = stream.next().await {
        match message {
            Ok(Message::Text(text)) => {
                let client_message = serde_json::from_str::<ClientRoomMessage>(text.as_str())
                    .map_err(|error| DomainError::InvalidData(error.to_string()))?;
                match client_message {
                    ClientRoomMessage::JoinRequest {
                        room_id,
                        nickname,
                        character_name,
                        character_avatar,
                        character_card,
                    } => {
                        runtime
                            .handle_peer_message(
                                peer_state.clone(),
                                outgoing_tx.clone(),
                                "join_request",
                                serde_json::json!({
                                    "room_id": room_id,
                                    "nickname": nickname,
                                    "character_name": character_name,
                                    "character_avatar": character_avatar,
                                    "character_card": character_card,
                                }),
                            )
                            .await?;
                    }
                    ClientRoomMessage::SubmitContribution { content } => {
                        runtime
                            .handle_peer_message(
                                peer_state.clone(),
                                outgoing_tx.clone(),
                                "submit_contribution",
                                serde_json::json!({ "content": content }),
                            )
                            .await?;
                    }
                    ClientRoomMessage::WithdrawContribution { contribution_id } => {
                        runtime
                            .handle_peer_message(
                                peer_state.clone(),
                                outgoing_tx.clone(),
                                "withdraw_contribution",
                                serde_json::json!({ "contribution_id": contribution_id }),
                            )
                            .await?;
                    }
                }
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(error) => {
                tracing::warn!("Multiplayer socket closed with error: {}", error);
                break;
            }
        }
    }

    runtime.unregister_peer(peer_state).await?;
    writer.abort();
    Ok(())
}
