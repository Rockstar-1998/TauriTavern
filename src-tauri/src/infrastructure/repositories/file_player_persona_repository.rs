use async_trait::async_trait;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::fs;

use crate::domain::errors::DomainError;
use crate::domain::models::player_persona::{
    PlayerPersonaCard, sanitize_player_persona_id,
};
use crate::domain::repositories::player_persona_repository::PlayerPersonaRepository;
use crate::infrastructure::persistence::file_system::{delete_file, list_files_with_extension, read_json_file, write_json_file};

pub struct FilePlayerPersonaRepository {
    personas_dir: PathBuf,
    persona_avatars_dir: PathBuf,
}

impl FilePlayerPersonaRepository {
    pub fn new(personas_dir: PathBuf, persona_avatars_dir: PathBuf) -> Self {
        Self {
            personas_dir,
            persona_avatars_dir,
        }
    }

    async fn ensure_directories_exist(&self) -> Result<(), DomainError> {
        if !self.personas_dir.exists() {
            fs::create_dir_all(&self.personas_dir).await.map_err(|error| {
                DomainError::InternalError(format!(
                    "Failed to create player persona directory {}: {}",
                    self.personas_dir.display(),
                    error
                ))
            })?;
        }

        if !self.persona_avatars_dir.exists() {
            fs::create_dir_all(&self.persona_avatars_dir).await.map_err(|error| {
                DomainError::InternalError(format!(
                    "Failed to create player persona avatar directory {}: {}",
                    self.persona_avatars_dir.display(),
                    error
                ))
            })?;
        }

        Ok(())
    }

    fn persona_path(&self, id: &str) -> Result<PathBuf, DomainError> {
        let file_stem = sanitize_player_persona_id(id);
        if file_stem.is_empty() {
            return Err(DomainError::InvalidData(
                "Player persona id is invalid".to_string(),
            ));
        }

        Ok(self.personas_dir.join(format!("{file_stem}.json")))
    }

    fn avatar_path(&self, file_name: &str) -> Result<PathBuf, DomainError> {
        let safe_name = sanitize_player_persona_id(file_name);
        if safe_name.is_empty() {
            return Err(DomainError::InvalidData(
                "Player persona avatar file name is invalid".to_string(),
            ));
        }

        Ok(self.persona_avatars_dir.join(safe_name))
    }

    fn timestamp_ms() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64
    }

    fn normalize_card(mut persona: PlayerPersonaCard) -> Result<PlayerPersonaCard, DomainError> {
        persona.id = sanitize_player_persona_id(&persona.id);
        persona.avatar = sanitize_player_persona_id(&persona.avatar);
        persona.tags = persona
            .tags
            .into_iter()
            .map(|tag| tag.trim().to_string())
            .filter(|tag| !tag.is_empty())
            .collect();
        persona.validate().map_err(DomainError::InvalidData)?;
        Ok(persona)
    }
}

#[async_trait]
impl PlayerPersonaRepository for FilePlayerPersonaRepository {
    async fn list_player_personas(&self) -> Result<Vec<PlayerPersonaCard>, DomainError> {
        self.ensure_directories_exist().await?;
        let files = list_files_with_extension(&self.personas_dir, "json").await?;
        let mut personas = Vec::new();

        for file in files {
            let persona = read_json_file::<PlayerPersonaCard>(&file).await?;
            personas.push(Self::normalize_card(persona)?);
        }

        personas.sort_by(|left, right| left.name.cmp(&right.name));
        Ok(personas)
    }

    async fn get_player_persona(&self, id: &str) -> Result<PlayerPersonaCard, DomainError> {
        self.ensure_directories_exist().await?;
        let path = self.persona_path(id)?;
        if !path.exists() {
            return Err(DomainError::NotFound(format!(
                "Player persona not found: {}",
                id
            )));
        }

        let persona = read_json_file::<PlayerPersonaCard>(&path).await?;
        Self::normalize_card(persona)
    }

    async fn save_player_persona(
        &self,
        persona: &PlayerPersonaCard,
        avatar_path: Option<&Path>,
    ) -> Result<PlayerPersonaCard, DomainError> {
        self.ensure_directories_exist().await?;
        let mut normalized = Self::normalize_card(persona.clone())?;
        let now = Self::timestamp_ms();
        if normalized.created_at <= 0 {
            normalized.created_at = now;
        }
        normalized.updated_at = now;

        if let Some(source_avatar_path) = avatar_path {
            let extension = source_avatar_path
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| value.trim().to_lowercase())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "png".to_string());
            normalized.avatar = format!("{}.{}", normalized.id, extension);
            let target_avatar_path = self.avatar_path(&normalized.avatar)?;
            fs::copy(source_avatar_path, &target_avatar_path).await.map_err(|error| {
                DomainError::InternalError(format!(
                    "Failed to copy player persona avatar to {}: {}",
                    target_avatar_path.display(),
                    error
                ))
            })?;
        }

        let path = self.persona_path(&normalized.id)?;
        write_json_file(&path, &normalized).await?;
        Ok(normalized)
    }

    async fn delete_player_persona(&self, id: &str) -> Result<(), DomainError> {
        self.ensure_directories_exist().await?;
        let path = self.persona_path(id)?;
        if !path.exists() {
            return Ok(());
        }

        let persona = read_json_file::<PlayerPersonaCard>(&path).await?;
        if !persona.avatar.trim().is_empty() {
            let avatar_path = self.avatar_path(&persona.avatar)?;
            delete_file(&avatar_path).await?;
        }

        delete_file(&path).await
    }

    async fn read_player_persona_avatar(&self, file_name: &str) -> Result<Vec<u8>, DomainError> {
        self.ensure_directories_exist().await?;
        let path = self.avatar_path(file_name)?;
        if !path.exists() {
            return Err(DomainError::NotFound(format!(
                "Player persona avatar not found: {}",
                file_name
            )));
        }

        fs::read(&path).await.map_err(|error| {
            DomainError::InternalError(format!(
                "Failed to read player persona avatar {}: {}",
                path.display(),
                error
            ))
        })
    }
}
