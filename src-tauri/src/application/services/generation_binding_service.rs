use std::collections::{BTreeMap, HashSet};
use std::sync::Arc;

use serde_json::{Map, Value, json};

use crate::application::dto::generation_binding_dto::{
    GenerationBindingIssueDto, ResolveGenerationBindingsResponseDto,
};
use crate::application::errors::ApplicationError;
use crate::domain::models::preset::{PresetType, canonical_preset_name};
use crate::domain::repositories::preset_repository::PresetRepository;
use crate::domain::repositories::settings_repository::SettingsRepository;
use crate::domain::repositories::world_info_repository::WorldInfoRepository;

const MISSING_API_PROFILE: &str = "missing_api_profile";
const MISSING_PRESET: &str = "missing_preset";
const MISSING_PRESET_BINDING: &str = "missing_preset_binding";
const MISSING_WORLD_INFO: &str = "missing_world_info";

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct SessionBindings {
    world_info_names: Vec<String>,
    preset_name: Option<String>,
    api_profile_id: Option<String>,
}

#[derive(Debug, Clone)]
struct TimelineMessage {
    name: String,
    mes: String,
}

#[derive(Debug, Clone)]
struct ResolvedPreset {
    name: String,
    draft: Value,
    normalized_from: Option<String>,
    normalized_reason: Option<&'static str>,
    restored_default: bool,
}

#[derive(Debug, Clone)]
struct BoundWorldInfoResolution {
    context_block: String,
    missing_books: Vec<String>,
}

#[derive(Debug, Clone)]
struct NormalizedWorldInfoEntry {
    world: String,
    uid: String,
    key: Vec<String>,
    keysecondary: Vec<String>,
    content: String,
    selective: bool,
    selective_logic: i64,
    order: i64,
    disable: bool,
    probability: f64,
    use_probability: bool,
    exclude_recursion: bool,
    prevent_recursion: bool,
    delay_until_recursion: bool,
    case_sensitive: Option<bool>,
    match_whole_words: Option<bool>,
}

pub struct GenerationBindingService {
    settings_repository: Arc<dyn SettingsRepository>,
    preset_repository: Arc<dyn PresetRepository>,
    world_info_repository: Arc<dyn WorldInfoRepository>,
}

impl GenerationBindingService {
    pub fn new(
        settings_repository: Arc<dyn SettingsRepository>,
        preset_repository: Arc<dyn PresetRepository>,
        world_info_repository: Arc<dyn WorldInfoRepository>,
    ) -> Self {
        Self {
            settings_repository,
            preset_repository,
            world_info_repository,
        }
    }

    pub async fn resolve_generation_bindings(
        &self,
        payload: Value,
        fallback_draft: Value,
    ) -> Result<ResolveGenerationBindingsResponseDto, ApplicationError> {
        let bindings = resolve_session_bindings(&payload);
        let settings = self.settings_repository.load_user_settings().await?.data;
        let mut issues = Vec::new();

        let draft = if let Some(profile_id) = bindings.api_profile_id.as_deref() {
            if let Some(profile_settings) = find_api_profile_settings(&settings, profile_id) {
                read_provider_settings(&profile_settings)
            } else {
                issues.push(issue(
                    MISSING_API_PROFILE,
                    "blocking",
                    Some(vec![profile_id.to_string()]),
                ));
                normalize_provider_draft(&fallback_draft)
            }
        } else {
            normalize_provider_draft(&fallback_draft)
        };

        let mut preset_name = None;
        let mut preset_name_normalized_from = None;
        let mut preset_name_normalization = None;
        let mut preset_restored_default = false;
        let mut normalized_bindings = None;
        let mut preset_draft = None;

        if let Some(bound_name) = bindings.preset_name.as_deref() {
            match self.resolve_bound_preset(bound_name).await? {
                Some(resolved) => {
                    preset_name = Some(resolved.name.clone());
                    preset_name_normalized_from = resolved.normalized_from.clone();
                    preset_name_normalization = resolved.normalized_reason.map(str::to_string);
                    preset_restored_default = resolved.restored_default;
                    preset_draft = Some(resolved.draft);
                    if preset_name_normalized_from.is_some() {
                        normalized_bindings = Some(serialize_bindings(&SessionBindings {
                            preset_name: Some(resolved.name),
                            ..bindings.clone()
                        }));
                    }
                }
                None => {
                    issues.push(issue(
                        MISSING_PRESET,
                        "blocking",
                        Some(vec![bound_name.to_string()]),
                    ));
                }
            }
        } else {
            issues.push(issue(MISSING_PRESET_BINDING, "blocking", None));
        }

        let world_info = self.resolve_bound_world_info(&bindings, &payload).await?;
        if !world_info.missing_books.is_empty() {
            issues.push(issue(
                MISSING_WORLD_INFO,
                "warning",
                Some(world_info.missing_books),
            ));
        }

        Ok(ResolveGenerationBindingsResponseDto {
            draft,
            preset_name,
            preset_name_normalized_from,
            preset_name_normalization,
            preset_restored_default,
            normalized_bindings,
            preset_draft,
            world_info_block: world_info.context_block,
            issues,
        })
    }

