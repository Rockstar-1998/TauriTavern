use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use url::Url;

use crate::domain::errors::DomainError;
use crate::domain::models::multiplayer::{JoinRoomDto, MultiplayerEnvelope};
use crate::infrastructure::multiplayer::protocol::ClientRoomMessage;
use crate::infrastructure::multiplayer::runtime::MultiplayerRuntime;

pub struct MultiplayerClientHandle {
    sender: mpsc::UnboundedSender<String>,
    shutdown_tx: oneshot::Sender<()>,
    _task: tokio::task::JoinHandle<()>,
}

impl MultiplayerClientHandle {
    pub fn sender(&self) -> mpsc::UnboundedSender<String> {
        self.sender.clone()
    }

    pub fn shutdown(self) {
        let _ = self.shutdown_tx.send(());
    }
}

pub async fn spawn_multiplayer_client(
    url: Url,
    runtime: Arc<MultiplayerRuntime>,
    dto: JoinRoomDto,
) -> Result<MultiplayerClientHandle, DomainError> {
    let (socket, _) = connect_async(url.as_str())
        .await
        .map_err(|error| DomainError::InternalError(error.to_string()))?;

    let (outgoing_tx, mut outgoing_rx) = mpsc::unbounded_channel::<String>();
    let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();
    let initial_join = serde_json::to_string(&ClientRoomMessage::JoinRequest {
        room_id: String::new(),
        nickname: dto.nickname.clone(),
        character_name: dto.character_name.clone(),
        character_avatar: dto.character_avatar.clone(),
        character_card: dto.character_card.clone(),
    })
    .map_err(|error| DomainError::InternalError(error.to_string()))?;

    let task = tokio::spawn(async move {
        let (mut sink, mut stream) = socket.split();
        if sink.send(Message::Text(initial_join.into())).await.is_err() {
            let _ = runtime
                .handle_client_disconnect(Some("Failed to submit join request."))
                .await;
            return;
        }

        loop {
            tokio::select! {
                _ = &mut shutdown_rx => {
                    let _ = sink.close().await;
                    let _ = runtime.handle_client_disconnect(None).await;
                    break;
                }
                outgoing = outgoing_rx.recv() => {
                    let Some(outgoing) = outgoing else {
                        let _ = sink.close().await;
                        let _ = runtime.handle_client_disconnect(None).await;
                        break;
                    };
                    if sink.send(Message::Text(outgoing.into())).await.is_err() {
                        let _ = runtime.handle_client_disconnect(Some("Connection to host was lost.")).await;
                        break;
                    }
                }
                incoming = stream.next() => {
                    match incoming {
                        Some(Ok(Message::Text(text))) => {
                            match serde_json::from_str::<MultiplayerEnvelope>(text.as_str()) {
                                Ok(envelope) => {
                                    let _ = runtime.handle_remote_envelope(&envelope).await;
                                }
                                Err(error) => {
                                    let _ = runtime.handle_client_disconnect(Some(&format!("Invalid room event: {}", error))).await;
                                    break;
                                }
                            }
                        }
                        Some(Ok(Message::Close(_))) => {
                            let _ = runtime.handle_client_disconnect(Some("Host closed the room connection.")).await;
                            break;
                        }
                        Some(Ok(_)) => {}
                        Some(Err(error)) => {
                            let _ = runtime.handle_client_disconnect(Some(&format!("Room connection error: {}", error))).await;
                            break;
                        }
                        None => {
                            let _ = runtime.handle_client_disconnect(Some("Room connection closed.")).await;
                            break;
                        }
                    }
                }
            }
        }
    });

    Ok(MultiplayerClientHandle {
        sender: outgoing_tx,
        shutdown_tx,
        _task: task,
    })
}
