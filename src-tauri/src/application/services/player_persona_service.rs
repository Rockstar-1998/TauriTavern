use std::path::Path;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::application::dto::player_persona_dto::{PlayerPersonaDto, SavePlayerPersonaDto};
use crate::application::errors::ApplicationError;
use crate::domain::models::player_persona::{PlayerPersonaCard, sanitize_player_persona_id};
use crate::domain::repositories::player_persona_repository::PlayerPersonaRepository;

pub struct PlayerPersonaService {
    repository: Arc<dyn PlayerPersonaRepository>,
}

impl PlayerPersonaService {
    pub fn new(repository: Arc<dyn PlayerPersonaRepository>) -> Self {
        Self { repository }
    }

    pub async fn list_player_personas(&self) -> Result<Vec<PlayerPersonaDto>, ApplicationError> {
        let personas = self.repository.list_player_personas().await?;
        Ok(personas.into_iter().map(PlayerPersonaDto::from).collect())
    }

    pub async fn get_player_persona(&self, id: &str) -> Result<PlayerPersonaDto, ApplicationError> {
        let persona = self.repository.get_player_persona(id).await?;
        Ok(PlayerPersonaDto::from(persona))
    }

    pub async fn save_player_persona(
        &self,
        dto: SavePlayerPersonaDto,
        avatar_path: Option<&Path>,
    ) -> Result<PlayerPersonaDto, ApplicationError> {
        let persona = Self::build_player_persona(dto)?;
        let saved = self.repository.save_player_persona(&persona, avatar_path).await?;
        Ok(PlayerPersonaDto::from(saved))
    }

    pub async fn delete_player_persona(&self, id: &str) -> Result<(), ApplicationError> {
        if id.trim().is_empty() {
            return Err(ApplicationError::ValidationError(
                "Player persona id is required".to_string(),
            ));
        }

        self.repository.delete_player_persona(id).await?;
        Ok(())
    }

    pub async fn read_player_persona_avatar(
        &self,
        file_name: &str,
    ) -> Result<Vec<u8>, ApplicationError> {
        if file_name.trim().is_empty() {
            return Err(ApplicationError::ValidationError(
                "Player persona avatar file name is required".to_string(),
            ));
        }

        self.repository
            .read_player_persona_avatar(file_name)
            .await
            .map_err(ApplicationError::from)
    }

    fn build_player_persona(dto: SavePlayerPersonaDto) -> Result<PlayerPersonaCard, ApplicationError> {
        let name = dto.name.trim().to_string();
        if name.is_empty() {
            return Err(ApplicationError::ValidationError(
                "Player persona name is required".to_string(),
            ));
        }

        let id = dto
            .id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .unwrap_or_else(|| Self::generate_persona_id(&name));

        let persona = PlayerPersonaCard {
            id,
            name,
            description: dto.description.trim().to_string(),
            personality: dto.personality.trim().to_string(),
            scenario: dto.scenario.trim().to_string(),
            first_mes: dto.first_mes.trim().to_string(),
            system_prompt: dto.system_prompt.trim().to_string(),
            post_history_instructions: dto.post_history_instructions.trim().to_string(),
            avatar: sanitize_player_persona_id(dto.avatar.trim()),
            tags: dto
                .tags
                .into_iter()
                .map(|tag| tag.trim().to_string())
                .filter(|tag| !tag.is_empty())
                .collect(),
            created_at: 0,
            updated_at: 0,
        };

        persona
            .validate()
            .map_err(ApplicationError::ValidationError)?;

        Ok(persona)
    }

    fn generate_persona_id(name: &str) -> String {
        let base = sanitize_player_persona_id(name)
            .to_lowercase()
            .replace(' ', "-")
            .trim_matches('-')
            .to_string();
        let fallback = if base.is_empty() {
            "user"
        } else {
            base.as_str()
        };
        format!("{}-{}", fallback, Self::timestamp_ms())
    }

    fn timestamp_ms() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64
    }
}
