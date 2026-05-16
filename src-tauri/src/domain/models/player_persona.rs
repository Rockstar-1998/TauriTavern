use serde::{Deserialize, Serialize};

/// 独立于对话角色卡的玩家人设卡。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PlayerPersonaCard {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub personality: String,
    #[serde(default)]
    pub scenario: String,
    #[serde(default)]
    pub first_mes: String,
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default)]
    pub post_history_instructions: String,
    #[serde(default)]
    pub avatar: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
}

impl PlayerPersonaCard {
    pub fn validate(&self) -> Result<(), String> {
        if self.id.trim().is_empty() {
            return Err("Player persona id cannot be empty".to_string());
        }

        if self.name.trim().is_empty() {
            return Err("Player persona name cannot be empty".to_string());
        }

        Ok(())
    }
}

pub fn sanitize_player_persona_id(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            control if control.is_control() => '_',
            other => other,
        })
        .collect::<String>()
        .trim()
        .trim_end_matches(['.', ' '])
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::{PlayerPersonaCard, sanitize_player_persona_id};

    #[test]
    fn player_persona_validate_rejects_empty_id() {
        let card = PlayerPersonaCard {
            id: String::new(),
            name: "Player".to_string(),
            ..PlayerPersonaCard::default()
        };

        assert!(card.validate().is_err());
    }

    #[test]
    fn player_persona_validate_rejects_empty_name() {
        let card = PlayerPersonaCard {
            id: "player-one".to_string(),
            name: String::new(),
            ..PlayerPersonaCard::default()
        };

        assert!(card.validate().is_err());
    }

    #[test]
    fn sanitize_player_persona_id_replaces_invalid_characters() {
        assert_eq!(sanitize_player_persona_id("name/with\\unsafe:chars*?"), "name_with_unsafe_chars__");
    }
}