    async fn resolve_bound_preset(
        &self,
        preset_name: &str,
    ) -> Result<Option<ResolvedPreset>, ApplicationError> {
        let preset_name = preset_name.trim();
        if preset_name.is_empty() {
            return Ok(None);
        }

        if let Some(draft) = self.load_preset_draft(preset_name).await? {
            return Ok(Some(ResolvedPreset {
                name: preset_name.to_string(),
                draft,
                normalized_from: None,
                normalized_reason: None,
                restored_default: false,
            }));
        }

        let stripped = strip_json_suffix(preset_name);
        if !stripped.is_empty() && stripped != preset_name {
            if let Some(draft) = self.load_preset_draft(&stripped).await? {
                return Ok(Some(ResolvedPreset {
                    name: stripped,
                    draft,
                    normalized_from: Some(preset_name.to_string()),
                    normalized_reason: Some("strip_extension"),
                    restored_default: false,
                }));
            }

            if let Some(draft) = self.restore_default_preset_draft(&stripped).await? {
                return Ok(Some(ResolvedPreset {
                    name: stripped,
                    draft,
                    normalized_from: Some(preset_name.to_string()),
                    normalized_reason: Some("strip_extension"),
                    restored_default: true,
                }));
            }
        }

        let canonical = canonical_preset_name(preset_name);
        if !canonical.is_empty() && canonical != preset_name {
            if let Some(draft) = self.load_preset_draft(&canonical).await? {
                return Ok(Some(ResolvedPreset {
                    name: canonical,
                    draft,
                    normalized_from: Some(preset_name.to_string()),
                    normalized_reason: Some("canonical"),
                    restored_default: false,
                }));
            }

            if let Some(draft) = self.restore_default_preset_draft(&canonical).await? {
                return Ok(Some(ResolvedPreset {
                    name: canonical,
                    draft,
                    normalized_from: Some(preset_name.to_string()),
                    normalized_reason: Some("canonical"),
                    restored_default: true,
                }));
            }
        }

        if let Some(draft) = self.restore_default_preset_draft(preset_name).await? {
            return Ok(Some(ResolvedPreset {
                name: preset_name.to_string(),
                draft,
                normalized_from: None,
                normalized_reason: None,
                restored_default: true,
            }));
        }

        let preset_names = self
            .preset_repository
            .list_presets(&PresetType::OpenAI)
            .await?;

        if let Some(case_match) = find_case_insensitive_match(preset_name, &preset_names) {
            if let Some(draft) = self.load_preset_draft(&case_match).await? {
                return Ok(Some(ResolvedPreset {
                    name: case_match,
                    draft,
                    normalized_from: Some(preset_name.to_string()),
                    normalized_reason: Some("case_insensitive"),
                    restored_default: false,
                }));
            }
        }

        if let Some(canonical_match) = find_canonical_match(preset_name, &preset_names) {
            if let Some(draft) = self.load_preset_draft(&canonical_match).await? {
                return Ok(Some(ResolvedPreset {
                    name: canonical_match,
                    draft,
                    normalized_from: Some(preset_name.to_string()),
                    normalized_reason: Some("canonical"),
                    restored_default: false,
                }));
            }
        }

        Ok(None)
    }

    async fn load_preset_draft(&self, name: &str) -> Result<Option<Value>, ApplicationError> {
        let preset = self
            .preset_repository
            .get_preset(name, &PresetType::OpenAI)
            .await?;
        Ok(preset.and_then(|preset| normalize_openai_preset_draft(&preset.data)))
    }

    async fn restore_default_preset_draft(
        &self,
        name: &str,
    ) -> Result<Option<Value>, ApplicationError> {
        let preset = self
            .preset_repository
            .get_default_preset(name, &PresetType::OpenAI)
            .await?;
        Ok(preset.and_then(|preset| normalize_openai_preset_draft(&preset.data)))
    }

    async fn resolve_bound_world_info(
        &self,
        bindings: &SessionBindings,
        payload: &Value,
    ) -> Result<BoundWorldInfoResolution, ApplicationError> {
        if bindings.world_info_names.is_empty() {
            return Ok(BoundWorldInfoResolution {
                context_block: String::new(),
                missing_books: Vec::new(),
            });
        }

        let mut loaded = Vec::new();
        let mut missing = Vec::new();

        for name in &bindings.world_info_names {
            let world = self
                .world_info_repository
                .get_world_info(name, false)
                .await?;
            match world {
                Some(world) => loaded.push((name.clone(), world)),
                None => missing.push(name.clone()),
            }
        }

        let messages = parse_timeline_messages(payload);
        let activated = activate_world_info_entries(&loaded, &messages);

        Ok(BoundWorldInfoResolution {
            context_block: build_world_info_context_block(&activated),
            missing_books: missing,
        })
    }
}

fn issue(code: &str, severity: &str, details: Option<Vec<String>>) -> GenerationBindingIssueDto {
    GenerationBindingIssueDto {
        code: code.to_string(),
        severity: severity.to_string(),
        details,
    }
}

