use std::sync::Arc;

use serde_json::{Map, Value, json};

use crate::application::dto::generation_prepare_dto::{
    GenerationMode, PrepareGenerationIssueDto, PrepareGenerationNoticeDto,
    PrepareGenerationRequestDto, PrepareGenerationResponseDto, PrepareGenerationUsageDto,
    PromptSanitizeStatusDto, RequestSanitizeStatusDto,
};
use crate::application::errors::ApplicationError;
use crate::domain::repositories::settings_repository::SettingsRepository;

use super::generation_binding_service::GenerationBindingService;
use super::generation_prepare_helpers::*;
use super::tokenization_service::TokenizationService;

pub struct GenerationPrepareService {
    settings_repository: Arc<dyn SettingsRepository>,
    generation_binding_service: Arc<GenerationBindingService>,
    tokenization_service: Arc<TokenizationService>,
}

impl GenerationPrepareService {
    pub fn new(
        settings_repository: Arc<dyn SettingsRepository>,
        generation_binding_service: Arc<GenerationBindingService>,
        tokenization_service: Arc<TokenizationService>,
    ) -> Self {
        Self {
            settings_repository,
            generation_binding_service,
            tokenization_service,
        }
    }

    pub async fn prepare(
        &self,
        dto: PrepareGenerationRequestDto,
    ) -> Result<PrepareGenerationResponseDto, ApplicationError> {
        let mut issues: Vec<PrepareGenerationIssueDto> = Vec::new();
        let mut notices: Vec<PrepareGenerationNoticeDto> = Vec::new();

        if let Some(issue) = validate_multiplayer_round_request(
            &dto.payload,
            &dto.mode,
            &dto.multiplayer_participants,
        ) {
            issues.push(issue);
        }

        // Step 1: Resolve generation bindings
        let resolved = self
            .generation_binding_service
            .resolve_generation_bindings(dto.payload.clone(), dto.fallback_draft.clone())
            .await?;

        for iss in &resolved.issues {
            issues.push(PrepareGenerationIssueDto {
                code: iss.code.clone(),
                severity: iss.severity.clone(),
                details: iss.details.clone(),
            });
        }

        let has_blocking = issues.iter().any(|i| i.severity == "blocking");
        if has_blocking && resolved.preset_draft.is_none() {
            return Ok(PrepareGenerationResponseDto {
                request: Value::Null,
                preset_draft: None,
                normalized_bindings: resolved.normalized_bindings,
                issues,
                notices,
                prompt_status: PromptSanitizeStatusDto::default(),
                request_status: RequestSanitizeStatusDto::default(),
                usage: None,
                preset_name: resolved.preset_name,
                preset_restored_default: resolved.preset_restored_default,
            });
        }

        if let (Some(from), Some(to)) =
            (&resolved.preset_name_normalized_from, &resolved.preset_name)
        {
            notices.push(mk_notice(
                "preset_normalized",
                "warning",
                Some(format!("{from} → {to}")),
            ));
        }
        if resolved.preset_restored_default {
            notices.push(mk_notice(
                "preset_restored_default",
                "default",
                resolved.preset_name.clone(),
            ));
        }

        // Step 2: Load settings and apply preset
        let settings = self.settings_repository.load_user_settings().await?.data;
        let settings_obj = obj(&settings);
        let base_oai = obj(settings_obj.get("oai_settings").unwrap_or(&Value::Null));

        let preset_draft_val = resolved.preset_draft.clone().unwrap_or(Value::Null);
        let effective_settings = if preset_draft_val.is_null() {
            settings.clone()
        } else {
            apply_preset_draft(&settings, &preset_draft_val)
        };
        let effective_obj = obj(&effective_settings);
        let raw_oai = obj(effective_obj.get("oai_settings").unwrap_or(&Value::Null));

        // Step 3: Prompt manager sanitize
        let ps = sanitize_prompts(
            raw_oai.get("prompts").unwrap_or(&Value::Null),
            raw_oai.get("prompt_order").unwrap_or(&Value::Null),
            base_oai.get("prompts"),
            base_oai.get("prompt_order"),
        );
        emit_prompt_notices(&ps, &mut notices);

        let mut eff_oai = raw_oai;
        eff_oai.insert("prompts".into(), ps.prompts_value.clone());
        eff_oai.insert("prompt_order".into(), ps.prompt_order.clone());

        // Step 4: Compose messages
        let character_obj = dto.character.as_ref().map(|v| obj(v)).unwrap_or_default();
        let group_obj = dto.group.as_ref().map(|v| obj(v));
        let is_group = group_obj.is_some();
        let group_name = group_obj
            .as_ref()
            .and_then(|g| g.get("name"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let group_members: Vec<String> = group_obj
            .as_ref()
            .and_then(|g| g.get("members"))
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(Value::as_str)
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default();
        let preset_draft_obj = resolved
            .preset_draft
            .as_ref()
            .map(|v| obj(v))
            .unwrap_or_default();

        let messages = compose_messages(
            &dto.payload,
            &dto.mode,
            dto.target_message_index,
            &ps.prompts_value,
            &ps.prompt_order,
            &resolved.world_info_block,
            &eff_oai,
            &settings_obj,
            &dto.user_name,
            &dto.assistant_name,
            &character_obj,
            group_obj.as_ref(),
            &dto.multiplayer_participants,
            &preset_draft_obj,
            dto.start_index.unwrap_or(0),
            dto.total_messages,
            is_group,
            &group_name,
        );

        // Step 5: Build request
        let gen_type = match dto.mode {
            GenerationMode::Continue => "continue",
            GenerationMode::Regenerate => "swipe",
            GenerationMode::Reply => "normal",
        };
        let provider_draft = obj(&resolved.draft);
        let mut req = build_request(
            &provider_draft,
            &eff_oai,
            gen_type,
            &dto.user_name,
            &dto.assistant_name,
            &group_members,
        );

        // Attach messages
        let msg_arr: Vec<Value> = messages
            .iter()
            .map(|m| {
                let mut o = Map::new();
                o.insert("role".into(), json!(m.role));
                o.insert("content".into(), json!(m.content));
                if let Some(n) = &m.name {
                    o.insert("name".into(), json!(n));
                }
                Value::Object(o)
            })
            .collect();
        req.insert("messages".into(), Value::Array(msg_arr));

        // Step 6: Validate model
        let model = req
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        if model.is_empty() {
            issues.push(issue("missing_model", "blocking"));
            return Ok(PrepareGenerationResponseDto {
                request: Value::Object(req),
                preset_draft: resolved.preset_draft,
                normalized_bindings: resolved.normalized_bindings,
                issues,
                notices,
                prompt_status: ps.to_dto(),
                request_status: RequestSanitizeStatusDto::default(),
                usage: None,
                preset_name: resolved.preset_name,
                preset_restored_default: resolved.preset_restored_default,
            });
        }
        req.insert("model".into(), json!(model));

        // Step 7: Stopping strings
        let stop = resolve_stop_strings(
            &settings_obj,
            &dto.user_name,
            &dto.assistant_name,
            &group_members,
            4,
        );
        if let Some(err) = &stop.error {
            notices.push(mk_notice(
                "stop_strings_invalid",
                "danger",
                Some(err.clone()),
            ));
        }
        if !stop.stop.is_empty() {
            req.insert("stop".into(), json!(stop.stop));
        }

        // Step 8: Logprobs
        let pu = obj(settings_obj.get("power_user").unwrap_or(&Value::Null));
        let req_probs = vbool(
            pu.get("request_token_probabilities")
                .unwrap_or(&Value::Null),
        );
        let source = req
            .get("chat_completion_source")
            .and_then(Value::as_str)
            .unwrap_or("openai")
            .to_string();
        if req_probs && ["openai", "openrouter", "custom"].contains(&source.as_str()) {
            req.insert("logprobs".into(), json!(5));
        }

        // Step 9: Validate n
        if req.get("n").and_then(Value::as_f64).unwrap_or(1.0) > 1.0 {
            issues.push(issue("multi_swipe_unsupported", "blocking"));
            return Ok(PrepareGenerationResponseDto {
                request: Value::Object(req),
                preset_draft: resolved.preset_draft,
                normalized_bindings: resolved.normalized_bindings,
                issues,
                notices,
                prompt_status: ps.to_dto(),
                request_status: RequestSanitizeStatusDto::default(),
                usage: None,
                preset_name: resolved.preset_name,
                preset_restored_default: resolved.preset_restored_default,
            });
        }

        // Step 10: Sanitize request
        let san = sanitize_request(&mut req);
        if san.stream_adjusted {
            notices.push(mk_notice("stream_unsupported", "warning", None));
        }
        if !san.removed.is_empty() {
            notices.push(mk_notice(
                "params_ignored",
                "warning",
                Some(san.removed.join(", ")),
            ));
        }

        // Step 11: Logit bias
        let bias_entries = extract_logit_bias(&eff_oai);
        if ["openai", "openrouter", "custom"].contains(&source.as_str())
            && !bias_entries.is_empty()
            && !san.removed.contains(&"logit_bias".to_string())
        {
            let bias_dto = crate::application::dto::tokenization_dto::OpenAiLogitBiasRequestDto {
                model: model.clone(),
                entries: bias_entries
                    .iter()
                    .map(
                        |(t, v)| crate::application::dto::tokenization_dto::LogitBiasEntryDto {
                            text: t.clone(),
                            value: *v,
                        },
                    )
                    .collect(),
            };
            match self
                .tokenization_service
                .build_openai_logit_bias(bias_dto)
                .await
            {
                Ok(bias) if !bias.is_empty() => {
                    let m: Map<String, Value> =
                        bias.into_iter().map(|(k, v)| (k, json!(v))).collect();
                    req.insert("logit_bias".into(), Value::Object(m));
                }
                Err(e) => {
                    notices.push(mk_notice(
                        "logit_bias_failed",
                        "danger",
                        Some(e.to_string()),
                    ));
                }
                _ => {}
            }
        }

        let usage = self.build_usage(&provider_draft, &eff_oai, &req, &model).await;

        Ok(PrepareGenerationResponseDto {
            request: Value::Object(req),
            preset_draft: resolved.preset_draft,
            normalized_bindings: resolved.normalized_bindings,
            issues,
            notices,
            prompt_status: ps.to_dto(),
            request_status: RequestSanitizeStatusDto {
                removed: san.removed,
                stream_adjusted: san.stream_adjusted,
            },
            usage,
            preset_name: resolved.preset_name,
            preset_restored_default: resolved.preset_restored_default,
        })
    }

    async fn build_usage(
        &self,
        provider_draft: &Map<String, Value>,
        eff_oai: &Map<String, Value>,
        req: &Map<String, Value>,
        model: &str,
    ) -> Option<PrepareGenerationUsageDto> {
        let messages = req.get("messages").and_then(Value::as_array)?.clone();
        let prompt_tokens = match self
            .tokenization_service
            .count_openai_tokens(
                crate::application::dto::tokenization_dto::OpenAiTokenCountRequestDto {
                    model: model.to_string(),
                    messages,
                },
            )
            .await
        {
            Ok(response) => response.token_count,
            Err(_) => return None,
        };
        let max_context_tokens = resolve_max_context_tokens(eff_oai, provider_draft);
        let remaining_context_tokens = max_context_tokens.saturating_sub(prompt_tokens);
        let usage_ratio = if max_context_tokens > 0 {
            prompt_tokens as f64 / max_context_tokens as f64
        } else {
            0.0
        };

        Some(PrepareGenerationUsageDto {
            model: model.to_string(),
            prompt_tokens,
            max_context_tokens,
            remaining_context_tokens,
            usage_ratio,
            within_limit: max_context_tokens == 0 || prompt_tokens <= max_context_tokens,
        })
    }
}

fn emit_prompt_notices(ps: &PromptSanitizeResult, notices: &mut Vec<PrepareGenerationNoticeDto>) {
    if ps.inherited {
        notices.push(mk_notice("prompt_inherited", "warning", None));
    }
    if ps.migrated_map {
        notices.push(mk_notice("prompt_migrated_map", "default", None));
    } else if ps.migrated {
        notices.push(mk_notice("prompt_migrated", "default", None));
    }
    let rc = ps.stats.renamed + ps.stats.generated + ps.stats.added_order + ps.stats.removed_order;
    if ps.repaired && rc > 0 {
        notices.push(mk_notice(
            "prompt_repaired",
            "warning",
            Some(format!(
                "renamed={}, added={}, removed={}",
                ps.stats.renamed + ps.stats.generated,
                ps.stats.added_order,
                ps.stats.removed_order
            )),
        ));
    }
}

fn resolve_max_context_tokens(oai: &Map<String, Value>, provider_draft: &Map<String, Value>) -> usize {
    read_usize(provider_draft, &["openai_max_context", "max_context"])
        .or_else(|| read_usize(oai, &["openai_max_context", "max_context"]))
        .unwrap_or(0)
}

fn read_usize(map: &Map<String, Value>, keys: &[&str]) -> Option<usize> {
    keys.iter().find_map(|key| map.get(*key).and_then(value_to_usize))
}

fn value_to_usize(value: &Value) -> Option<usize> {
    match value {
        Value::Number(number) => number
            .as_u64()
            .and_then(|value| usize::try_from(value).ok())
            .or_else(|| {
                number
                    .as_i64()
                    .filter(|value| *value >= 0)
                    .and_then(|value| usize::try_from(value).ok())
            }),
        Value::String(text) => text.trim().parse::<usize>().ok(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::{resolve_max_context_tokens, value_to_usize};

    #[test]
    fn generation_prepare_usage_prefers_runtime_provider_context_limit() {
        let oai = match json!({ "openai_max_context": 4096 }) {
            Value::Object(map) => map,
            _ => unreachable!(),
        };
        let provider = match json!({ "openai_max_context": "8192" }) {
            Value::Object(map) => map,
            _ => unreachable!(),
        };

        assert_eq!(resolve_max_context_tokens(&oai, &provider), 8192);
    }

    #[test]
    fn generation_prepare_usage_reads_numeric_string_limit() {
        assert_eq!(value_to_usize(&Value::String("16384".to_string())), Some(16384));
    }
}
