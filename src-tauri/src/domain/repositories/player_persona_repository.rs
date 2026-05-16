use async_trait::async_trait;
use std::path::Path;

use crate::domain::errors::DomainError;
use crate::domain::models::player_persona::PlayerPersonaCard;

#[async_trait]
pub trait PlayerPersonaRepository: Send + Sync {
    async fn list_player_personas(&self) -> Result<Vec<PlayerPersonaCard>, DomainError>;
    async fn get_player_persona(&self, id: &str) -> Result<PlayerPersonaCard, DomainError>;
    async fn save_player_persona(
        &self,
        persona: &PlayerPersonaCard,
        avatar_path: Option<&Path>,
    ) -> Result<PlayerPersonaCard, DomainError>;
    async fn delete_player_persona(&self, id: &str) -> Result<(), DomainError>;
    async fn read_player_persona_avatar(&self, file_name: &str) -> Result<Vec<u8>, DomainError>;
}