fn resolve_session_bindings(payload: &Value) -> SessionBindings {
    let root = payload.as_array().and_then(|items| items.first());
    let metadata = root
        .and_then(Value::as_object)
        .and_then(|header| header.get("chat_metadata"))
        .and_then(Value::as_object);
    let tauritavern = metadata
        .and_then(|metadata| metadata.get("tauritavern"))
        .and_then(Value::as_object);
    let session = tauritavern
        .and_then(|root| root.get("session"))
        .and_then(Value::as_object);
    let bindings = session
        .and_then(|session| session.get("bindings"))
        .and_then(Value::as_object);

    let world_info_names = bindings
        .and_then(|bindings| bindings.get("world_info_names"))
        .and_then(Value::as_array)
        .map(|values| {
            let mut dedup = Vec::new();
            let mut seen = HashSet::new();
            for value in values {
                let normalized = value.as_str().unwrap_or_default().trim().to_string();
                if normalized.is_empty() || !seen.insert(normalized.clone()) {
                    continue;
                }
                dedup.push(normalized);
            }
            dedup
        })
        .unwrap_or_default();

    let preset_name = bindings
        .and_then(|bindings| bindings.get("preset_ref"))
        .and_then(Value::as_object)
        .and_then(|preset| preset.get("name"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    let api_profile_id = bindings
        .and_then(|bindings| bindings.get("api_profile_id"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    SessionBindings {
        world_info_names,
        preset_name,
        api_profile_id,
    }
}

fn serialize_bindings(bindings: &SessionBindings) -> Value {
    json!({
        "world_info_names": bindings.world_info_names,
        "preset_ref": bindings.preset_name.as_ref().map(|name| json!({
            "api_id": "openai",
            "name": name,
        })),
        "api_profile_id": bindings.api_profile_id,
    })
}

fn find_api_profile_settings(settings: &Value, profile_id: &str) -> Option<Value> {
    settings
        .as_object()
        .and_then(|settings| settings.get("api_profiles"))
        .and_then(Value::as_array)
        .and_then(|profiles| {
            profiles.iter().find_map(|profile| {
                let record = profile.as_object()?;
                let id = record.get("id").and_then(Value::as_str)?.trim();
                if id != profile_id {
                    return None;
                }
                Some(record.get("settings").cloned().unwrap_or_else(|| json!({})))
            })
        })
}

fn normalize_provider_draft(value: &Value) -> Value {
    let source = value.as_object().cloned().unwrap_or_default();
    let source_name = normalize_provider_source(
        source
            .get("chat_completion_source")
            .and_then(Value::as_str)
            .unwrap_or("openai"),
    );
    let mut draft = Map::new();
    draft.insert(
        "chat_completion_source".to_string(),
        Value::String(source_name.to_string()),
    );

    for key in provider_model_keys() {
        draft.insert((*key).to_string(), string_value(source.get(*key)));
    }

    draft.insert(
        "reverse_proxy".to_string(),
        string_value(source.get("reverse_proxy")),
    );
    draft.insert(
        "proxy_password".to_string(),
        string_value(source.get("proxy_password")),
    );
    draft.insert(
        "custom_url".to_string(),
        string_value(source.get("custom_url")),
    );
    draft.insert(
        "custom_include_headers".to_string(),
        string_value(source.get("custom_include_headers")),
    );
    draft.insert(
        "custom_include_body".to_string(),
        string_value(source.get("custom_include_body")),
    );
    draft.insert(
        "custom_exclude_body".to_string(),
        string_value(source.get("custom_exclude_body")),
    );
    draft.insert(
        "openai_max_context".to_string(),
        source.get("openai_max_context").cloned().unwrap_or(Value::Null),
    );
    draft.insert(
        "bypass_status_check".to_string(),
        Value::Bool(boolean_value(source.get("bypass_status_check"))),
    );
    let model_key = model_key_for_source(source_name);
    draft.insert("model".to_string(), string_value(draft.get(model_key)));

    Value::Object(draft)
}

fn read_provider_settings(value: &Value) -> Value {
    let object = value.as_object().cloned().unwrap_or_default();
    let nested = object
        .get("oai_settings")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let source = if nested.is_empty() { object } else { nested };
    normalize_provider_draft(&Value::Object(source))
}

fn provider_model_keys() -> &'static [&'static str] {
    &[
        "openai_model",
        "openrouter_model",
        "claude_model",
        "google_model",
        "deepseek_model",
        "moonshot_model",
        "siliconflow_model",
        "zai_model",
        "custom_model",
    ]
}

fn model_key_for_source(source: &str) -> &'static str {
    match source {
        "openrouter" => "openrouter_model",
        "custom" => "custom_model",
        "claude" => "claude_model",
        "makersuite" => "google_model",
        "deepseek" => "deepseek_model",
        "moonshot" => "moonshot_model",
        "siliconflow" => "siliconflow_model",
        "zai" => "zai_model",
        _ => "openai_model",
    }
}

fn normalize_provider_source(value: &str) -> &'static str {
    match value {
        "openai" => "openai",
        "openrouter" => "openrouter",
        "custom" => "custom",
        "claude" => "claude",
        "makersuite" => "makersuite",
        "deepseek" => "deepseek",
        "moonshot" => "moonshot",
        "siliconflow" => "siliconflow",
        "zai" => "zai",
        _ => "openai",
    }
}

fn string_value(value: Option<&Value>) -> Value {
    Value::String(
        value
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
    )
}

fn boolean_value(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(value)) => *value,
        Some(Value::Number(value)) => value.as_i64().unwrap_or(0) != 0,
        Some(Value::String(value)) => !matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "" | "0" | "false" | "no" | "off"
        ),
        Some(_) => true,
        None => false,
    }
}

fn strip_json_suffix(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.len() >= 5 && trimmed.to_ascii_lowercase().ends_with(".json") {
        trimmed[..trimmed.len() - 5].to_string()
    } else {
        trimmed.to_string()
    }
}

fn find_case_insensitive_match(name: &str, candidates: &[String]) -> Option<String> {
    let target = name.to_lowercase();
    let matches = candidates
        .iter()
        .filter(|candidate| candidate.to_lowercase() == target)
        .cloned()
        .collect::<Vec<_>>();
    if matches.len() == 1 {
        matches.into_iter().next()
    } else {
        None
    }
}

