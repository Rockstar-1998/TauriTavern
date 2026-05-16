use serde::{Deserialize, Serialize};

use crate::domain::models::player_persona::PlayerPersonaCard;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PlayerPersonaDto {
    pub id: String,
    pub name: String,
    pub description: String,
    pub personality: String,
    pub scenario: String,
    pub first_mes: String,
    pub system_prompt: String,
    pub post_history_instructions: String,
    pub avatar: String,
    pub tags: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SavePlayerPersonaDto {
    pub id: Option<String>,
    pub name: String,
    pub description: String,
    pub personality: String,
    pub scenario: String,
    pub first_mes: String,
    pub system_prompt: String,
    pub post_history_instructions: String,
    pub avatar: String,
    pub tags: Vec<String>,
}

impl From<PlayerPersonaCard> for PlayerPersonaDto {
    fn from(card: PlayerPersonaCard) -> Self {
        Self {
            id: card.id,
            name: card.name,
            description: card.description,
            personality: card.personality,
            scenario: card.scenario,
            first_mes: card.first_mes,
            system_prompt: card.system_prompt,
            post_history_instructions: card.post_history_instructions,
            avatar: card.avatar,
            tags: card.tags,
            created_at: card.created_at,
            updated_at: card.updated_at,
        }
    }
}
