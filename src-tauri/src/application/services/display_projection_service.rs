use std::sync::Arc;

use serde_json::Value;

use crate::application::dto::display_projection_dto::{
    DisplayProjectionReasonDto, ProjectChatDisplayRequestDto, ProjectChatDisplayResponseDto,
};
use crate::application::errors::ApplicationError;

use super::generation_binding_service::GenerationBindingService;
use super::generation_prepare_helpers::project_chat_display_payload;

pub struct DisplayProjectionService {
    generation_binding_service: Arc<GenerationBindingService>,
}

impl DisplayProjectionService {
    pub fn new(generation_binding_service: Arc<GenerationBindingService>) -> Self {
        Self {
            generation_binding_service,
        }
    }

    pub async fn project_chat_display(
        &self,
        dto: ProjectChatDisplayRequestDto,
    ) -> Result<ProjectChatDisplayResponseDto, ApplicationError> {
        let reason = match dto.reason {
            DisplayProjectionReasonDto::Edit => "edit",
            DisplayProjectionReasonDto::Default => "default",
        };

        let resolved_preset_draft = if dto.preset_draft.is_some() {
            dto.preset_draft.clone()
        } else {
            self.generation_binding_service
                .resolve_generation_bindings(dto.payload.clone(), Value::Null)
                .await?
                .preset_draft
        };

        let payload = project_chat_display_payload(
            &dto.payload,
            resolved_preset_draft.as_ref(),
            dto.start_index.unwrap_or(0),
            dto.total_messages,
            dto.target_message_index,
            dto.persist_canonical,
            dto.source_text_override.as_deref(),
            reason,
            &dto.user_name,
            &dto.assistant_name,
            dto.group_name.as_deref(),
            dto.is_group,
        );

        Ok(ProjectChatDisplayResponseDto { payload })
    }
}