fn find_canonical_match(name: &str, candidates: &[String]) -> Option<String> {
    let target = canonical_preset_name(name).to_lowercase();
    if target.is_empty() {
        return None;
    }
    let matches = candidates
        .iter()
        .filter(|candidate| canonical_preset_name(candidate).to_lowercase() == target)
        .cloned()
        .collect::<Vec<_>>();
    if matches.len() == 1 {
        matches.into_iter().next()
    } else {
        None
    }
}

fn normalize_openai_preset_draft(value: &Value) -> Option<Value> {
    let source = value.as_object()?.clone();
    let merged = merge_legacy_prompt_fields(&source);
    let known_keys = openai_known_preset_keys();
    let mut draft = Map::new();

    for key in known_keys.keys() {
        if *key == "__extras" {
            continue;
        }
        if let Some(value) = merged.get(*key) {
            draft.insert((*key).to_string(), value.clone());
        }
    }

    if !merged.contains_key("prompts") {
        draft.insert("prompts".to_string(), Value::Null);
    }
    if !merged.contains_key("prompt_order") {
        draft.insert("prompt_order".to_string(), Value::Null);
    }

    let extras = merged
        .iter()
        .filter(|(key, _)| !known_keys.contains_key(key.as_str()) && key.as_str() != "name")
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<Map<_, _>>();
    draft.insert("__extras".to_string(), Value::Object(extras));

    Some(materialize_preset_regex_scripts(Value::Object(draft)))
}

fn openai_known_preset_keys() -> BTreeMap<&'static str, ()> {
    [
        "temperature",
        "frequency_penalty",
        "presence_penalty",
        "top_p",
        "openai_max_context",
        "max_context_unlocked",
        "openai_max_tokens",
        "seed",
        "n",
        "stream_openai",
        "send_if_empty",
        "impersonation_prompt",
        "new_chat_prompt",
        "new_group_chat_prompt",
        "new_example_chat_prompt",
        "continue_nudge_prompt",
        "wi_format",
        "scenario_format",
        "personality_format",
        "group_nudge_prompt",
        "names_behavior",
        "continue_prefill",
        "continue_postfix",
        "use_sysprompt",
        "squash_system_messages",
        "function_calling",
        "show_thoughts",
        "reasoning_effort",
        "verbosity",
        "enable_web_search",
        "media_inlining",
        "inline_image_quality",
        "request_images",
        "request_image_aspect_ratio",
        "request_image_resolution",
        "bias_preset_selected",
        "bias_presets",
        "extensions",
        "prompts",
        "prompt_order",
        "__extras",
    ]
    .into_iter()
    .map(|key| (key, ()))
    .collect()
}

fn merge_legacy_prompt_fields(source: &Map<String, Value>) -> Map<String, Value> {
    let has_legacy = ["main_prompt", "nsfw_prompt", "jailbreak_prompt"]
        .iter()
        .any(|key| {
            source
                .get(*key)
                .and_then(Value::as_str)
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false)
        });
    if !has_legacy {
        return source.clone();
    }

    let mut next = source.clone();
    let mut prompts = next
        .get("prompts")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_else(default_prompt_entries);

    apply_legacy_prompt_field(&mut prompts, source, "main_prompt", "main");
    apply_legacy_prompt_field(&mut prompts, source, "nsfw_prompt", "nsfw");
    apply_legacy_prompt_field(&mut prompts, source, "jailbreak_prompt", "jailbreak");

    next.remove("main_prompt");
    next.remove("nsfw_prompt");
    next.remove("jailbreak_prompt");
    next.insert("prompts".to_string(), Value::Array(prompts));
    next
}

fn apply_legacy_prompt_field(
    prompts: &mut [Value],
    source: &Map<String, Value>,
    source_key: &str,
    target_identifier: &str,
) {
    let Some(content) = source.get(source_key).and_then(Value::as_str) else {
        return;
    };

    for prompt in prompts.iter_mut() {
        let Some(record) = prompt.as_object_mut() else {
            continue;
        };
        if record
            .get("identifier")
            .and_then(Value::as_str)
            .unwrap_or_default()
            == target_identifier
        {
            record.insert("content".to_string(), Value::String(content.to_string()));
            return;
        }
    }
}

fn default_prompt_entries() -> Vec<Value> {
    vec![
        json!({
            "name": "Main Prompt",
            "system_prompt": true,
            "role": "system",
            "content": "Write {{char}}'s next reply in a fictional chat between {{char}} and {{user}}.",
            "identifier": "main",
        }),
        json!({
            "name": "Auxiliary Prompt",
            "system_prompt": true,
            "role": "system",
            "content": "",
            "identifier": "nsfw",
        }),
        json!({
            "identifier": "dialogueExamples",
            "name": "Chat Examples",
            "system_prompt": true,
            "marker": true,
        }),
        json!({
            "name": "Post-History Instructions",
            "system_prompt": true,
            "role": "system",
            "content": "",
            "identifier": "jailbreak",
        }),
        json!({
            "identifier": "chatHistory",
            "name": "Chat History",
            "system_prompt": true,
            "marker": true,
        }),
        json!({
            "identifier": "worldInfoAfter",
            "name": "World Info (after)",
            "system_prompt": true,
            "marker": true,
        }),
        json!({
            "identifier": "worldInfoBefore",
            "name": "World Info (before)",
            "system_prompt": true,
            "marker": true,
        }),
        json!({
            "identifier": "enhanceDefinitions",
            "role": "system",
            "name": "Enhance Definitions",
            "content": "If you have more knowledge of {{char}}, add to the character's lore and personality to enhance them but keep the Character Sheet's definitions absolute.",
            "system_prompt": true,
            "marker": false,
        }),
        json!({
            "identifier": "charDescription",
            "name": "Char Description",
            "system_prompt": true,
            "marker": true,
        }),
        json!({
            "identifier": "charPersonality",
            "name": "Char Personality",
            "system_prompt": true,
            "marker": true,
        }),
        json!({
            "identifier": "scenario",
            "name": "Scenario",
            "system_prompt": true,
            "marker": true,
        }),
        json!({
            "identifier": "personaDescription",
            "name": "Persona Description",
            "system_prompt": true,
            "marker": true,
        }),
    ]
}

fn materialize_preset_regex_scripts(value: Value) -> Value {
    let mut draft = value.as_object().cloned().unwrap_or_default();
    let resolved = resolve_preset_regex_scripts(&draft);
    if resolved.is_empty() {
        return Value::Object(draft);
    }

    draft.insert(
        "regex_scripts".to_string(),
        Value::Array(resolved.into_iter().map(Value::Object).collect()),
    );
    Value::Object(draft)
}

fn resolve_preset_regex_scripts(draft: &Map<String, Value>) -> Vec<Map<String, Value>> {
    let carriers = [
        ("top-level", read_array(draft.get("regex_scripts"))),
        (
            "extras",
            draft
                .get("__extras")
                .and_then(Value::as_object)
                .and_then(|extras| extras.get("regex_scripts"))
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default(),
        ),
        ("spresetsettings", read_spreset_regex_scripts(draft)),
    ];

    let mut seen = HashSet::new();
    let mut scripts = Vec::new();

    for (_kind, entries) in carriers {
        for entry in entries {
            let Some(normalized) = normalize_regex_script(&entry) else {
                continue;
            };
            let key = build_regex_dedupe_key(&normalized);
            if !seen.insert(key) {
                continue;
            }
            scripts.push(normalized);
        }
    }

    scripts
}

fn read_array(value: Option<&Value>) -> Vec<Value> {
    value.and_then(Value::as_array).cloned().unwrap_or_default()
}

fn read_spreset_regex_scripts(draft: &Map<String, Value>) -> Vec<Value> {
    let prompt_sources = draft
        .get("prompts")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_else(|| {
            draft
                .get("__extras")
                .and_then(Value::as_object)
                .and_then(|extras| extras.get("prompts"))
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        });

    for prompt in prompt_sources {
        let Some(record) = prompt.as_object() else {
            continue;
        };
        if record
            .get("identifier")
            .and_then(Value::as_str)
            .unwrap_or_default()
            != "SPresetSettings"
        {
            continue;
        }
        let Some(content) = record.get("content").and_then(Value::as_str) else {
            continue;
        };
        let Ok(parsed) = serde_json::from_str::<Value>(content) else {
            continue;
        };
        let Some(regexes) = parsed
            .as_object()
            .and_then(|parsed| parsed.get("RegexBinding"))
            .and_then(Value::as_object)
            .and_then(|binding| binding.get("regexes"))
            .and_then(Value::as_array)
        else {
            continue;
        };
        return regexes.clone();
    }

    Vec::new()
}

fn normalize_regex_script(value: &Value) -> Option<Map<String, Value>> {
    let record = value.as_object()?;
    let find_regex = record.get("findRegex").and_then(Value::as_str)?.trim();
    if find_regex.is_empty() {
        return None;
    }

    let mut script = Map::new();
    script.insert(
        "id".to_string(),
        Value::String(string_from(record.get("id"))),
    );
    script.insert(
        "scriptName".to_string(),
        Value::String(string_from(record.get("scriptName"))),
    );
    script.insert(
        "findRegex".to_string(),
        Value::String(find_regex.to_string()),
    );
    script.insert(
        "replaceString".to_string(),
        Value::String(string_from(record.get("replaceString"))),
    );
    script.insert(
        "trimStrings".to_string(),
        Value::Array(string_array(record.get("trimStrings"))),
    );
    script.insert(
        "placement".to_string(),
        Value::Array(number_array(record.get("placement"))),
    );
    script.insert(
        "disabled".to_string(),
        Value::Bool(boolean_value(record.get("disabled"))),
    );
    script.insert(
        "markdownOnly".to_string(),
        Value::Bool(boolean_value(record.get("markdownOnly"))),
    );
    script.insert(
        "promptOnly".to_string(),
        Value::Bool(boolean_value(record.get("promptOnly"))),
    );
    script.insert(
        "runOnEdit".to_string(),
        Value::Bool(boolean_value(record.get("runOnEdit"))),
    );
    script.insert(
        "substituteRegex".to_string(),
        record
            .get("substituteRegex")
            .cloned()
            .unwrap_or_else(|| Value::Number(0.into())),
    );
    script.insert(
        "minDepth".to_string(),
        nullable_number(record.get("minDepth")),
    );
    script.insert(
        "maxDepth".to_string(),
        nullable_number(record.get("maxDepth")),
    );

    Some(script)
}

fn string_from(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn string_array(value: Option<&Value>) -> Vec<Value> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(|value| Value::String(value.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn number_array(value: Option<&Value>) -> Vec<Value> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|value| value.as_f64().and_then(serde_json::Number::from_f64))
                .map(Value::Number)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn nullable_number(value: Option<&Value>) -> Value {
    value
        .and_then(Value::as_f64)
        .and_then(serde_json::Number::from_f64)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

fn build_regex_dedupe_key(script: &Map<String, Value>) -> String {
    serde_json::to_string(&json!([
        script.get("id"),
        script.get("findRegex"),
        script.get("replaceString"),
        script.get("placement"),
        script.get("markdownOnly"),
        script.get("promptOnly"),
        script.get("runOnEdit"),
    ]))
    .unwrap_or_default()
}

fn parse_timeline_messages(payload: &Value) -> Vec<TimelineMessage> {
    payload
        .as_array()
        .map(|items| {
            items
                .iter()
                .skip(1)
                .filter_map(|item| {
                    let record = item.as_object()?;
                    Some(TimelineMessage {
                        name: record
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .trim()
                            .to_string(),
                        mes: record
                            .get("mes")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .trim()
                            .to_string(),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn activate_world_info_entries(
    books: &[(String, Value)],
    messages: &[TimelineMessage],
) -> Vec<NormalizedWorldInfoEntry> {
    let mut normalized = books
        .iter()
        .flat_map(|(name, record)| normalize_world_info_record(name, record))
        .collect::<Vec<_>>();
    normalized.sort_by(|left, right| right.order.cmp(&left.order));

    let mut activated = BTreeMap::<String, NormalizedWorldInfoEntry>::new();
    let mut recursive_content = Vec::<String>::new();

    for step in 0..=2 {
        let text = build_scan_text(messages, &recursive_content);
        let mut activated_now = false;

        for entry in &normalized {
            let key = format!("{}:{}", entry.world, entry.uid);
            if activated.contains_key(&key) {
                continue;
            }

            if !entry_matches(entry, &text, step) {
                continue;
            }

            activated.insert(key, entry.clone());
            activated_now = true;

            if !entry.prevent_recursion && !entry.exclude_recursion {
                recursive_content.push(entry.content.clone());
            }
        }

        if !activated_now {
            break;
        }
    }

    let mut used_characters = 0usize;
    let mut limited = Vec::new();
    let mut ordered = activated.into_values().collect::<Vec<_>>();
    ordered.sort_by(|left, right| right.order.cmp(&left.order));

    for entry in ordered {
        if used_characters > 0 && used_characters + entry.content.len() > 6000 {
            continue;
        }
        used_characters += entry.content.len();
        limited.push(entry);
    }

    limited
}

fn normalize_world_info_record(world: &str, record: &Value) -> Vec<NormalizedWorldInfoEntry> {
    record
        .as_object()
        .and_then(|record| record.get("entries"))
        .and_then(Value::as_object)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|(uid, entry)| normalize_world_info_entry(world, uid, entry))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn normalize_world_info_entry(
    world: &str,
    uid: &str,
    raw: &Value,
) -> Option<NormalizedWorldInfoEntry> {
    let record = raw.as_object()?;
    let content = record
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    if content.is_empty() {
        return None;
    }

    Some(NormalizedWorldInfoEntry {
        world: world.to_string(),
        uid: uid.to_string(),
        key: value_string_list(record.get("key")),
        keysecondary: value_string_list(record.get("keysecondary")),
        content,
        selective: boolean_value(record.get("selective")),
        selective_logic: record
            .get("selectiveLogic")
            .and_then(Value::as_i64)
            .unwrap_or(0),
        order: record.get("order").and_then(Value::as_i64).unwrap_or(0),
        disable: boolean_value(record.get("disable")),
        probability: record
            .get("probability")
            .and_then(Value::as_f64)
            .unwrap_or(100.0),
        use_probability: boolean_value(record.get("useProbability")),
        exclude_recursion: boolean_value(record.get("excludeRecursion")),
        prevent_recursion: boolean_value(record.get("preventRecursion")),
        delay_until_recursion: boolean_value(record.get("delayUntilRecursion")),
        case_sensitive: nullable_bool(record.get("caseSensitive")),
        match_whole_words: nullable_bool(record.get("matchWholeWords")),
    })
}

fn value_string_list(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn nullable_bool(value: Option<&Value>) -> Option<bool> {
    value.map(|value| boolean_value(Some(value)))
}

fn build_scan_text(messages: &[TimelineMessage], recursive_content: &[String]) -> String {
    let timeline_text = messages
        .iter()
        .map(|message| format!("{}: {}", message.name.trim(), message.mes.trim()))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    std::iter::once(timeline_text)
        .chain(recursive_content.iter().cloned())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn entry_matches(entry: &NormalizedWorldInfoEntry, text: &str, recursion_step: usize) -> bool {
    if entry.disable {
        return false;
    }
    if entry.delay_until_recursion && recursion_step == 0 {
        return false;
    }
    if entry.use_probability && entry.probability <= 0.0 {
        return false;
    }
    if !entry.key.iter().any(|key| matches_key(text, key, entry)) {
        return false;
    }
    if !entry.selective || entry.keysecondary.is_empty() {
        return true;
    }
    matches_secondary(entry, text)
}

fn matches_secondary(entry: &NormalizedWorldInfoEntry, text: &str) -> bool {
    let mut has_any_match = false;
    let mut has_all_match = true;

    for secondary in &entry.keysecondary {
        let has_match = matches_key(text, secondary, entry);
        if has_match {
            has_any_match = true;
        } else {
            has_all_match = false;
        }

        if entry.selective_logic == 0 && has_match {
            return true;
        }
        if entry.selective_logic == 1 && !has_match {
            return true;
        }
    }

    if entry.selective_logic == 2 && !has_any_match {
        return true;
    }
    if entry.selective_logic == 3 && has_all_match {
        return true;
    }

    false
}

fn matches_key(text: &str, raw_key: &str, entry: &NormalizedWorldInfoEntry) -> bool {
    let key = raw_key.trim();
    if key.is_empty() {
        return false;
    }

    if !entry.match_whole_words.unwrap_or(false) {
        if entry.case_sensitive.unwrap_or(false) {
            return text.contains(key);
        }
        return text.to_lowercase().contains(&key.to_lowercase());
    }

    if entry.case_sensitive.unwrap_or(false) {
        return contains_whole_word(text, key);
    }
    contains_whole_word(&text.to_lowercase(), &key.to_lowercase())
}

fn contains_whole_word(haystack: &str, needle: &str) -> bool {
    if needle.is_empty() {
        return false;
    }

    let mut offset = 0usize;
    while let Some(found) = haystack[offset..].find(needle) {
        let start = offset + found;
        let end = start + needle.len();
        let before = haystack[..start].chars().next_back();
        let after = haystack[end..].chars().next();
        let before_ok = before.map(is_non_word_boundary).unwrap_or(true);
        let after_ok = after.map(is_non_word_boundary).unwrap_or(true);
        if before_ok && after_ok {
            return true;
        }
        offset = end;
    }
    false
}

fn is_non_word_boundary(ch: char) -> bool {
    !ch.is_alphanumeric() && ch != '_'
}

fn build_world_info_context_block(entries: &[NormalizedWorldInfoEntry]) -> String {
    if entries.is_empty() {
        return String::new();
    }

    std::iter::once("[World Info Context]".to_string())
        .chain(entries.iter().map(|entry| entry.content.clone()))
        .collect::<Vec<_>>()
        .join("\n\n")
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::errors::DomainError;
    use crate::domain::models::preset::{DefaultPreset, Preset};
    use crate::domain::models::settings::{TauriTavernSettings, UserSettings};
    use async_trait::async_trait;
    use std::collections::HashMap;
    use std::path::Path;

    struct MockSettingsRepository {
        user_settings: Value,
    }

    #[async_trait]
    impl SettingsRepository for MockSettingsRepository {
        async fn save_tauritavern_settings(
            &self,
            _settings: &TauriTavernSettings,
        ) -> Result<(), DomainError> {
            Ok(())
        }

        async fn load_tauritavern_settings(&self) -> Result<TauriTavernSettings, DomainError> {
            Ok(TauriTavernSettings::default())
        }

        async fn save_user_settings(&self, _settings: &UserSettings) -> Result<(), DomainError> {
            Ok(())
        }

        async fn load_user_settings(&self) -> Result<UserSettings, DomainError> {
            Ok(UserSettings {
                data: self.user_settings.clone(),
            })
        }

        async fn create_snapshot(&self) -> Result<(), DomainError> {
            Ok(())
        }

        async fn get_snapshots(
            &self,
        ) -> Result<Vec<crate::domain::models::settings::SettingsSnapshot>, DomainError> {
            Ok(Vec::new())
        }

        async fn load_snapshot(&self, _name: &str) -> Result<UserSettings, DomainError> {
            Ok(UserSettings::default())
        }

        async fn restore_snapshot(&self, _name: &str) -> Result<(), DomainError> {
            Ok(())
        }

        async fn get_themes(&self) -> Result<Vec<UserSettings>, DomainError> {
            Ok(Vec::new())
        }

        async fn get_moving_ui_presets(&self) -> Result<Vec<UserSettings>, DomainError> {
            Ok(Vec::new())
        }

        async fn get_quick_reply_presets(&self) -> Result<Vec<UserSettings>, DomainError> {
            Ok(Vec::new())
        }

        async fn get_instruct_presets(&self) -> Result<Vec<UserSettings>, DomainError> {
            Ok(Vec::new())
        }

        async fn get_context_presets(&self) -> Result<Vec<UserSettings>, DomainError> {
            Ok(Vec::new())
        }

        async fn get_sysprompt_presets(&self) -> Result<Vec<UserSettings>, DomainError> {
            Ok(Vec::new())
        }

        async fn get_reasoning_presets(&self) -> Result<Vec<UserSettings>, DomainError> {
            Ok(Vec::new())
        }

        async fn get_koboldai_settings(&self) -> Result<(Vec<String>, Vec<String>), DomainError> {
            Ok((Vec::new(), Vec::new()))
        }

        async fn get_novelai_settings(&self) -> Result<(Vec<String>, Vec<String>), DomainError> {
            Ok((Vec::new(), Vec::new()))
        }

        async fn get_openai_settings(&self) -> Result<(Vec<String>, Vec<String>), DomainError> {
            Ok((Vec::new(), Vec::new()))
        }

        async fn get_textgen_settings(&self) -> Result<(Vec<String>, Vec<String>), DomainError> {
            Ok((Vec::new(), Vec::new()))
        }

        async fn get_world_names(&self) -> Result<Vec<String>, DomainError> {
            Ok(Vec::new())
        }
    }

    struct MockPresetRepository {
        presets: HashMap<String, Preset>,
        defaults: HashMap<String, DefaultPreset>,
    }

    #[async_trait]
    impl PresetRepository for MockPresetRepository {
        async fn save_preset(&self, _preset: &Preset) -> Result<(), DomainError> {
            Ok(())
        }

        async fn delete_preset(
            &self,
            _name: &str,
            _preset_type: &PresetType,
        ) -> Result<(), DomainError> {
            Ok(())
        }

        async fn preset_exists(
            &self,
            name: &str,
            _preset_type: &PresetType,
        ) -> Result<bool, DomainError> {
            Ok(self.presets.contains_key(name))
        }

        async fn get_preset(
            &self,
            name: &str,
            _preset_type: &PresetType,
        ) -> Result<Option<Preset>, DomainError> {
            Ok(self.presets.get(name).cloned())
        }

        async fn list_presets(
            &self,
            _preset_type: &PresetType,
        ) -> Result<Vec<String>, DomainError> {
            Ok(self.presets.keys().cloned().collect())
        }

        async fn get_default_preset(
            &self,
            name: &str,
            _preset_type: &PresetType,
        ) -> Result<Option<DefaultPreset>, DomainError> {
            Ok(self.defaults.get(name).cloned())
        }
    }

    struct MockWorldInfoRepository {
        worlds: HashMap<String, Value>,
    }

    #[async_trait]
    impl WorldInfoRepository for MockWorldInfoRepository {
        async fn get_world_info(
            &self,
            name: &str,
            _allow_dummy: bool,
        ) -> Result<Option<Value>, DomainError> {
            Ok(self.worlds.get(name).cloned())
        }

        async fn save_world_info(&self, _name: &str, _data: &Value) -> Result<(), DomainError> {
            Ok(())
        }

        async fn delete_world_info(&self, _name: &str) -> Result<(), DomainError> {
            Ok(())
        }

        async fn import_world_info(
            &self,
            _file_path: &Path,
            _original_filename: &str,
            _converted_data: Option<&str>,
        ) -> Result<String, DomainError> {
            Ok(String::new())
        }

        async fn list_world_names(&self) -> Result<Vec<String>, DomainError> {
            Ok(self.worlds.keys().cloned().collect())
        }
    }

    #[tokio::test]
    async fn resolves_bound_preset_with_json_suffix_normalization() {
        let service = GenerationBindingService::new(
            Arc::new(MockSettingsRepository {
                user_settings: json!({}),
            }),
            Arc::new(MockPresetRepository {
                presets: HashMap::from([(
                    "Preset One".to_string(),
                    Preset::new(
                        "Preset One".to_string(),
                        PresetType::OpenAI,
                        json!({ "temperature": 0.8 }),
                    ),
                )]),
                defaults: HashMap::new(),
            }),
            Arc::new(MockWorldInfoRepository {
                worlds: HashMap::new(),
            }),
        );

        let resolved = service
            .resolve_bound_preset("Preset One.json")
            .await
            .unwrap();
        let resolved = resolved.expect("resolved preset");
        assert_eq!(resolved.name, "Preset One");
        assert_eq!(resolved.normalized_reason, Some("strip_extension"));
        assert_eq!(
            resolved
                .draft
                .as_object()
                .and_then(|draft| draft.get("temperature"))
                .and_then(Value::as_f64),
            Some(0.8)
        );
    }

    #[tokio::test]
    async fn resolves_generation_bindings_and_world_info_on_backend() {
        let service = GenerationBindingService::new(
            Arc::new(MockSettingsRepository {
                user_settings: json!({
                    "api_profiles": [{
                        "id": "primary",
                        "settings": {
                            "chat_completion_source": "openrouter",
                            "openrouter_model": "meta-llama"
                        }
                    }]
                }),
            }),
            Arc::new(MockPresetRepository {
                presets: HashMap::from([(
                    "Preset One".to_string(),
                    Preset::new(
                        "Preset One".to_string(),
                        PresetType::OpenAI,
                        json!({ "temperature": 0.8 }),
                    ),
                )]),
                defaults: HashMap::new(),
            }),
            Arc::new(MockWorldInfoRepository {
                worlds: HashMap::from([(
                    "Lore".to_string(),
                    json!({
                        "entries": {
                            "1": {
                                "key": ["dragon"],
                                "content": "Dragons are ancient.",
                                "order": 100
                            }
                        }
                    }),
                )]),
            }),
        );

        let payload = json!([
            {
                "chat_metadata": {
                    "tauritavern": {
                        "session": {
                            "bindings": {
                                "world_info_names": ["Lore"],
                                "preset_ref": { "api_id": "openai", "name": "Preset One" },
                                "api_profile_id": "primary"
                            }
                        }
                    }
                }
            },
            {
                "name": "User",
                "is_user": true,
                "mes": "Tell me about a dragon"
            }
        ]);

        let resolved = service
            .resolve_generation_bindings(
                payload,
                json!({
                    "chat_completion_source": "openai",
                    "openai_model": "gpt-4o-mini",
                    "model": "gpt-4o-mini"
                }),
            )
            .await
            .unwrap();

        assert!(resolved.issues.is_empty());
        assert_eq!(
            resolved
                .draft
                .as_object()
                .and_then(|draft| draft.get("chat_completion_source"))
                .and_then(Value::as_str),
            Some("openrouter")
        );
        assert_eq!(
            resolved
                .draft
                .as_object()
                .and_then(|draft| draft.get("model"))
                .and_then(Value::as_str),
            Some("meta-llama")
        );
        assert_eq!(resolved.preset_name.as_deref(), Some("Preset One"));
        assert!(resolved.world_info_block.contains("Dragons are ancient."));
    }
}
