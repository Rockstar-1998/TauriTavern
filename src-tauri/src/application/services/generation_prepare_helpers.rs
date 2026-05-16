//! Helper functions for generation preparation.
//! This file ports the non-UI generation prepare logic from the frontend.
//! Message compose / regex prompt projection is migrated separately.

use std::collections::{HashMap, HashSet};

use regex::Regex;
use serde_json::{Map, Number, Value, json};

use crate::application::dto::generation_prepare_dto::{
    GenerationMode, PrepareGenerationIssueDto, PrepareGenerationNoticeDto, PromptRepairStatsDto,
    PromptSanitizeStatusDto,
};

const PROMPT_MANAGER_DUMMY_ID: i64 = 100001;
const PROMPT_MANAGER_FALLBACK_ID: i64 = 100000;

#[derive(Debug, Clone)]
struct PromptEntry {
    identifier: String,
    name: Option<String>,
    role: Option<String>,
    content: Option<String>,
    enabled: Option<bool>,
    system_prompt: Option<bool>,
    marker: Option<bool>,
    injection_position: Option<i64>,
    injection_depth: Option<i64>,
    injection_order: Option<i64>,
    injection_trigger: Vec<String>,
}

#[derive(Debug, Clone)]
struct PromptOrderEntry {
    identifier: String,
    enabled: bool,
}

#[derive(Debug, Clone)]
struct PromptOrderList {
    character_id: Value,
    order: Vec<PromptOrderEntry>,
}

pub fn obj(v: &Value) -> Map<String, Value> {
    match v {
        Value::Object(m) => m.clone(),
        _ => Map::new(),
    }
}

pub fn vstr(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        other => other.to_string().trim_matches('"').to_string(),
    }
}

pub fn vbool(v: &Value) -> bool {
    match v {
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().unwrap_or(0.0) != 0.0,
        Value::String(s) => {
            matches!(
                s.trim().to_lowercase().as_str(),
                "true" | "1" | "yes" | "on"
            )
        }
        _ => false,
    }
}

fn vnum(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse::<f64>().ok(),
        _ => None,
    }
}

fn vi64(v: &Value) -> Option<i64> {
    match v {
        Value::Number(n) => n.as_i64(),
        Value::String(s) => s.trim().parse::<i64>().ok(),
        _ => None,
    }
}

fn as_string_array(v: &Value) -> Vec<String> {
    match v {
        Value::Array(items) => items
            .iter()
            .map(vstr)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}

fn number_to_value(value: f64) -> Option<Value> {
    Number::from_f64(value).map(Value::Number)
}

fn normalize_undefined_string(v: Option<&Value>) -> String {
    let raw = v.map(vstr).unwrap_or_default().trim().to_string();
    if raw.is_empty() {
        return "[Undefined]".to_string();
    }
    let quoted = (raw.starts_with('"') && raw.ends_with('"'))
        || (raw.starts_with('\'') && raw.ends_with('\''));
    if quoted {
        let inner = raw[1..raw.len() - 1].trim().to_string();
        return if inner.is_empty() {
            "[Undefined]".to_string()
        } else {
            inner
        };
    }
    raw
}

fn read_number(map: &Map<String, Value>, keys: &[&str]) -> Option<f64> {
    keys.iter().find_map(|key| map.get(*key).and_then(vnum))
}

fn get_string(map: &Map<String, Value>, key: &str) -> String {
    map.get(key).map(vstr).unwrap_or_default()
}

fn clone_object(value: Option<&Value>) -> Map<String, Value> {
    value
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

pub struct PromptSanitizeResult {
    pub prompts_value: Value,
    pub prompt_order: Value,
    pub inherited: bool,
    pub migrated: bool,
    pub migrated_map: bool,
    pub repaired: bool,
    pub stats: PromptRepairStatsDto,
}

impl PromptSanitizeResult {
    pub fn to_dto(&self) -> PromptSanitizeStatusDto {
        PromptSanitizeStatusDto {
            inherited: self.inherited,
            migrated: self.migrated,
            migrated_map: self.migrated_map,
            repaired: self.repaired,
            stats: self.stats.clone(),
        }
    }
}

pub fn issue(code: &str, severity: &str) -> PrepareGenerationIssueDto {
    PrepareGenerationIssueDto {
        code: code.to_string(),
        severity: severity.to_string(),
        details: None,
    }
}

pub fn mk_notice(
    code: &str,
    tone: &str,
    description: Option<String>,
) -> PrepareGenerationNoticeDto {
    PrepareGenerationNoticeDto {
        code: code.to_string(),
        tone: tone.to_string(),
        title: None,
        description,
    }
}

pub fn apply_preset_draft(settings: &Value, preset: &Value) -> Value {
    let mut next = obj(settings);
    let mut oai = clone_object(next.get("oai_settings"));
    let source = obj(preset);

    for (key, value) in source {
        if key == "__extras" || key == "name" {
            continue;
        }
        let target_key = match key.as_str() {
            "temperature" => "temp_openai",
            "frequency_penalty" => "freq_pen_openai",
            "presence_penalty" => "pres_pen_openai",
            _ => key.as_str(),
        };
        oai.insert(target_key.to_string(), value);
    }

    next.insert("oai_settings".to_string(), Value::Object(oai));
    Value::Object(next)
}

fn default_prompt_entries() -> Vec<PromptEntry> {
    vec![
        PromptEntry {
            identifier: "main".to_string(),
            name: Some("Main Prompt".to_string()),
            role: Some("system".to_string()),
            content: Some("Write {{char}}'s next reply in a fictional chat between {{char}} and {{user}}.".to_string()),
            enabled: None,
            system_prompt: Some(true),
            marker: None,
            injection_position: None,
            injection_depth: None,
            injection_order: None,
            injection_trigger: vec![],
        },
        PromptEntry {
            identifier: "nsfw".to_string(),
            name: Some("Auxiliary Prompt".to_string()),
            role: Some("system".to_string()),
            content: Some(String::new()),
            enabled: None,
            system_prompt: Some(true),
            marker: None,
            injection_position: None,
            injection_depth: None,
            injection_order: None,
            injection_trigger: vec![],
        },
        PromptEntry {
            identifier: "dialogueExamples".to_string(),
            name: Some("Chat Examples".to_string()),
            role: None,
            content: None,
            enabled: None,
            system_prompt: Some(true),
            marker: Some(true),
            injection_position: None,
            injection_depth: None,
            injection_order: None,
            injection_trigger: vec![],
        },
        PromptEntry {
            identifier: "jailbreak".to_string(),
            name: Some("Post-History Instructions".to_string()),
            role: Some("system".to_string()),
            content: Some(String::new()),
            enabled: None,
            system_prompt: Some(true),
            marker: None,
            injection_position: None,
            injection_depth: None,
            injection_order: None,
            injection_trigger: vec![],
        },
        PromptEntry {
            identifier: "chatHistory".to_string(),
            name: Some("Chat History".to_string()),
            role: None,
            content: None,
            enabled: None,
            system_prompt: Some(true),
            marker: Some(true),
            injection_position: None,
            injection_depth: None,
            injection_order: None,
            injection_trigger: vec![],
        },
        PromptEntry {
            identifier: "worldInfoAfter".to_string(),
            name: Some("World Info (after)".to_string()),
            role: None,
            content: None,
            enabled: None,
            system_prompt: Some(true),
            marker: Some(true),
            injection_position: None,
            injection_depth: None,
            injection_order: None,
            injection_trigger: vec![],
        },
        PromptEntry {
            identifier: "worldInfoBefore".to_string(),
            name: Some("World Info (before)".to_string()),
            role: None,
            content: None,
            enabled: None,
            system_prompt: Some(true),
            marker: Some(true),
            injection_position: None,
            injection_depth: None,
            injection_order: None,
            injection_trigger: vec![],
        },
        PromptEntry {
            identifier: "enhanceDefinitions".to_string(),
            name: Some("Enhance Definitions".to_string()),
            role: Some("system".to_string()),
            content: Some("If you have more knowledge of {{char}}, add to the character's lore and personality to enhance them but keep the Character Sheet's definitions absolute.".to_string()),
            enabled: None,
            system_prompt: Some(true),
            marker: Some(false),
            injection_position: None,
            injection_depth: None,
            injection_order: None,
            injection_trigger: vec![],
        },
        PromptEntry {
            identifier: "charDescription".to_string(),
            name: Some("Char Description".to_string()),
            role: None,
            content: None,
            enabled: None,
            system_prompt: Some(true),
            marker: Some(true),
            injection_position: None,
            injection_depth: None,
            injection_order: None,
            injection_trigger: vec![],
        },
        PromptEntry {
            identifier: "charPersonality".to_string(),
            name: Some("Char Personality".to_string()),
            role: None,
            content: None,
            enabled: None,
            system_prompt: Some(true),
            marker: Some(true),
            injection_position: None,
            injection_depth: None,
            injection_order: None,
            injection_trigger: vec![],
        },
        PromptEntry {
            identifier: "scenario".to_string(),
            name: Some("Scenario".to_string()),
            role: None,
            content: None,
            enabled: None,
            system_prompt: Some(true),
            marker: Some(true),
            injection_position: None,
            injection_depth: None,
            injection_order: None,
            injection_trigger: vec![],
        },
        PromptEntry {
            identifier: "personaDescription".to_string(),
            name: Some("Persona Description".to_string()),
            role: None,
            content: None,
            enabled: None,
            system_prompt: Some(true),
            marker: Some(true),
            injection_position: None,
            injection_depth: None,
            injection_order: None,
            injection_trigger: vec![],
        },
    ]
}

fn prompt_entry_to_value(entry: &PromptEntry) -> Value {
    let mut out = Map::new();
    out.insert("identifier".to_string(), json!(entry.identifier));
    if let Some(v) = &entry.name {
        out.insert("name".to_string(), json!(v));
    }
    if let Some(v) = &entry.role {
        out.insert("role".to_string(), json!(v));
    }
    if let Some(v) = &entry.content {
        out.insert("content".to_string(), json!(v));
    }
    if let Some(v) = entry.enabled {
        out.insert("enabled".to_string(), json!(v));
    }
    if let Some(v) = entry.system_prompt {
        out.insert("system_prompt".to_string(), json!(v));
    }
    if let Some(v) = entry.marker {
        out.insert("marker".to_string(), json!(v));
    }
    if let Some(v) = entry.injection_position {
        out.insert("injection_position".to_string(), json!(v));
    }
    if let Some(v) = entry.injection_depth {
        out.insert("injection_depth".to_string(), json!(v));
    }
    if let Some(v) = entry.injection_order {
        out.insert("injection_order".to_string(), json!(v));
    }
    out.insert(
        "injection_trigger".to_string(),
        Value::Array(entry.injection_trigger.iter().map(|s| json!(s)).collect()),
    );
    Value::Object(out)
}

fn prompt_order_entry_to_value(entry: &PromptOrderEntry) -> Value {
    json!({
        "identifier": entry.identifier,
        "enabled": entry.enabled,
    })
}

fn prompt_order_list_to_value(list: &PromptOrderList) -> Value {
    json!({
        "character_id": list.character_id,
        "order": list.order.iter().map(prompt_order_entry_to_value).collect::<Vec<_>>(),
    })
}

fn prompt_entry_from_object(
    record: &Map<String, Value>,
    fallback_identifier: String,
) -> PromptEntry {
    let raw_identifier = record
        .get("identifier")
        .map(vstr)
        .unwrap_or_default()
        .trim()
        .to_string();
    PromptEntry {
        identifier: if raw_identifier.is_empty() {
            fallback_identifier
        } else {
            raw_identifier
        },
        name: record.get("name").map(vstr),
        role: record.get("role").map(vstr),
        content: record.get("content").map(vstr),
        enabled: record.get("enabled").map(vbool),
        system_prompt: record.get("system_prompt").map(vbool),
        marker: record.get("marker").map(vbool),
        injection_position: record.get("injection_position").and_then(vi64),
        injection_depth: record.get("injection_depth").and_then(vi64),
        injection_order: record.get("injection_order").and_then(vi64),
        injection_trigger: record
            .get("injection_trigger")
            .map(as_string_array)
            .unwrap_or_default(),
    }
}

fn normalize_prompt_map_entries(map: &Map<String, Value>) -> (Vec<PromptEntry>, bool) {
    let mut entries = Vec::new();
    let mut migrated = false;
    for (key, value) in map {
        if let Some(record) = value.as_object() {
            let raw_identifier = record
                .get("identifier")
                .map(vstr)
                .unwrap_or_default()
                .trim()
                .to_string();
            let entry = prompt_entry_from_object(record, key.clone());
            if !record.get("injection_trigger").is_some_and(Value::is_array) {
                migrated = true;
            }
            if raw_identifier.is_empty() || raw_identifier != entry.identifier {
                migrated = true;
            }
            entries.push(entry);
            continue;
        }

        entries.push(PromptEntry {
            identifier: key.clone(),
            name: Some(key.clone()),
            role: Some("system".to_string()),
            content: Some(match value {
                Value::String(s) => s.clone(),
                Value::Null => String::new(),
                other => other.to_string(),
            }),
            enabled: None,
            system_prompt: Some(false),
            marker: Some(false),
            injection_position: None,
            injection_depth: None,
            injection_order: None,
            injection_trigger: vec![],
        });
        migrated = true;
    }
    (entries, migrated)
}

fn coerce_prompt_order_enabled(value: &Value) -> (bool, bool) {
    match value {
        Value::Bool(v) => (*v, false),
        Value::Number(n) => (n.as_f64().unwrap_or(0.0) != 0.0, true),
        Value::String(s) => {
            let normalized = s.trim().to_lowercase();
            if ["true", "1", "yes", "on"].contains(&normalized.as_str()) {
                (true, true)
            } else if ["false", "0", "no", "off"].contains(&normalized.as_str()) {
                (false, true)
            } else {
                (true, true)
            }
        }
        _ => (true, true),
    }
}

fn coerce_prompt_order_entry(value: &Value) -> (Option<PromptOrderEntry>, bool) {
    match value {
        Value::String(s) => (
            Some(PromptOrderEntry {
                identifier: s.clone(),
                enabled: true,
            }),
            true,
        ),
        Value::Object(record) => {
            let identifier = record
                .get("identifier")
                .map(vstr)
                .unwrap_or_default()
                .trim()
                .to_string();
            if identifier.is_empty() {
                return (None, true);
            }
            if let Some(enabled_value) = record.get("enabled") {
                let (enabled, migrated) = coerce_prompt_order_enabled(enabled_value);
                (
                    Some(PromptOrderEntry {
                        identifier,
                        enabled,
                    }),
                    migrated || !enabled_value.is_boolean(),
                )
            } else {
                (
                    Some(PromptOrderEntry {
                        identifier,
                        enabled: true,
                    }),
                    true,
                )
            }
        }
        _ => (None, true),
    }
}

fn normalize_prompt_order_entries(value: &Value) -> (Vec<PromptOrderEntry>, bool) {
    let mut entries = Vec::new();
    let mut migrated = false;

    match value {
        Value::Array(items) => {
            for item in items {
                let (entry, item_migrated) = coerce_prompt_order_entry(item);
                let is_none = entry.is_none();
                if let Some(entry) = entry {
                    entries.push(entry);
                }
                if item_migrated || is_none {
                    migrated = true;
                }
            }
        }
        Value::Object(map) => {
            for (identifier, enabled_value) in map {
                let (enabled, _item_migrated) = coerce_prompt_order_enabled(enabled_value);
                entries.push(PromptOrderEntry {
                    identifier: identifier.clone(),
                    enabled,
                });
            }
            migrated = true;
        }
        _ => {}
    }

    (entries, migrated)
}

fn is_prompt_order_list(value: &Value) -> bool {
    value
        .as_object()
        .map(|record| {
            record.contains_key("character_id") && record.get("order").is_some_and(Value::is_array)
        })
        .unwrap_or(false)
}

fn normalize_prompt_order_lists(value: &Value, dummy_id: i64) -> (Vec<PromptOrderList>, bool) {
    let mut migrated = false;
    let mut lists = Vec::new();
    let mut extra_entries = Vec::new();

    match value {
        Value::Array(items) => {
            let has_list_shape = items.iter().any(|item| {
                item.as_object()
                    .map(|record| {
                        record.contains_key("character_id") || record.contains_key("order")
                    })
                    .unwrap_or(false)
            });

            if !has_list_shape {
                let (entries, norm_migrated) = normalize_prompt_order_entries(value);
                return (
                    vec![PromptOrderList {
                        character_id: json!(dummy_id),
                        order: entries,
                    }],
                    true || norm_migrated,
                );
            }

            for item in items {
                if let Some(record) = item.as_object() {
                    if record.contains_key("character_id") {
                        let character_id = record
                            .get("character_id")
                            .cloned()
                            .unwrap_or_else(|| json!(dummy_id));
                        let (order, order_migrated) = normalize_prompt_order_entries(
                            record.get("order").unwrap_or(&Value::Null),
                        );
                        lists.push(PromptOrderList {
                            character_id,
                            order,
                        });
                        if order_migrated || !is_prompt_order_list(item) {
                            migrated = true;
                        }
                        continue;
                    }
                }
                let (entry, entry_migrated) = coerce_prompt_order_entry(item);
                let is_none = entry.is_none();
                if let Some(entry) = entry {
                    extra_entries.push(entry);
                }
                if entry_migrated || is_none {
                    migrated = true;
                }
            }
        }
        Value::Object(record) => {
            if record.contains_key("order") || is_prompt_order_list(value) {
                let character_id = record
                    .get("character_id")
                    .cloned()
                    .unwrap_or_else(|| json!(dummy_id));
                let (order, order_migrated) =
                    normalize_prompt_order_entries(record.get("order").unwrap_or(&Value::Null));
                lists.push(PromptOrderList {
                    character_id,
                    order,
                });
                migrated = order_migrated;
            } else {
                let (entries, _) = normalize_prompt_order_entries(value);
                return (
                    vec![PromptOrderList {
                        character_id: json!(dummy_id),
                        order: entries,
                    }],
                    true,
                );
            }
        }
        _ => {}
    }

    if !extra_entries.is_empty() {
        let dummy_text = dummy_id.to_string();
        if let Some(dummy_list) = lists.iter_mut().find(|entry| {
            vstr(&entry.character_id) == dummy_text || entry.character_id.as_i64() == Some(dummy_id)
        }) {
            dummy_list.order.extend(extra_entries);
        } else {
            lists.push(PromptOrderList {
                character_id: json!(dummy_id),
                order: extra_entries,
            });
            migrated = true;
        }
    }

    (lists, migrated)
}

fn resolve_fallback_prompts(value: Option<&Value>) -> Option<Vec<PromptEntry>> {
    match value {
        Some(Value::Array(items)) if !items.is_empty() => Some(
            items
                .iter()
                .enumerate()
                .map(|(index, item)| match item.as_object() {
                    Some(record) => prompt_entry_from_object(record, format!("prompt_{index}")),
                    None => PromptEntry {
                        identifier: format!("prompt_{index}"),
                        name: Some(format!("prompt_{index}")),
                        role: Some("system".to_string()),
                        content: Some(vstr(item)),
                        enabled: None,
                        system_prompt: Some(false),
                        marker: Some(false),
                        injection_position: None,
                        injection_depth: None,
                        injection_order: None,
                        injection_trigger: vec![],
                    },
                })
                .collect(),
        ),
        Some(Value::Object(map)) => {
            let (entries, _) = normalize_prompt_map_entries(map);
            if entries.is_empty() {
                None
            } else {
                Some(entries)
            }
        }
        _ => None,
    }
}

fn resolve_fallback_order(value: Option<&Value>) -> Option<Vec<PromptOrderList>> {
    match value {
        Some(Value::Array(items)) if !items.is_empty() => {
            let (lists, _) =
                normalize_prompt_order_lists(&Value::Array(items.clone()), PROMPT_MANAGER_DUMMY_ID);
            if lists.is_empty() { None } else { Some(lists) }
        }
        _ => None,
    }
}

fn build_prompt_order_entries(prompts: &[PromptEntry]) -> Vec<PromptOrderEntry> {
    prompts
        .iter()
        .filter_map(|prompt| {
            if prompt.identifier.trim().is_empty() {
                None
            } else {
                Some(PromptOrderEntry {
                    identifier: prompt.identifier.trim().to_string(),
                    enabled: prompt.enabled.unwrap_or(true),
                })
            }
        })
        .collect()
}

fn normalize_prompt_manager_payload(
    prompts: &Value,
    prompt_order: &Value,
    fallback_prompts: Option<&Value>,
    fallback_order: Option<&Value>,
) -> (Vec<PromptEntry>, Vec<PromptOrderList>, bool, bool, bool) {
    let fallback_prompts = resolve_fallback_prompts(fallback_prompts);
    let fallback_order = resolve_fallback_order(fallback_order);

    let mut inherited = false;
    let mut migrated = false;
    let mut migrated_map = false;

    let next_prompts = match prompts {
        Value::Array(items) if !items.is_empty() => items
            .iter()
            .enumerate()
            .map(|(index, item)| match item.as_object() {
                Some(record) => prompt_entry_from_object(record, format!("prompt_{index}")),
                None => PromptEntry {
                    identifier: format!("prompt_{index}"),
                    name: Some(format!("prompt_{index}")),
                    role: Some("system".to_string()),
                    content: Some(vstr(item)),
                    enabled: None,
                    system_prompt: Some(false),
                    marker: Some(false),
                    injection_position: None,
                    injection_depth: None,
                    injection_order: None,
                    injection_trigger: vec![],
                },
            })
            .collect(),
        Value::Array(_) => {
            if let Some(fallback) = fallback_prompts.clone() {
                inherited = true;
                fallback
            } else {
                Vec::new()
            }
        }
        Value::Object(map) => {
            let (entries, map_migrated) = normalize_prompt_map_entries(map);
            migrated = true;
            migrated_map = true;
            if entries.is_empty() {
                if let Some(fallback) = fallback_prompts.clone() {
                    inherited = true;
                    fallback
                } else {
                    Vec::new()
                }
            } else {
                if map_migrated {
                    migrated = true;
                }
                entries
            }
        }
        Value::Null => {
            if let Some(fallback) = fallback_prompts.clone() {
                inherited = true;
                fallback
            } else {
                Vec::new()
            }
        }
        _ => Vec::new(),
    };

    let mut next_order_opt: Option<Vec<PromptOrderList>> = None;
    match prompt_order {
        Value::Array(items) if items.is_empty() => {
            next_order_opt = None;
        }
        Value::Null => {}
        _ => {
            let (lists, list_migrated) =
                normalize_prompt_order_lists(prompt_order, PROMPT_MANAGER_DUMMY_ID);
            if !lists.is_empty() {
                next_order_opt = Some(lists);
                if list_migrated {
                    migrated = true;
                }
            }
        }
    }

    if next_order_opt.is_none() {
        if let Some(fallback) = fallback_order.clone() {
            let (lists, _) = normalize_prompt_order_lists(
                &Value::Array(fallback.iter().map(prompt_order_list_to_value).collect()),
                PROMPT_MANAGER_DUMMY_ID,
            );
            next_order_opt = Some(lists);
            inherited = true;
        }
    }

    let mut next_order = if let Some(order) = next_order_opt {
        order
    } else if !next_prompts.is_empty() {
        migrated = true;
        vec![PromptOrderList {
            character_id: json!(PROMPT_MANAGER_DUMMY_ID),
            order: build_prompt_order_entries(&next_prompts),
        }]
    } else {
        Vec::new()
    };

    let has_dummy = next_order.iter().any(|entry| {
        entry.character_id.as_i64() == Some(PROMPT_MANAGER_DUMMY_ID)
            || vstr(&entry.character_id) == PROMPT_MANAGER_DUMMY_ID.to_string()
    });
    let fallback_list = next_order
        .iter()
        .find(|entry| {
            entry.character_id.as_i64() == Some(PROMPT_MANAGER_FALLBACK_ID)
                || vstr(&entry.character_id) == PROMPT_MANAGER_FALLBACK_ID.to_string()
        })
        .cloned();
    if !has_dummy {
        if let Some(fallback_list) = fallback_list {
            next_order.push(PromptOrderList {
                character_id: json!(PROMPT_MANAGER_DUMMY_ID),
                order: fallback_list.order,
            });
            migrated = true;
        }
    }

    (next_prompts, next_order, inherited, migrated, migrated_map)
}

fn ensure_unique_identifier(base: &str, used: &mut std::collections::HashSet<String>) -> String {
    let mut candidate = base.to_string();
    let mut counter = 1usize;
    while used.contains(&candidate) {
        candidate = format!("{base}__fix__{counter}");
        counter += 1;
    }
    used.insert(candidate.clone());
    candidate
}

fn get_active_prompt_order_list(
    order: &[PromptOrderList],
    dummy_id: i64,
) -> Option<PromptOrderList> {
    order
        .iter()
        .find(|entry| {
            entry.character_id.as_i64() == Some(dummy_id)
                || vstr(&entry.character_id) == dummy_id.to_string()
        })
        .cloned()
}

fn apply_active_prompt_order(
    prompt_order: &[PromptOrderList],
    order: Vec<PromptOrderEntry>,
    dummy_id: i64,
) -> Vec<PromptOrderList> {
    let mut next = prompt_order.to_vec();
    if let Some(index) = next.iter().position(|entry| {
        entry.character_id.as_i64() == Some(dummy_id)
            || vstr(&entry.character_id) == dummy_id.to_string()
    }) {
        next[index] = PromptOrderList {
            character_id: next[index].character_id.clone(),
            order,
        };
        return next;
    }
    next.push(PromptOrderList {
        character_id: json!(dummy_id),
        order,
    });
    next
}

pub fn sanitize_prompts(
    prompts: &Value,
    order: &Value,
    fallback_prompts: Option<&Value>,
    fallback_order: Option<&Value>,
) -> PromptSanitizeResult {
    let (normalized_prompts, normalized_order, inherited, migrated, migrated_map) =
        normalize_prompt_manager_payload(prompts, order, fallback_prompts, fallback_order);
    let fallback_prompts = resolve_fallback_prompts(fallback_prompts);
    let fallback_order = resolve_fallback_order(fallback_order);

    let mut stats = PromptRepairStatsDto::default();
    let mut repaired = false;

    let mut working_prompts = normalized_prompts;
    if working_prompts.is_empty() {
        working_prompts = fallback_prompts.unwrap_or_else(default_prompt_entries);
        repaired = true;
    }

    let mut repaired_prompts = Vec::new();
    let mut used_ids = std::collections::HashSet::new();

    for (index, entry) in working_prompts.into_iter().enumerate() {
        let mut next = entry.clone();
        let raw_id = next.identifier.trim().to_string();
        let identifier = if raw_id.is_empty() {
            stats.generated += 1;
            repaired = true;
            ensure_unique_identifier(&format!("prompt_{index}"), &mut used_ids)
        } else if used_ids.contains(&raw_id) {
            stats.renamed += 1;
            repaired = true;
            ensure_unique_identifier(&raw_id, &mut used_ids)
        } else {
            used_ids.insert(raw_id.clone());
            raw_id
        };
        next.identifier = identifier;
        repaired_prompts.push(next);
    }

    if repaired_prompts.is_empty() {
        repaired_prompts = default_prompt_entries();
        repaired = true;
    }

    let mut prompt_map: std::collections::HashSet<String> = repaired_prompts
        .iter()
        .map(|p| p.identifier.clone())
        .collect();
    for default_prompt in default_prompt_entries() {
        if prompt_map.contains(&default_prompt.identifier) {
            continue;
        }
        prompt_map.insert(default_prompt.identifier.clone());
        repaired_prompts.push(default_prompt);
        repaired = true;
    }

    let mut order_lists = if normalized_order.is_empty() {
        if let Some(fallback) = fallback_order {
            fallback
        } else {
            vec![PromptOrderList {
                character_id: json!(PROMPT_MANAGER_DUMMY_ID),
                order: build_prompt_order_entries(&repaired_prompts),
            }]
        }
    } else {
        normalized_order
    };
    if order_lists.is_empty() {
        repaired = true;
    }

    let active_list =
        get_active_prompt_order_list(&order_lists, PROMPT_MANAGER_DUMMY_ID).or_else(|| {
            order_lists
                .iter()
                .find(|entry| {
                    entry.character_id.as_i64() == Some(PROMPT_MANAGER_FALLBACK_ID)
                        || vstr(&entry.character_id) == PROMPT_MANAGER_FALLBACK_ID.to_string()
                })
                .cloned()
        });

    let next_order = if let Some(active) = active_list {
        active.order
    } else {
        repaired = true;
        build_prompt_order_entries(&repaired_prompts)
    };

    let available_ids: std::collections::HashSet<String> = repaired_prompts
        .iter()
        .map(|prompt| prompt.identifier.clone())
        .collect();
    let filtered_order: Vec<PromptOrderEntry> = next_order
        .into_iter()
        .filter(|entry| {
            let exists = available_ids.contains(&entry.identifier);
            if !exists {
                stats.removed_order += 1;
                repaired = true;
            }
            exists
        })
        .collect();

    order_lists = apply_active_prompt_order(&order_lists, filtered_order, PROMPT_MANAGER_DUMMY_ID);

    PromptSanitizeResult {
        prompts_value: Value::Array(repaired_prompts.iter().map(prompt_entry_to_value).collect()),
        prompt_order: Value::Array(order_lists.iter().map(prompt_order_list_to_value).collect()),
        inherited,
        migrated,
        migrated_map,
        repaired,
        stats,
    }
}

const MULTIPLAYER_MESSAGE_META_KEY: &str = "tauritavern_multiplayer";

#[derive(Debug, Clone)]
pub struct OpenAiMessage {
    pub role: String,
    pub content: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct MultiplayerPromptMeta {
    room_round_id: String,
    nickname: String,
    pending: bool,
}

fn payload_messages(payload: &Value) -> Vec<Map<String, Value>> {
    payload
        .as_array()
        .map(|items| {
            items
                .iter()
                .skip(1)
                .filter_map(|item| item.as_object().cloned())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn build_timeline_messages(
    payload: &Value,
    mode: &GenerationMode,
    target_idx: Option<usize>,
) -> Vec<Map<String, Value>> {
    let messages = payload_messages(payload);
    match (mode, target_idx) {
        (GenerationMode::Regenerate, Some(index)) => messages.into_iter().take(index).collect(),
        (GenerationMode::Continue, Some(index)) => messages.into_iter().take(index + 1).collect(),
        _ => messages,
    }
}

fn is_multiplayer_session_payload(payload: &Value) -> bool {
    payload
        .as_array()
        .and_then(|items| items.first())
        .and_then(Value::as_object)
        .and_then(|header| header.get("chat_metadata"))
        .and_then(Value::as_object)
        .and_then(|metadata| metadata.get("tauritavern"))
        .and_then(Value::as_object)
        .and_then(|tauritavern| tauritavern.get("session"))
        .and_then(Value::as_object)
        .and_then(|session| session.get("mode"))
        .and_then(Value::as_str)
        == Some("multiplayer")
}

pub fn validate_multiplayer_round_request(
    payload: &Value,
    mode: &GenerationMode,
    multiplayer_participants: &[Value],
) -> Option<PrepareGenerationIssueDto> {
    if !matches!(mode, GenerationMode::Reply) || !is_multiplayer_session_payload(payload) {
        return None;
    }

    let participants = multiplayer_participants
        .iter()
        .filter_map(Value::as_object)
        .filter_map(|participant| {
            let participant_id = participant.get("participant_id").map(vstr).unwrap_or_default();
            let participant_id = participant_id.trim().to_string();
            if participant_id.is_empty() {
                return None;
            }
            let nickname = participant
                .get("nickname")
                .map(vstr)
                .unwrap_or_else(|| participant_id.clone())
                .trim()
                .to_string();
            Some((participant_id, nickname))
        })
        .collect::<Vec<_>>();

    if participants.is_empty() {
        return None;
    }

    let timeline_messages = build_timeline_messages(payload, mode, None);
    let latest_round_id = timeline_messages.iter().rev().find_map(|message| {
        parse_multiplayer_prompt_meta(message).and_then(|meta| {
            if meta.pending || meta.room_round_id.trim().is_empty() {
                None
            } else {
                Some(meta.room_round_id)
            }
        })
    });

    let Some(latest_round_id) = latest_round_id else {
        return Some(PrepareGenerationIssueDto {
            code: "multiplayer_round_incomplete".to_string(),
            severity: "blocking".to_string(),
            details: Some(participants.iter().map(|(_, nickname)| nickname.clone()).collect()),
        });
    };

    let submitted = timeline_messages
        .iter()
        .filter_map(|message| {
            let meta = parse_multiplayer_prompt_meta(message)?;
            if meta.pending || meta.room_round_id != latest_round_id {
                return None;
            }
            message.get("extra")
                .and_then(Value::as_object)
                .and_then(|extra| extra.get(MULTIPLAYER_MESSAGE_META_KEY))
                .and_then(Value::as_object)
                .and_then(|meta| meta.get("participant_id"))
                .map(vstr)
                .map(|participant_id| participant_id.trim().to_string())
                .filter(|participant_id| !participant_id.is_empty())
        })
        .collect::<HashSet<_>>();

    let missing = participants
        .into_iter()
        .filter_map(|(participant_id, nickname)| {
            if submitted.contains(&participant_id) {
                None
            } else {
                Some(nickname)
            }
        })
        .collect::<Vec<_>>();

    if missing.is_empty() {
        None
    } else {
        Some(PrepareGenerationIssueDto {
            code: "multiplayer_round_incomplete".to_string(),
            severity: "blocking".to_string(),
            details: Some(missing),
        })
    }
}

fn map_prompt_role(role: Option<&str>) -> String {
    match role.unwrap_or_default().trim().to_lowercase().as_str() {
        "user" => "user".to_string(),
        "assistant" => "assistant".to_string(),
        _ => "system".to_string(),
    }
}

fn format_world_info(value: &str, format: &str) -> String {
    if value.trim().is_empty() {
        return String::new();
    }
    if format.trim().is_empty() {
        return value.to_string();
    }
    format.replace("{0}", value)
}

fn render_template(template: &str, params: &HashMap<String, String>) -> String {
    if template.is_empty() {
        return String::new();
    }
    let re = Regex::new(r"\{\{\s*([^}]+)\s*\}\}").expect("template regex");
    re.replace_all(template, |caps: &regex::Captures<'_>| {
        let whole = caps.get(0).map(|m| m.as_str()).unwrap_or_default();
        let key = caps.get(1).map(|m| m.as_str().trim()).unwrap_or_default();
        params
            .get(key)
            .cloned()
            .unwrap_or_else(|| whole.to_string())
    })
    .into_owned()
}

fn replace_angle_macros(template: &str, params: &HashMap<String, String>) -> String {
    let replacements = [
        ("<user>", params.get("user").cloned().unwrap_or_default()),
        ("<char>", params.get("char").cloned().unwrap_or_default()),
        ("<bot>", params.get("char").cloned().unwrap_or_default()),
        ("<group>", params.get("group").cloned().unwrap_or_default()),
        (
            "<charifnotgroup>",
            params.get("charIfNotGroup").cloned().unwrap_or_default(),
        ),
    ];
    let mut out = template.to_string();
    for (pattern, value) in replacements {
        let re =
            Regex::new(&format!(r"(?i){}", regex::escape(pattern))).expect("angle macro regex");
        out = re.replace_all(&out, value.as_str()).into_owned();
    }
    out
}

#[derive(Debug, Default, Clone)]
struct PromptMacroContext {
    params: HashMap<String, String>,
    variables: HashMap<String, String>,
    now_player_input: Option<String>,
}

fn apply_prompt_macros(input: &str, context: &mut PromptMacroContext) -> String {
    if input.is_empty() {
        return String::new();
    }

    let comment_re = Regex::new(r"\{\{\s*//[\s\S]*?\}\}").expect("comment regex");
    let newline_re = Regex::new(r"(?i)\{\{\s*newline\s*\}\}").expect("newline regex");
    let noop_re = Regex::new(r"(?i)\{\{\s*noop\s*\}\}").expect("noop regex");
    let add_set_re =
        Regex::new(r"\{\{\s*(addvar|setvar)::([\s\S]*?)::([\s\S]*?)\}\}").expect("addvar regex");
    let getvar_re = Regex::new(r"\{\{\s*getvar::([\s\S]*?)\}\}").expect("getvar regex");
    let trim_re = Regex::new(r"(?:\r?\n)*\{\{\s*trim\s*\}\}(?:\r?\n)*").expect("trim regex");
    let now_self_close_re =
        Regex::new(r"(?i)<now-player-input\s*/>").expect("now self close regex");
    let now_block_re =
        Regex::new(r"(?i)<now-player-input>[\s\S]*?</now-player-input>").expect("now block regex");

    let mut output = input.to_string();
    output = comment_re.replace_all(&output, "").into_owned();
    output = newline_re.replace_all(&output, "\n").into_owned();
    output = noop_re.replace_all(&output, "").into_owned();
    output = add_set_re
        .replace_all(&output, |caps: &regex::Captures<'_>| {
            let action = caps.get(1).map(|m| m.as_str()).unwrap_or_default();
            let name = caps
                .get(2)
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_default();
            if name.is_empty() {
                return String::new();
            }
            let value = caps
                .get(3)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default()
                .trim_start_matches('\r')
                .trim_start_matches('\n')
                .to_string();
            if action == "addvar" {
                let current = context.variables.get(&name).cloned().unwrap_or_default();
                context.variables.insert(name, format!("{current}{value}"));
            } else {
                context.variables.insert(name, value);
            }
            String::new()
        })
        .into_owned();
    output = getvar_re
        .replace_all(&output, |caps: &regex::Captures<'_>| {
            let name = caps
                .get(1)
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_default();
            if name.is_empty() {
                String::new()
            } else {
                context.variables.get(&name).cloned().unwrap_or_default()
            }
        })
        .into_owned();
    output = render_template(&output, &context.params);
    output = replace_angle_macros(&output, &context.params);

    let now_player_input = context
        .now_player_input
        .clone()
        .unwrap_or_default()
        .replace("\r\n", "\n")
        .trim_end()
        .to_string();
    if !now_player_input.is_empty() && output.to_lowercase().contains("now-player-input") {
        let replacement = format!("<now-player-input>\n{now_player_input}</now-player-input>");
        output = now_self_close_re
            .replace_all(&output, replacement.as_str())
            .into_owned();
        output = now_block_re
            .replace_all(&output, replacement.as_str())
            .into_owned();
    }

    trim_re.replace_all(&output, "").into_owned()
}

fn get_message_name(message: &Map<String, Value>) -> String {
    get_string(message, "name")
}

fn get_message_content(message: &Map<String, Value>) -> String {
    get_string(message, "mes")
}

fn is_user_message(message: &Map<String, Value>) -> bool {
    message.get("is_user").map(vbool).unwrap_or(false)
}

fn is_system_message(message: &Map<String, Value>) -> bool {
    message.get("is_system").map(vbool).unwrap_or(false)
}

fn parse_multiplayer_prompt_meta(message: &Map<String, Value>) -> Option<MultiplayerPromptMeta> {
    let extra = message.get("extra")?.as_object()?;
    let meta = extra.get(MULTIPLAYER_MESSAGE_META_KEY)?.as_object()?;
    Some(MultiplayerPromptMeta {
        room_round_id: meta
            .get("room_round_id")
            .map(vstr)
            .unwrap_or_default()
            .trim()
            .to_string(),
        nickname: meta
            .get("nickname")
            .map(vstr)
            .unwrap_or_else(|| get_message_name(message))
            .trim()
            .to_string(),
        pending: meta.get("pending").map(vbool).unwrap_or(false),
    })
}

fn format_multiplayer_contribution(message: &Map<String, Value>, meta: &MultiplayerPromptMeta) -> String {
    let nickname = meta.nickname.trim();
    let content = get_message_content(message);
    if nickname.is_empty() {
        return content;
    }
    format!("{nickname}：“{content}”")
}

fn build_multiplayer_participant_context_block(participants: &[Value]) -> String {
    let mut sections = Vec::new();

    for participant in participants {
        let Some(record) = participant.as_object() else {
            continue;
        };

        let nickname = get_string(record, "nickname").trim().to_string();
        let character_name = get_string(record, "character_name").trim().to_string();
        let character_card = record
            .get("character_card")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let description = get_string(&character_card, "description").trim().to_string();
        let personality = get_string(&character_card, "personality").trim().to_string();
        let scenario = get_string(&character_card, "scenario").trim().to_string();
        let first_mes = get_string(&character_card, "first_mes").trim().to_string();
        let system_prompt = get_string(&character_card, "system_prompt").trim().to_string();
        let post_history_instructions = get_string(&character_card, "post_history_instructions")
            .trim()
            .to_string();

        if nickname.is_empty()
            && character_name.is_empty()
            && description.is_empty()
            && personality.is_empty()
            && scenario.is_empty()
            && first_mes.is_empty()
            && system_prompt.is_empty()
            && post_history_instructions.is_empty()
        {
            continue;
        }

        let mut lines = Vec::new();
        if !nickname.is_empty() {
            lines.push(format!("- Player nickname: {nickname}"));
        }
        if !character_name.is_empty() {
            lines.push(format!("- Role card name: {character_name}"));
        }
        if !description.is_empty() {
            lines.push(format!("- Description: {description}"));
        }
        if !personality.is_empty() {
            lines.push(format!("- Personality: {personality}"));
        }
        if !scenario.is_empty() {
            lines.push(format!("- Scenario: {scenario}"));
        }
        if !first_mes.is_empty() {
            lines.push(format!("- First message: {first_mes}"));
        }
        if !system_prompt.is_empty() {
            lines.push(format!("- System prompt: {system_prompt}"));
        }
        if !post_history_instructions.is_empty() {
            lines.push(format!(
                "- Post-history instructions: {post_history_instructions}"
            ));
        }

        sections.push(format!("[Player Role Card]\n{}", lines.join("\n")));
    }

    if sections.is_empty() {
        return String::new();
    }

    format!(
        "[Multiplayer Participant Context]\n{}",
        sections.join("\n\n")
    )
}

fn build_message_source_content(message: &Map<String, Value>) -> String {
    let extra = clone_object(message.get("extra"));
    if let Some(source_response_text) = extra.get("source_response_text") {
        let value = vstr(source_response_text);
        if !value.is_empty() {
            return value;
        }
    }

    let content = get_message_content(message);
    if is_user_message(message) || is_system_message(message) {
        return content;
    }

    let thinking_re = Regex::new(r"(?i)<thinking>[\s\S]*?</thinking>").expect("thinking regex");
    if thinking_re.is_match(&content) {
        return content;
    }

    let reasoning = extra
        .get("reasoning")
        .map(vstr)
        .unwrap_or_default()
        .trim()
        .to_string();
    if reasoning.is_empty() {
        content
    } else {
        format!("<thinking>{reasoning}</thinking>\n{content}")
    }
}

fn resolve_regex_depth(
    total_messages: usize,
    start_index: usize,
    local_message_index: usize,
) -> usize {
    let full_index = start_index.saturating_add(local_message_index);
    total_messages.saturating_sub(full_index).saturating_sub(1)
}

fn substitute_regex_macros(
    source: &str,
    user_name: &str,
    assistant_name: &str,
    group_name: &str,
    is_group: bool,
    escape_values: bool,
) -> String {
    let value = |text: &str| {
        if escape_values {
            regex::escape(text)
        } else {
            text.to_string()
        }
    };
    let char_if_not_group = if is_group { "" } else { assistant_name };
    let replacements = HashMap::from([
        ("user".to_string(), value(user_name)),
        ("username".to_string(), value(user_name)),
        ("char".to_string(), value(assistant_name)),
        ("bot".to_string(), value(assistant_name)),
        ("assistant".to_string(), value(assistant_name)),
        ("character".to_string(), value(assistant_name)),
        ("group".to_string(), value(group_name)),
        ("charifnotgroup".to_string(), value(char_if_not_group)),
    ]);

    let template_re = Regex::new(r"\{\{\s*([^}]+)\s*\}\}").expect("regex macro template");
    let mut output = template_re
        .replace_all(source, |caps: &regex::Captures<'_>| {
            let whole = caps.get(0).map(|m| m.as_str()).unwrap_or_default();
            let key = caps
                .get(1)
                .map(|m| m.as_str().trim().to_lowercase())
                .unwrap_or_default();
            replacements
                .get(&key)
                .cloned()
                .unwrap_or_else(|| whole.to_string())
        })
        .into_owned();

    let angle_replacements = [
        (
            "<user>",
            replacements.get("user").cloned().unwrap_or_default(),
        ),
        (
            "<char>",
            replacements.get("char").cloned().unwrap_or_default(),
        ),
        (
            "<bot>",
            replacements.get("bot").cloned().unwrap_or_default(),
        ),
        (
            "<group>",
            replacements.get("group").cloned().unwrap_or_default(),
        ),
        (
            "<charifnotgroup>",
            replacements
                .get("charifnotgroup")
                .cloned()
                .unwrap_or_default(),
        ),
    ];
    for (pattern, replacement) in angle_replacements {
        let re =
            Regex::new(&format!(r"(?i){}", regex::escape(pattern))).expect("regex angle macro");
        output = re.replace_all(&output, replacement.as_str()).into_owned();
    }

    output
}

fn parse_regex_expression(expression: &str) -> (String, String) {
    let trimmed = expression.trim();
    if trimmed.starts_with('/') {
        if let Some(last_slash) = trimmed.rfind('/') {
            if last_slash > 0 {
                return (
                    trimmed[1..last_slash].to_string(),
                    trimmed[last_slash + 1..].to_string(),
                );
            }
        }
    }
    (trimmed.to_string(), String::new())
}

fn compile_prompt_regex(
    expression: &str,
    substitute_regex: i64,
    user_name: &str,
    assistant_name: &str,
    group_name: &str,
    is_group: bool,
) -> Option<Regex> {
    let (source, flags) = parse_regex_expression(expression);
    if source.is_empty() {
        return None;
    }

    let substituted_source = match substitute_regex {
        1 => substitute_regex_macros(
            &source,
            user_name,
            assistant_name,
            group_name,
            is_group,
            false,
        ),
        2 => substitute_regex_macros(
            &source,
            user_name,
            assistant_name,
            group_name,
            is_group,
            true,
        ),
        _ => source,
    };

    let supported_flags: String = flags
        .chars()
        .filter(|flag| matches!(flag, 'i' | 'm' | 's' | 'U' | 'x'))
        .collect();
    let pattern = if supported_flags.is_empty() {
        substituted_source
    } else {
        format!("(?{supported_flags}){substituted_source}")
    };

    Regex::new(&pattern).ok()
}

fn apply_trim_strings(mut source: String, trim_strings: &[String]) -> String {
    for trim_value in trim_strings {
        if trim_value.is_empty() {
            continue;
        }
        while source.starts_with(trim_value) {
            source = source[trim_value.len()..].to_string();
        }
        while source.ends_with(trim_value) {
            let end = source.len().saturating_sub(trim_value.len());
            source = source[..end].to_string();
        }
    }
    source
}

fn resolve_assistant_prompt_text(
    message: &Map<String, Value>,
    local_message_index: usize,
    start_index: usize,
    total_messages: usize,
    preset: &Map<String, Value>,
    user_name: &str,
    assistant_name: &str,
    group_name: &str,
    is_group: bool,
) -> String {
    let canonical_base = get_message_content(message);
    let scripts = preset
        .get("regex_scripts")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if scripts.is_empty() {
        return canonical_base;
    }

    let source = build_message_source_content(message);
    let depth = resolve_regex_depth(total_messages, start_index, local_message_index);
    let mut output = source.clone();
    let mut any_applicable = false;

    for script in scripts {
        let Some(record) = script.as_object() else {
            continue;
        };
        if record.get("disabled").map(vbool).unwrap_or(false) {
            continue;
        }
        let placement = record
            .get("placement")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if !placement.is_empty() {
            let allows_ai_response = placement.iter().filter_map(vi64).any(|value| value == 2);
            if !allows_ai_response {
                continue;
            }
        }
        let markdown_only = record.get("markdownOnly").map(vbool).unwrap_or(false);
        let prompt_only = record.get("promptOnly").map(vbool).unwrap_or(false);
        if markdown_only && !prompt_only {
            continue;
        }
        if let Some(min_depth) = record.get("minDepth").and_then(vi64) {
            if (depth as i64) < min_depth {
                continue;
            }
        }
        if let Some(max_depth) = record.get("maxDepth").and_then(vi64) {
            if (depth as i64) > max_depth {
                continue;
            }
        }
        let find_regex = record.get("findRegex").map(vstr).unwrap_or_default();
        if find_regex.trim().is_empty() {
            continue;
        }
        let substitute_regex = record.get("substituteRegex").and_then(vi64).unwrap_or(0);
        let Some(matcher) = compile_prompt_regex(
            &find_regex,
            substitute_regex,
            user_name,
            assistant_name,
            group_name,
            is_group,
        ) else {
            continue;
        };
        any_applicable = true;
        let replaced = matcher
            .replace_all(
                &output,
                record
                    .get("replaceString")
                    .map(vstr)
                    .unwrap_or_default()
                    .as_str(),
            )
            .into_owned();
        let trim_strings = record
            .get("trimStrings")
            .map(as_string_array)
            .unwrap_or_default();
        output = apply_trim_strings(replaced, &trim_strings);
    }

    if any_applicable { output } else { source }
}

#[derive(Debug, Clone, Default)]
struct AssistantDisplayProjection {
    canonical_text: String,
    display_text: String,
    prompt_text: String,
    applied_rule_ids: Vec<String>,
}

fn normalize_render_language(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn resolve_interactive_preview_kind(language: &str, source: &str) -> Option<&'static str> {
    let normalized_language = normalize_render_language(language);
    if matches!(normalized_language.as_str(), "html" | "htm" | "xhtml") {
        return Some("html");
    }
    if normalized_language == "css" {
        return Some("css");
    }
    if normalized_language == "svg" {
        return Some("svg");
    }
    if matches!(normalized_language.as_str(), "js" | "javascript" | "mjs") {
        return Some("javascript");
    }

    let normalized_source = source.trim().to_ascii_lowercase();
    if normalized_source.is_empty() {
        return None;
    }
    if normalized_source.contains("<!doctype")
        || normalized_source.contains("<html")
        || normalized_source.contains("<script")
        || normalized_source.contains("<style")
    {
        return Some("html");
    }
    if normalized_source.contains("<svg") {
        return Some("svg");
    }

    None
}

fn render_preview_hash(language: &str, source: &str) -> String {
    let mut hash: u32 = 5381;
    for byte in language
        .as_bytes()
        .iter()
        .chain([0_u8].iter())
        .chain(source.as_bytes().iter())
    {
        hash = ((hash << 5).wrapping_add(hash)) ^ u32::from(*byte);
    }
    format!("{hash:08x}")
}

fn build_render_blocks(display_text: &str) -> Option<(Vec<Value>, bool)> {
    let normalized = display_text.replace("\r\n", "\n").replace('\r', "\n");
    if !normalized.contains("```") {
        return None;
    }

    let mut blocks = Vec::new();
    let mut text_buffer: Vec<String> = Vec::new();
    let mut code_buffer: Vec<String> = Vec::new();
    let mut code_language = String::new();
    let mut opening_fence = String::new();
    let mut in_code_block = false;
    let mut has_interactive_code = false;

    let flush_text = |blocks: &mut Vec<Value>, text_buffer: &mut Vec<String>| {
        if text_buffer.is_empty() {
            return;
        }
        blocks.push(json!({
            "kind": "text",
            "content": text_buffer.join("\n"),
        }));
        text_buffer.clear();
    };

    let flush_code = |
        blocks: &mut Vec<Value>,
        code_language: &mut String,
        code_buffer: &mut Vec<String>,
        has_interactive_code: &mut bool,
    | {
        let content = code_buffer.join("\n");
        let preview_kind = resolve_interactive_preview_kind(code_language, &content);
        let interactive = preview_kind.is_some();
        if interactive {
            *has_interactive_code = true;
        }

        let mut block = Map::new();
        block.insert("kind".to_string(), json!("code"));
        block.insert("language".to_string(), json!(code_language.clone()));
        block.insert("content".to_string(), json!(content.clone()));
        block.insert("interactive".to_string(), json!(interactive));
        if let Some(kind) = preview_kind {
            block.insert("preview_kind".to_string(), json!(kind));
            block.insert(
                "preview_hash".to_string(),
                json!(render_preview_hash(code_language, &content)),
            );
        }
        blocks.push(Value::Object(block));

        code_buffer.clear();
        code_language.clear();
    };

    for line in normalized.split('\n') {
        let fence_match = line.strip_prefix("```");
        let is_closing_fence = line.trim() == "```";

        if !in_code_block {
            if let Some(fence_value) = fence_match {
                flush_text(&mut blocks, &mut text_buffer);
                in_code_block = true;
                code_language = normalize_render_language(
                    fence_value
                        .split_whitespace()
                        .next()
                        .unwrap_or_default(),
                );
                opening_fence = line.to_string();
            } else {
                text_buffer.push(line.to_string());
            }
            continue;
        }

        if is_closing_fence {
            flush_code(
                &mut blocks,
                &mut code_language,
                &mut code_buffer,
                &mut has_interactive_code,
            );
            in_code_block = false;
            continue;
        }

        code_buffer.push(line.to_string());
    }

    if in_code_block {
        text_buffer.push(opening_fence);
        text_buffer.extend(code_buffer);
    }

    flush_text(&mut blocks, &mut text_buffer);

    if blocks.is_empty() {
        return None;
    }

    Some((blocks, has_interactive_code))
}

fn split_thinking_content(source: &str) -> (String, Option<String>) {
    let thinking_re =
        Regex::new(r"(?i)<thinking>([\s\S]*?)</thinking>").expect("thinking split regex");
    let Some(captures) = thinking_re.captures(source) else {
        return (source.to_string(), None);
    };

    let full = captures
        .get(0)
        .map(|m| m.as_str())
        .unwrap_or_default()
        .to_string();
    let reasoning = captures
        .get(1)
        .map(|m| m.as_str().trim().to_string())
        .filter(|value| !value.is_empty());
    let content = source.replace(&full, "").trim().to_string();
    (content, reasoning)
}

fn clear_regex_projection_fields(extra: &mut Map<String, Value>) {
    extra.remove("regex_display_text");
    extra.remove("regex_prompt_text");
    extra.remove("regex_preset_hash");
    extra.remove("regex_applied_rule_ids");
    extra.remove("render_blocks");
    extra.remove("render_has_interactive_code");
}

fn build_assistant_display_projection(
    message: &Map<String, Value>,
    local_message_index: usize,
    start_index: usize,
    total_messages: usize,
    preset: &Map<String, Value>,
    user_name: &str,
    assistant_name: &str,
    group_name: &str,
    is_group: bool,
    source_text_override: Option<&str>,
    reason: &str,
) -> AssistantDisplayProjection {
    let canonical_base = get_message_content(message);
    let source = source_text_override
        .map(str::to_string)
        .unwrap_or_else(|| build_message_source_content(message));
    let scripts = preset
        .get("regex_scripts")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    if scripts.is_empty() {
        return AssistantDisplayProjection {
            canonical_text: source.clone(),
            display_text: canonical_base,
            prompt_text: source,
            applied_rule_ids: Vec::new(),
        };
    }

    let depth = resolve_regex_depth(total_messages, start_index, local_message_index);
    let mut canonical = source.clone();
    let mut display = source.clone();
    let mut prompt = source.clone();
    let mut applied_rule_ids = Vec::new();
    let mut any_applied = false;

    for script in scripts {
        let Some(record) = script.as_object() else {
            continue;
        };
        if record.get("disabled").map(vbool).unwrap_or(false) {
            continue;
        }
        if reason == "edit" && !record.get("runOnEdit").map(vbool).unwrap_or(false) {
            continue;
        }
        let placement = record
            .get("placement")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if !placement.is_empty() {
            let allows_ai_response = placement.iter().filter_map(vi64).any(|value| value == 2);
            if !allows_ai_response {
                continue;
            }
        }
        if let Some(min_depth) = record.get("minDepth").and_then(vi64) {
            if (depth as i64) < min_depth {
                continue;
            }
        }
        if let Some(max_depth) = record.get("maxDepth").and_then(vi64) {
            if (depth as i64) > max_depth {
                continue;
            }
        }

        let find_regex = record.get("findRegex").map(vstr).unwrap_or_default();
        if find_regex.trim().is_empty() {
            continue;
        }
        let substitute_regex = record.get("substituteRegex").and_then(vi64).unwrap_or(0);
        let Some(matcher) = compile_prompt_regex(
            &find_regex,
            substitute_regex,
            user_name,
            assistant_name,
            group_name,
            is_group,
        ) else {
            continue;
        };

        let replace_string = record.get("replaceString").map(vstr).unwrap_or_default();
        let trim_strings = record
            .get("trimStrings")
            .map(as_string_array)
            .unwrap_or_default();
        let markdown_only = record.get("markdownOnly").map(vbool).unwrap_or(false);
        let prompt_only = record.get("promptOnly").map(vbool).unwrap_or(false);
        let affects_canonical = !markdown_only && !prompt_only;
        let affects_display = markdown_only || !prompt_only;
        let affects_prompt = prompt_only || !markdown_only;
        let mut rule_applied = false;

        if affects_canonical {
            let replaced = matcher
                .replace_all(&canonical, replace_string.as_str())
                .into_owned();
            let replaced = apply_trim_strings(replaced, &trim_strings);
            if replaced != canonical {
                canonical = replaced;
                rule_applied = true;
            }
        }

        if affects_display {
            let replaced = matcher
                .replace_all(&display, replace_string.as_str())
                .into_owned();
            let replaced = apply_trim_strings(replaced, &trim_strings);
            if replaced != display {
                display = replaced;
                rule_applied = true;
            }
        }

        if affects_prompt {
            let replaced = matcher
                .replace_all(&prompt, replace_string.as_str())
                .into_owned();
            let replaced = apply_trim_strings(replaced, &trim_strings);
            if replaced != prompt {
                prompt = replaced;
                rule_applied = true;
            }
        }

        if rule_applied {
            any_applied = true;
            let rule_id = record.get("id").map(vstr).unwrap_or_default();
            if !rule_id.is_empty() {
                applied_rule_ids.push(rule_id);
            }
        }
    }

    if !any_applied {
        return AssistantDisplayProjection {
            canonical_text: source.clone(),
            display_text: canonical_base,
            prompt_text: source,
            applied_rule_ids: Vec::new(),
        };
    }

    applied_rule_ids.sort();
    applied_rule_ids.dedup();

    AssistantDisplayProjection {
        canonical_text: canonical,
        display_text: display,
        prompt_text: prompt,
        applied_rule_ids,
    }
}

pub fn project_chat_display_payload(
    payload: &Value,
    preset_draft: Option<&Value>,
    start_index: usize,
    total_messages: Option<usize>,
    target_message_index: Option<usize>,
    persist_canonical: bool,
    source_text_override: Option<&str>,
    reason: &str,
    user_name: &str,
    assistant_name: &str,
    group_name: Option<&str>,
    is_group: bool,
) -> Value {
    let Some(items) = payload.as_array() else {
        return payload.clone();
    };
    if items.is_empty() {
        return payload.clone();
    }

    let preset = preset_draft
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let total_messages = total_messages.unwrap_or_else(|| payload_messages(payload).len());
    let group_name = group_name.unwrap_or_default();
    let mut next_payload = items.clone();

    let target_indexes = if let Some(index) = target_message_index {
        vec![index]
    } else {
        (0..payload_messages(payload).len()).collect::<Vec<_>>()
    };

    for message_index in target_indexes {
        let payload_index = message_index + 1;
        let Some(message) = next_payload
            .get(payload_index)
            .and_then(Value::as_object)
            .cloned()
        else {
            continue;
        };

        if is_user_message(&message) || is_system_message(&message) {
            continue;
        }

        let projection = build_assistant_display_projection(
            &message,
            message_index,
            start_index,
            total_messages,
            &preset,
            user_name,
            assistant_name,
            group_name,
            is_group,
            source_text_override,
            reason,
        );

        let mut next_message = message.clone();
        let mut extra = clone_object(next_message.get("extra"));
        clear_regex_projection_fields(&mut extra);

        let next_canonical_base = if persist_canonical {
            projection.canonical_text.clone()
        } else {
            get_message_content(&message)
        };

        if projection.display_text != next_canonical_base {
            extra.insert(
                "regex_display_text".to_string(),
                json!(projection.display_text),
            );
        }
        if projection.prompt_text != next_canonical_base {
            extra.insert(
                "regex_prompt_text".to_string(),
                json!(projection.prompt_text),
            );
        }
        if !projection.applied_rule_ids.is_empty() {
            extra.insert(
                "regex_applied_rule_ids".to_string(),
                Value::Array(
                    projection
                        .applied_rule_ids
                        .iter()
                        .map(|id| json!(id))
                        .collect(),
                ),
            );
        }

        let final_source = source_text_override
            .map(str::to_string)
            .unwrap_or_else(|| build_message_source_content(&message));
        extra.insert("source_response_text".to_string(), json!(final_source));

        if let Some((render_blocks, has_interactive_code)) =
            build_render_blocks(&projection.display_text)
        {
            extra.insert("render_blocks".to_string(), Value::Array(render_blocks));
            extra.insert(
                "render_has_interactive_code".to_string(),
                json!(has_interactive_code),
            );
        }

        if persist_canonical {
            let (content, reasoning) = split_thinking_content(&projection.canonical_text);
            next_message.insert("mes".to_string(), json!(content));
            match reasoning {
                Some(reasoning) => {
                    extra.insert("reasoning".to_string(), json!(reasoning));
                    extra.insert("reasoning_display_text".to_string(), json!("Reasoning"));
                }
                None => {
                    extra.remove("reasoning");
                    extra.remove("reasoning_display_text");
                }
            }
        }

        next_message.insert("extra".to_string(), Value::Object(extra));
        next_payload[payload_index] = Value::Object(next_message);
    }

    Value::Array(next_payload)
}

fn parse_prompt_entries_from_value(prompts: &Value) -> Vec<PromptEntry> {
    prompts
        .as_array()
        .map(|items| {
            items
                .iter()
                .enumerate()
                .filter_map(|(index, item)| {
                    item.as_object()
                        .map(|record| prompt_entry_from_object(record, format!("prompt_{index}")))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn get_active_prompt_order_entries(order: &Value) -> Vec<PromptOrderEntry> {
    let (lists, _) = normalize_prompt_order_lists(order, PROMPT_MANAGER_DUMMY_ID);
    get_active_prompt_order_list(&lists, PROMPT_MANAGER_DUMMY_ID)
        .map(|list| list.order)
        .unwrap_or_default()
}

fn resolve_group_names(group: Option<&Map<String, Value>>) -> Vec<String> {
    group
        .and_then(|g| g.get("members"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(vstr)
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn resolve_persona_description(settings: &Map<String, Value>) -> String {
    let power_user = clone_object(settings.get("power_user"));
    let direct = if let Some(value) = power_user.get("persona_description") {
        vstr(value)
    } else {
        get_string(settings, "persona_description")
    };
    direct.trim().to_string()
}

fn resolve_injection_depth(prompt: &PromptEntry) -> usize {
    prompt.injection_depth.unwrap_or(4).max(0) as usize
}

fn resolve_injection_order(prompt: &PromptEntry) -> i64 {
    prompt.injection_order.unwrap_or(100)
}

fn is_prompt_triggered(prompt: &PromptEntry, generation_type: &str) -> bool {
    if prompt.injection_trigger.is_empty() {
        return true;
    }
    let normalized = prompt
        .injection_trigger
        .iter()
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if normalized.is_empty() {
        return true;
    }
    normalized.contains(&generation_type.trim().to_lowercase())
}

fn apply_absolute_prompt_injections(
    history: &[OpenAiMessage],
    prompts: &[PromptEntry],
    macro_context: &PromptMacroContext,
    generation_type: &str,
) -> Vec<OpenAiMessage> {
    if prompts.is_empty() {
        return history.to_vec();
    }

    let injection_prompts = prompts
        .iter()
        .filter(|prompt| prompt.injection_position == Some(1))
        .filter(|prompt| is_prompt_triggered(prompt, generation_type))
        .cloned()
        .collect::<Vec<_>>();
    if injection_prompts.is_empty() {
        return history.to_vec();
    }

    let mut reversed = history.to_vec();
    reversed.reverse();
    let max_depth = injection_prompts
        .iter()
        .map(resolve_injection_depth)
        .max()
        .unwrap_or(0);
    let mut inserted = 0usize;

    for depth in 0..=max_depth {
        let depth_prompts = injection_prompts
            .iter()
            .filter(|prompt| resolve_injection_depth(prompt) == depth)
            .cloned()
            .collect::<Vec<_>>();
        if depth_prompts.is_empty() {
            continue;
        }

        let mut orders = depth_prompts
            .iter()
            .map(resolve_injection_order)
            .collect::<Vec<_>>();
        orders.sort_by(|left, right| right.cmp(left));
        orders.dedup();

        let mut injected_messages = Vec::new();
        for order in orders {
            let group = depth_prompts
                .iter()
                .filter(|prompt| resolve_injection_order(prompt) == order)
                .cloned()
                .collect::<Vec<_>>();
            for role in ["system", "user", "assistant"] {
                let mut contents = Vec::new();
                for prompt in &group {
                    if map_prompt_role(prompt.role.as_deref()) != role {
                        continue;
                    }
                    let mut ctx = macro_context.clone();
                    let rendered = apply_prompt_macros(
                        prompt.content.as_deref().unwrap_or_default(),
                        &mut ctx,
                    );
                    let rendered = rendered.trim().to_string();
                    if !rendered.is_empty() {
                        contents.push(rendered);
                    }
                }
                if !contents.is_empty() {
                    injected_messages.push(OpenAiMessage {
                        role: role.to_string(),
                        content: contents.join("\n"),
                        name: None,
                    });
                }
            }
        }

        if !injected_messages.is_empty() {
            let insert_index = (depth + inserted).min(reversed.len());
            reversed.splice(insert_index..insert_index, injected_messages.clone());
            inserted += injected_messages.len();
        }
    }

    reversed.reverse();
    reversed
}

fn parse_example_messages(
    example: &str,
    user_name: &str,
    assistant_name: &str,
) -> Vec<OpenAiMessage> {
    let normalized = example.replace('\r', "");
    let lines = normalized.lines().collect::<Vec<_>>();
    if lines.is_empty() {
        return Vec::new();
    }

    let user_prefix = format!("{user_name}:");
    let assistant_prefix = format!("{assistant_name}:");
    let mut current_started = false;
    let mut current_name = String::new();
    let mut buffer: Vec<String> = Vec::new();
    let mut output = Vec::new();

    let flush = |buffer: &mut Vec<String>,
                 current_started: &mut bool,
                 current_name: &str,
                 output: &mut Vec<OpenAiMessage>| {
        if !*current_started || buffer.is_empty() {
            buffer.clear();
            return;
        }
        let content = buffer.join("\n").trim().to_string();
        if !content.is_empty() {
            output.push(OpenAiMessage {
                role: "system".to_string(),
                content,
                name: if current_name.is_empty() {
                    None
                } else {
                    Some(current_name.to_string())
                },
            });
        }
        buffer.clear();
    };

    for (index, line) in lines.iter().enumerate() {
        if index == 0 && line.to_lowercase().contains("example") {
            continue;
        }
        if line.starts_with(&user_prefix) {
            flush(
                &mut buffer,
                &mut current_started,
                &current_name,
                &mut output,
            );
            current_started = true;
            current_name = "example_user".to_string();
            buffer.push(line[user_prefix.len()..].trim().to_string());
            continue;
        }
        if line.starts_with(&assistant_prefix) {
            flush(
                &mut buffer,
                &mut current_started,
                &current_name,
                &mut output,
            );
            current_started = true;
            current_name = "example_assistant".to_string();
            buffer.push(line[assistant_prefix.len()..].trim().to_string());
            continue;
        }
        buffer.push((*line).to_string());
    }
    flush(
        &mut buffer,
        &mut current_started,
        &current_name,
        &mut output,
    );

    output
}

fn build_dialogue_examples(
    example_text: &str,
    user_name: &str,
    assistant_name: &str,
    new_example_prompt: &str,
) -> Vec<OpenAiMessage> {
    if example_text.trim().is_empty() {
        return Vec::new();
    }
    let block_re = Regex::new(r"(?i)<START>").expect("start block regex");
    let blocks = block_re
        .split(example_text)
        .map(|block| block.trim().to_string())
        .filter(|block| !block.is_empty())
        .collect::<Vec<_>>();
    let sources = if blocks.is_empty() {
        vec![example_text.to_string()]
    } else {
        blocks
    };

    let mut output = Vec::new();
    for block in sources {
        let messages = parse_example_messages(&block, user_name, assistant_name);
        if messages.is_empty() {
            continue;
        }
        if !new_example_prompt.trim().is_empty() {
            output.push(OpenAiMessage {
                role: "system".to_string(),
                content: new_example_prompt.to_string(),
                name: None,
            });
        }
        output.extend(messages);
    }
    output
}

fn build_chat_history_messages(
    messages: &[Map<String, Value>],
    names_behavior: i64,
    user_name: &str,
    is_group: bool,
    history_start_index: usize,
    total_messages: usize,
    preset: &Map<String, Value>,
    assistant_name: &str,
    group_name: &str,
) -> Vec<OpenAiMessage> {
    let mut output: Vec<OpenAiMessage> = Vec::new();
    let mut last_multiplayer_room_round_id: Option<String> = None;
    for (index, message) in messages.iter().enumerate() {
        let role = if is_system_message(message) {
            "system".to_string()
        } else if is_user_message(message) {
            "user".to_string()
        } else {
            "assistant".to_string()
        };

        if role == "user" {
            if let Some(meta) = parse_multiplayer_prompt_meta(message) {
                if meta.pending {
                    continue;
                }

                let content = format_multiplayer_contribution(message, &meta);
                let current_round_id = if meta.room_round_id.is_empty() {
                    None
                } else {
                    Some(meta.room_round_id.clone())
                };

                if let Some(round_id) = current_round_id.as_deref() {
                    if last_multiplayer_room_round_id.as_deref() == Some(round_id) {
                        if let Some(last) = output.last_mut() {
                            last.content = format!("{}\n{}", last.content, content);
                            continue;
                        }
                    }
                }

                last_multiplayer_room_round_id = current_round_id;
                output.push(OpenAiMessage {
                    role,
                    content,
                    name: None,
                });
                continue;
            }
        }

        last_multiplayer_room_round_id = None;
        let mut content = if role == "assistant" {
            resolve_assistant_prompt_text(
                message,
                index,
                history_start_index,
                total_messages,
                preset,
                user_name,
                assistant_name,
                group_name,
                is_group,
            )
        } else {
            get_message_content(message)
        };
        let name = get_message_name(message);

        if role != "system" {
            if names_behavior == 0 && is_group && !name.is_empty() && name != user_name {
                content = format!("{name}: {content}");
            } else if names_behavior == 2 && !name.is_empty() {
                content = format!("{name}: {content}");
            }
        }

        let mut entry = OpenAiMessage {
            role,
            content,
            name: None,
        };
        if names_behavior == 1 && !name.is_empty() {
            entry.name = Some(name);
        }
        output.push(entry);
    }
    output
}

pub fn compose_messages(
    payload: &Value,
    mode: &GenerationMode,
    target_idx: Option<usize>,
    prompts: &Value,
    order: &Value,
    world_info: &str,
    oai: &Map<String, Value>,
    settings: &Map<String, Value>,
    user: &str,
    assistant: &str,
    char_data: &Map<String, Value>,
    group: Option<&Map<String, Value>>,
    multiplayer_participants: &[Value],
    preset: &Map<String, Value>,
    start: usize,
    total: Option<usize>,
    is_group: bool,
    _group_name: &str,
) -> Vec<OpenAiMessage> {
    let power_user = clone_object(settings.get("power_user"));
    let names_behavior = read_number(oai, &["names_behavior"])
        .map(|v| v as i64)
        .unwrap_or(0);

    let timeline_messages = build_timeline_messages(payload, mode, target_idx);
    let prompt_entries = parse_prompt_entries_from_value(prompts);
    let uses_now_player_input = prompt_entries.iter().any(|prompt| {
        prompt
            .content
            .as_deref()
            .unwrap_or_default()
            .to_lowercase()
            .contains("now-player-input")
    });
    let last_user_message = timeline_messages
        .iter()
        .rev()
        .find(|message| is_user_message(message) && !is_system_message(message))
        .map(get_message_content)
        .unwrap_or_default();

    let history_source_messages = timeline_messages;
    let total_messages = total
        .unwrap_or(history_source_messages.len())
        .max(history_source_messages.len());
    let history_start_index =
        start.max(total_messages.saturating_sub(history_source_messages.len()));

    let group_name = group
        .and_then(|g| g.get("name"))
        .map(vstr)
        .unwrap_or_default();
    let group_names = resolve_group_names(group);
    let group_label = group_names.join(", ");

    let mut chat_history_messages = build_chat_history_messages(
        &history_source_messages,
        names_behavior,
        user,
        is_group,
        history_start_index,
        total_messages,
        preset,
        assistant,
        &group_name,
    );

    let last_history = chat_history_messages.last().cloned();
    let send_if_empty = get_string(oai, "send_if_empty");
    if last_history
        .as_ref()
        .map(|message| message.role == "assistant")
        .unwrap_or(false)
        && !send_if_empty.trim().is_empty()
    {
        chat_history_messages.push(OpenAiMessage {
            role: "user".to_string(),
            content: send_if_empty,
            name: None,
        });
    }

    let world_info_formatted = format_world_info(world_info, &get_string(oai, "wi_format"));
    let persona_description = resolve_persona_description(settings);

    let mut format_params = HashMap::new();
    format_params.insert("char".to_string(), assistant.to_string());
    format_params.insert("user".to_string(), user.to_string());
    format_params.insert("scenario".to_string(), get_string(char_data, "scenario"));
    format_params.insert(
        "personality".to_string(),
        get_string(char_data, "personality"),
    );
    format_params.insert(
        "description".to_string(),
        get_string(char_data, "description"),
    );
    format_params.insert("persona".to_string(), persona_description.clone());
    format_params.insert("group".to_string(), group_label.clone());
    format_params.insert(
        "charIfNotGroup".to_string(),
        if group_label.is_empty() {
            assistant.to_string()
        } else {
            String::new()
        },
    );
    format_params.insert("wiBefore".to_string(), world_info_formatted.clone());
    format_params.insert("wiAfter".to_string(), world_info_formatted.clone());

    let scenario_text = {
        let scenario = format_params.get("scenario").cloned().unwrap_or_default();
        let scenario_format = get_string(oai, "scenario_format");
        if !scenario.is_empty() && !scenario_format.trim().is_empty() {
            render_template(&scenario_format, &format_params)
        } else {
            scenario
        }
    };
    let personality_text = {
        let personality = format_params
            .get("personality")
            .cloned()
            .unwrap_or_default();
        let personality_format = get_string(oai, "personality_format");
        if !personality.is_empty() && !personality_format.trim().is_empty() {
            render_template(&personality_format, &format_params)
        } else {
            personality
        }
    };

    let prompt_map = prompt_entries
        .iter()
        .cloned()
        .map(|prompt| (prompt.identifier.clone(), prompt))
        .collect::<HashMap<_, _>>();
    let order_entries = get_active_prompt_order_entries(order);
    let enabled_order = order_entries
        .iter()
        .filter(|entry| entry.enabled)
        .cloned()
        .collect::<Vec<_>>();
    let enabled_identifiers = enabled_order
        .iter()
        .map(|entry| entry.identifier.clone())
        .collect::<std::collections::HashSet<_>>();
    let generation_type = match mode {
        GenerationMode::Continue => "continue",
        GenerationMode::Regenerate => "swipe",
        GenerationMode::Reply => "normal",
    };
    let order_ids = enabled_order
        .iter()
        .map(|entry| entry.identifier.clone())
        .collect::<std::collections::HashSet<_>>();
    let world_info_before_enabled = order_ids.contains("worldInfoBefore");

    let new_example_prompt =
        render_template(&get_string(oai, "new_example_chat_prompt"), &format_params);
    let dialogue_examples = build_dialogue_examples(
        &get_string(char_data, "mes_example"),
        user,
        assistant,
        &new_example_prompt,
    );

    let mut dynamic_prompt_content = HashMap::new();
    dynamic_prompt_content.insert("worldInfoBefore".to_string(), world_info_formatted.clone());
    dynamic_prompt_content.insert(
        "worldInfoAfter".to_string(),
        if world_info_before_enabled {
            String::new()
        } else {
            world_info_formatted.clone()
        },
    );
    dynamic_prompt_content.insert(
        "charDescription".to_string(),
        format_params
            .get("description")
            .cloned()
            .unwrap_or_default(),
    );
    dynamic_prompt_content.insert("charPersonality".to_string(), personality_text.clone());
    dynamic_prompt_content.insert("scenario".to_string(), scenario_text.clone());
    dynamic_prompt_content.insert(
        "personaDescription".to_string(),
        persona_description.clone(),
    );
    dynamic_prompt_content.insert(
        "groupNudge".to_string(),
        if group.is_some() {
            render_template(&get_string(oai, "group_nudge_prompt"), &format_params)
        } else {
            String::new()
        },
    );
    dynamic_prompt_content.insert(
        "impersonate".to_string(),
        render_template(&get_string(oai, "impersonation_prompt"), &format_params),
    );

    if matches!(mode, GenerationMode::Continue) {
        let mut params = format_params.clone();
        params.insert(
            "lastChatMessage".to_string(),
            last_history.map(|msg| msg.content).unwrap_or_default(),
        );
        let continue_nudge = render_template(&get_string(oai, "continue_nudge_prompt"), &params);
        if !continue_nudge.trim().is_empty() {
            dynamic_prompt_content.insert("continueNudge".to_string(), continue_nudge);
        }
    }

    let sysprompt = if oai.get("use_sysprompt").map(vbool).unwrap_or(false) {
        clone_object(power_user.get("sysprompt"))
            .get("content")
            .map(vstr)
            .unwrap_or_default()
            .trim()
            .to_string()
    } else {
        String::new()
    };
    let multiplayer_participant_context =
        build_multiplayer_participant_context_block(multiplayer_participants);

    let mut messages = Vec::new();
    let mut macro_context = PromptMacroContext {
        params: format_params,
        variables: HashMap::new(),
        now_player_input: if uses_now_player_input {
            Some(last_user_message)
        } else {
            None
        },
    };
    let injection_candidates = prompt_entries
        .iter()
        .filter(|prompt| enabled_identifiers.contains(&prompt.identifier))
        .cloned()
        .collect::<Vec<_>>();
    let injected_chat_history = apply_absolute_prompt_injections(
        &chat_history_messages,
        &injection_candidates,
        &macro_context,
        generation_type,
    );

    if !sysprompt.is_empty() {
        let rendered = apply_prompt_macros(&sysprompt, &mut macro_context)
            .trim()
            .to_string();
        if !rendered.is_empty() {
            messages.push(OpenAiMessage {
                role: "system".to_string(),
                content: rendered,
                name: None,
            });
        }
    }

    if !multiplayer_participant_context.is_empty() {
        messages.push(OpenAiMessage {
            role: "system".to_string(),
            content: multiplayer_participant_context,
            name: None,
        });
    }

    for entry in enabled_order {
        let prompt = prompt_map.get(&entry.identifier);
        if prompt.and_then(|prompt| prompt.injection_position) == Some(1) {
            continue;
        }
        if entry.identifier == "chatHistory" {
            messages.extend(injected_chat_history.clone());
            continue;
        }
        if entry.identifier == "dialogueExamples" {
            messages.extend(dialogue_examples.clone());
            continue;
        }

        let override_content = dynamic_prompt_content.get(&entry.identifier).cloned();
        let content = if let Some(override_content) = override_content {
            override_content
        } else if let Some(prompt) = prompt {
            prompt.content.clone().unwrap_or_default()
        } else {
            String::new()
        };
        if content.trim().is_empty() {
            continue;
        }

        let role = prompt
            .map(|prompt| map_prompt_role(prompt.role.as_deref()))
            .unwrap_or_else(|| "system".to_string());
        let rendered = apply_prompt_macros(&content, &mut macro_context)
            .trim()
            .to_string();
        if rendered.is_empty() {
            continue;
        }
        messages.push(OpenAiMessage {
            role,
            content: rendered,
            name: None,
        });
    }

    if !order_ids.contains("chatHistory") {
        messages.extend(injected_chat_history);
    }

    if let Some(group_nudge) = dynamic_prompt_content.get("groupNudge") {
        if !group_nudge.trim().is_empty() && !order_ids.contains("groupNudge") {
            let rendered = apply_prompt_macros(group_nudge, &mut macro_context)
                .trim()
                .to_string();
            if !rendered.is_empty() {
                messages.push(OpenAiMessage {
                    role: "system".to_string(),
                    content: rendered,
                    name: None,
                });
            }
        }
    }

    if let Some(continue_nudge) = dynamic_prompt_content.get("continueNudge") {
        if !continue_nudge.trim().is_empty() && !order_ids.contains("continueNudge") {
            let rendered = apply_prompt_macros(continue_nudge, &mut macro_context)
                .trim()
                .to_string();
            if !rendered.is_empty() {
                messages.push(OpenAiMessage {
                    role: "system".to_string(),
                    content: rendered,
                    name: None,
                });
            }
        }
    }

    let mut finalized = messages;
    if oai
        .get("squash_system_messages")
        .map(vbool)
        .unwrap_or(false)
    {
        let mut squashed: Vec<OpenAiMessage> = Vec::new();
        for message in finalized {
            if let Some(last) = squashed.last_mut() {
                if last.role == "system" && message.role == "system" {
                    last.content = format!("{}\n{}", last.content, message.content)
                        .trim()
                        .to_string();
                    continue;
                }
            }
            squashed.push(message);
        }
        finalized = squashed;
    }

    let user_prompt_bias = clone_object(settings.get("power_user"))
        .get("user_prompt_bias")
        .map(vstr)
        .unwrap_or_default()
        .trim()
        .to_string();
    if !user_prompt_bias.is_empty() {
        let rendered = apply_prompt_macros(&user_prompt_bias, &mut macro_context)
            .trim_end()
            .to_string();
        if !rendered.trim().is_empty() {
            finalized.push(OpenAiMessage {
                role: "assistant".to_string(),
                content: rendered,
                name: None,
            });
        }
    }

    finalized
        .into_iter()
        .filter(|message| !message.content.trim().is_empty())
        .collect()
}

pub fn build_request(
    provider: &Map<String, Value>,
    oai: &Map<String, Value>,
    gen_type: &str,
    user: &str,
    assistant: &str,
    group_members: &[String],
) -> Map<String, Value> {
    let reverse_proxy = get_string(provider, "reverse_proxy").trim().to_string();
    let custom_url = get_string(provider, "custom_url").trim().to_string();
    let proxy_password = get_string(provider, "proxy_password").trim().to_string();
    let custom_endpoint = if !reverse_proxy.is_empty() {
        reverse_proxy.clone()
    } else {
        custom_url.clone()
    };
    let chat_source = if !custom_endpoint.is_empty() {
        "custom".to_string()
    } else {
        let source = get_string(provider, "chat_completion_source")
            .trim()
            .to_string();
        if source.is_empty() {
            "openai".to_string()
        } else {
            source
        }
    };

    let mut request = Map::new();
    request.insert("type".to_string(), json!(gen_type));
    request.insert("chat_completion_source".to_string(), json!(chat_source));
    request.insert("model".to_string(), json!(get_string(provider, "model")));
    request.insert(
        "custom_url".to_string(),
        json!(get_string(provider, "custom_url")),
    );
    request.insert(
        "custom_include_headers".to_string(),
        json!(get_string(provider, "custom_include_headers")),
    );
    request.insert(
        "custom_include_body".to_string(),
        json!(get_string(provider, "custom_include_body")),
    );
    request.insert(
        "custom_exclude_body".to_string(),
        json!(get_string(provider, "custom_exclude_body")),
    );
    if let Some(value) = read_number(oai, &["temp_openai", "temperature"]).and_then(number_to_value)
    {
        request.insert("temperature".to_string(), value);
    }
    if let Some(value) =
        read_number(oai, &["freq_pen_openai", "frequency_penalty"]).and_then(number_to_value)
    {
        request.insert("frequency_penalty".to_string(), value);
    }
    if let Some(value) =
        read_number(oai, &["pres_pen_openai", "presence_penalty"]).and_then(number_to_value)
    {
        request.insert("presence_penalty".to_string(), value);
    }
    if let Some(value) = read_number(oai, &["top_p", "top_p_openai"]).and_then(number_to_value) {
        request.insert("top_p".to_string(), value);
    }
    if let Some(value) = read_number(oai, &["top_k", "top_k_openai"]).and_then(number_to_value) {
        request.insert("top_k".to_string(), value);
    }
    request.insert(
        "enable_web_search".to_string(),
        json!(oai.get("enable_web_search").map(vbool).unwrap_or(false)),
    );
    request.insert(
        "request_images".to_string(),
        json!(oai.get("request_images").map(vbool).unwrap_or(false)),
    );
    request.insert(
        "include_reasoning".to_string(),
        json!(oai.get("show_thoughts").map(vbool).unwrap_or(false)),
    );
    request.insert("user_name".to_string(), json!(user));
    request.insert("char_name".to_string(), json!(assistant));
    request.insert("group_names".to_string(), json!(group_members));

    if custom_url.is_empty() && !reverse_proxy.is_empty() {
        request.insert(
            "reverse_proxy".to_string(),
            json!(get_string(provider, "reverse_proxy")),
        );
    }
    if !proxy_password.is_empty() {
        request.insert(
            "proxy_password".to_string(),
            json!(get_string(provider, "proxy_password")),
        );
    }
    if provider
        .get("bypass_status_check")
        .map(vbool)
        .unwrap_or(false)
    {
        request.insert("bypass_status_check".to_string(), json!(true));
    }
    if !custom_url.is_empty() && reverse_proxy.is_empty() && !proxy_password.is_empty() {
        request.insert(
            "reverse_proxy".to_string(),
            json!(get_string(provider, "custom_url")),
        );
    }
    if let Some(value) =
        read_number(oai, &["openai_max_tokens", "max_tokens"]).and_then(number_to_value)
    {
        request.insert("max_tokens".to_string(), value);
    }
    if let Some(stream_openai) = oai.get("stream_openai") {
        if !matches!(stream_openai, Value::Null) && !vstr(stream_openai).is_empty() {
            request.insert("stream".to_string(), json!(vbool(stream_openai)));
        }
    }

    let reasoning_effort = get_string(oai, "reasoning_effort").trim().to_string();
    if !reasoning_effort.is_empty() {
        request.insert("reasoning_effort".to_string(), json!(reasoning_effort));
    }
    request.insert(
        "verbosity".to_string(),
        json!(normalize_undefined_string(oai.get("verbosity"))),
    );
    request.insert(
        "request_image_resolution".to_string(),
        json!(get_string(oai, "request_image_resolution")),
    );
    request.insert(
        "request_image_aspect_ratio".to_string(),
        json!(get_string(oai, "request_image_aspect_ratio")),
    );

    if let Some(seed) = read_number(oai, &["seed"]) {
        if seed >= 0.0 {
            if let Some(value) = number_to_value(seed) {
                request.insert("seed".to_string(), value);
            }
        }
    }
    if let Some(n) = read_number(oai, &["n"]) {
        if n > 1.0 {
            if let Some(value) = number_to_value(n) {
                request.insert("n".to_string(), value);
            }
        }
    }

    request.insert(
        "custom_prompt_post_processing".to_string(),
        json!(get_string(oai, "custom_prompt_post_processing")),
    );

    if let Some(logit_bias) = oai.get("logit_bias") {
        if logit_bias.is_object() && !obj(logit_bias).is_empty() {
            request.insert("logit_bias".to_string(), logit_bias.clone());
        } else {
            request.insert(
                "logit_bias".to_string(),
                json!(normalize_undefined_string(Some(logit_bias))),
            );
        }
    }

    request
}

pub struct StopStringsResult {
    pub stop: Vec<String>,
    pub error: Option<String>,
}

pub fn resolve_stop_strings(
    settings: &Map<String, Value>,
    user: &str,
    assistant: &str,
    group_members: &[String],
    limit: usize,
) -> StopStringsResult {
    let power_user = clone_object(settings.get("power_user"));
    let raw = power_user.get("custom_stopping_strings");
    if raw.is_none() || matches!(raw, Some(Value::Null)) {
        return StopStringsResult {
            stop: vec![],
            error: None,
        };
    }

    let parsed = match raw.unwrap() {
        Value::String(text) => {
            if text.trim().is_empty() {
                return StopStringsResult {
                    stop: vec![],
                    error: None,
                };
            }

            match serde_json::from_str::<Value>(text) {
                Ok(value) => value,
                Err(error) => {
                    return StopStringsResult {
                        stop: vec![],
                        error: Some(format!("custom_stopping_strings JSON 解析失败：{error}")),
                    };
                }
            }
        }
        value => value.clone(),
    };

    let Some(items) = parsed.as_array() else {
        return StopStringsResult {
            stop: vec![],
            error: Some("custom_stopping_strings 需为 JSON 数组".to_string()),
        };
    };

    let macro_enabled = power_user
        .get("custom_stopping_strings_macro")
        .map(vbool)
        .unwrap_or(false);
    let group_label = group_members
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(", ");

    let mut stop = Vec::new();
    for item in items {
        let mut value = match item {
            Value::String(s) => s.clone(),
            Value::Null => String::new(),
            other => other.to_string(),
        };
        if macro_enabled {
            value = value.replace("{{char}}", assistant);
            value = value.replace("{{user}}", user);
            value = value.replace("{{group}}", &group_label);
            value = value.replace(
                "{{charIfNotGroup}}",
                if group_label.is_empty() {
                    assistant
                } else {
                    ""
                },
            );
        }
        let value = value.trim().to_string();
        if !value.is_empty() {
            stop.push(value);
        }
    }

    if limit > 0 && stop.len() > limit {
        stop.truncate(limit);
    }

    StopStringsResult { stop, error: None }
}

pub struct SanitizeResult {
    pub removed: Vec<String>,
    pub stream_adjusted: bool,
}

pub fn sanitize_request(req: &mut Map<String, Value>) -> SanitizeResult {
    let mut removed = Vec::new();
    let mut stream_adjusted = false;

    let source = req
        .get("chat_completion_source")
        .map(vstr)
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    let model = req
        .get("model")
        .map(vstr)
        .unwrap_or_default()
        .trim()
        .to_string();
    let normalized_model = model.to_lowercase();
    let reverse_proxy = req
        .get("reverse_proxy")
        .map(vstr)
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    let custom_url = req
        .get("custom_url")
        .map(vstr)
        .unwrap_or_default()
        .trim()
        .to_lowercase();

    let remove = |req: &mut Map<String, Value>, removed: &mut Vec<String>, key: &str| {
        if req.remove(key).is_some() {
            removed.push(key.to_string());
        }
    };

    if let Some(raw_n) = req.get("n").cloned() {
        match raw_n {
            Value::String(s) => match s.parse::<f64>() {
                Ok(parsed) if parsed >= 1.0 => {
                    if let Some(value) = number_to_value(parsed) {
                        req.insert("n".to_string(), value);
                    }
                }
                _ => remove(req, &mut removed, "n"),
            },
            Value::Number(_) => {}
            _ => remove(req, &mut removed, "n"),
        }
    }

    let is_moonshot_endpoint = source == "moonshot"
        || reverse_proxy.contains("moonshot")
        || reverse_proxy.contains("kimi")
        || custom_url.contains("moonshot")
        || custom_url.contains("kimi");
    let is_moonshot_k2 = is_moonshot_endpoint && normalized_model.contains("kimi-k2.5");
    if is_moonshot_k2 {
        remove(req, &mut removed, "temperature");
        remove(req, &mut removed, "top_p");
        remove(req, &mut removed, "frequency_penalty");
        remove(req, &mut removed, "presence_penalty");
    }

    let is_openai_vision = ["openai", "openrouter", "custom"].contains(&source.as_str())
        && normalized_model.contains("gpt")
        && normalized_model.contains("vision");
    if is_openai_vision {
        remove(req, &mut removed, "logit_bias");
        remove(req, &mut removed, "stop");
        remove(req, &mut removed, "logprobs");
        remove(req, &mut removed, "top_logprobs");
    }
    if ["openai", "openrouter", "custom"].contains(&source.as_str())
        && normalized_model.contains("gpt-4.5")
    {
        remove(req, &mut removed, "logprobs");
        remove(req, &mut removed, "top_logprobs");
    }

    let is_openai_o1_family = (["openai", "azure_openai", "custom"].contains(&source.as_str())
        && (normalized_model.starts_with("o1")
            || normalized_model.starts_with("o3")
            || normalized_model.starts_with("o4")))
        || (source == "openrouter"
            && (normalized_model.starts_with("openai/o1")
                || normalized_model.starts_with("openai/o3")
                || normalized_model.starts_with("openai/o4")));
    if is_openai_o1_family {
        if let Some(max_tokens) = req.remove("max_tokens") {
            req.insert("max_completion_tokens".to_string(), max_tokens);
            removed.push("max_tokens".to_string());
        }
        remove(req, &mut removed, "temperature");
        remove(req, &mut removed, "top_p");
        remove(req, &mut removed, "frequency_penalty");
        remove(req, &mut removed, "presence_penalty");
        remove(req, &mut removed, "logit_bias");
        remove(req, &mut removed, "stop");
        remove(req, &mut removed, "logprobs");
        remove(req, &mut removed, "top_logprobs");
        if req.get("stream").map(vbool).unwrap_or(false) {
            req.insert("stream".to_string(), json!(false));
            stream_adjusted = true;
        }

        if normalized_model.starts_with("o1") || normalized_model.starts_with("openai/o1") {
            if let Some(Value::Array(messages)) = req.get_mut("messages") {
                for message in messages {
                    if let Some(record) = message.as_object_mut() {
                        if record.get("role").map(vstr).unwrap_or_default() == "system" {
                            record.insert("role".to_string(), json!("user"));
                        }
                    }
                }
            }
            remove(req, &mut removed, "n");
            remove(req, &mut removed, "tools");
            remove(req, &mut removed, "tool_choice");
        }
    }

    let is_openai_gpt5 = ["openai", "azure_openai", "openrouter", "custom"]
        .contains(&source.as_str())
        && normalized_model.contains("gpt-5");
    if is_openai_gpt5 {
        if let Some(max_tokens) = req.remove("max_tokens") {
            req.insert("max_completion_tokens".to_string(), max_tokens);
            removed.push("max_tokens".to_string());
        }
        remove(req, &mut removed, "logprobs");
        remove(req, &mut removed, "top_logprobs");

        if normalized_model.contains("gpt-5-chat-latest") {
            remove(req, &mut removed, "tools");
            remove(req, &mut removed, "tool_choice");
        } else if (normalized_model.contains("gpt-5.1") || normalized_model.contains("gpt-5.2"))
            && !normalized_model.contains("chat-latest")
        {
            remove(req, &mut removed, "frequency_penalty");
            remove(req, &mut removed, "presence_penalty");
            remove(req, &mut removed, "logit_bias");
            remove(req, &mut removed, "stop");
        } else {
            remove(req, &mut removed, "temperature");
            remove(req, &mut removed, "top_p");
            remove(req, &mut removed, "frequency_penalty");
            remove(req, &mut removed, "presence_penalty");
            remove(req, &mut removed, "logit_bias");
            remove(req, &mut removed, "stop");
        }
    }

    SanitizeResult {
        removed,
        stream_adjusted,
    }
}

pub fn extract_logit_bias(oai: &Map<String, Value>) -> Vec<(String, f32)> {
    let selected = get_string(oai, "bias_preset_selected");
    if selected.trim().is_empty() {
        return Vec::new();
    }
    let presets = clone_object(oai.get("bias_presets"));
    let Some(Value::Array(entries)) = presets.get(&selected) else {
        return Vec::new();
    };

    entries
        .iter()
        .filter_map(|entry| {
            let record = entry.as_object()?;
            let text = record.get("text").map(vstr).unwrap_or_default();
            let value = record.get("value").and_then(vnum)? as f32;
            if text.is_empty() {
                None
            } else {
                Some((text, value))
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn generation_prepare_sanitize_prompts_repairs_empty_payload() {
        let result = sanitize_prompts(&Value::Null, &Value::Null, None, None);

        let prompts = result
            .prompts_value
            .as_array()
            .expect("prompts should be array");
        let order = result
            .prompt_order
            .as_array()
            .expect("prompt_order should be array");

        assert!(!prompts.is_empty(), "prompts should be materialized");
        assert!(!order.is_empty(), "prompt order should be materialized");
        assert!(result.repaired, "empty prompt payload should be repaired");
        assert!(prompts.iter().any(|item| {
            item.as_object()
                .and_then(|record| record.get("identifier"))
                .map(vstr)
                .as_deref()
                == Some("main")
        }));
    }

    #[test]
    fn generation_prepare_build_request_maps_openai_fields() {
        let provider = obj(&json!({
            "model": "gpt-4o-mini",
            "chat_completion_source": "openai",
            "reverse_proxy": "",
            "custom_url": "",
            "proxy_password": "",
            "custom_include_headers": "",
            "custom_include_body": "",
            "custom_exclude_body": "",
        }));
        let oai = obj(&json!({
            "temp_openai": 0.7,
            "freq_pen_openai": 0.1,
            "pres_pen_openai": 0.2,
            "top_p": 0.95,
            "stream_openai": true,
            "reasoning_effort": "medium",
            "verbosity": "auto",
            "show_thoughts": true,
            "request_images": true,
            "request_image_resolution": "1024x1024",
            "request_image_aspect_ratio": "1:1",
            "seed": 42,
            "n": 1,
            "custom_prompt_post_processing": "",
            "bias_preset_selected": "Default (none)",
            "bias_presets": { "Default (none)": [] }
        }));

        let request = build_request(
            &provider,
            &oai,
            "normal",
            "User",
            "Assistant",
            &["Alice".to_string(), "Bob".to_string()],
        );

        assert_eq!(
            request.get("model").map(vstr).as_deref(),
            Some("gpt-4o-mini")
        );
        assert_eq!(
            request.get("chat_completion_source").map(vstr).as_deref(),
            Some("openai")
        );
        assert_eq!(request.get("user_name").map(vstr).as_deref(), Some("User"));
        assert_eq!(
            request.get("char_name").map(vstr).as_deref(),
            Some("Assistant")
        );
        assert_eq!(request.get("stream").map(vbool), Some(true));
        assert_eq!(
            request.get("reasoning_effort").map(vstr).as_deref(),
            Some("medium")
        );
        assert_eq!(request.get("request_images").map(vbool), Some(true));
    }

    #[test]
    fn generation_prepare_stop_strings_expand_macros() {
        let settings = obj(&json!({
            "power_user": {
                "custom_stopping_strings": "[\"{{char}}:\", \"{{user}}:\", \"{{group}}\"]",
                "custom_stopping_strings_macro": true
            }
        }));

        let result = resolve_stop_strings(
            &settings,
            "You",
            "Alice",
            &["Alice".to_string(), "Bob".to_string()],
            4,
        );

        assert_eq!(result.error, None);
        assert_eq!(result.stop, vec!["Alice:", "You:", "Alice, Bob"]);
    }

    #[test]
    fn generation_prepare_stop_strings_ignore_blank_json_source() {
        let settings = obj(&json!({
            "power_user": {
                "custom_stopping_strings": "   ",
                "custom_stopping_strings_macro": true
            }
        }));

        let result = resolve_stop_strings(&settings, "You", "Alice", &[], 4);

        assert_eq!(result.error, None);
        assert!(result.stop.is_empty());
    }

    #[test]
    fn generation_prepare_sanitize_request_adjusts_o1_payload() {
        let mut req = obj(&json!({
            "chat_completion_source": "openai",
            "model": "o1-preview",
            "max_tokens": 256,
            "stream": true,
            "temperature": 1,
            "top_p": 1,
            "stop": ["END"],
            "logit_bias": {"42": 1},
            "messages": [{"role": "system", "content": "sys"}],
            "n": 2,
            "tools": [],
            "tool_choice": "auto"
        }));

        let result = sanitize_request(&mut req);

        assert!(result.stream_adjusted);
        assert!(req.get("max_tokens").is_none());
        assert_eq!(req.get("max_completion_tokens").and_then(vnum), Some(256.0));
        assert_eq!(req.get("stream").map(vbool), Some(false));
        assert!(req.get("temperature").is_none());
        assert!(req.get("stop").is_none());
        assert!(req.get("logit_bias").is_none());
        assert!(req.get("n").is_none());
        assert!(req.get("tools").is_none());
        assert!(req.get("tool_choice").is_none());
        let first_role = req
            .get("messages")
            .and_then(Value::as_array)
            .and_then(|messages| messages.first())
            .and_then(Value::as_object)
            .and_then(|record| record.get("role"))
            .map(vstr);
        assert_eq!(first_role.as_deref(), Some("user"));
    }

    #[test]
    fn generation_prepare_extract_logit_bias_uses_selected_preset() {
        let oai = obj(&json!({
            "bias_preset_selected": "Fav",
            "bias_presets": {
                "Fav": [
                    { "text": "hello", "value": 1.5 },
                    { "text": "", "value": 2.0 },
                    { "text": "world", "value": -0.5 }
                ]
            }
        }));

        let entries = extract_logit_bias(&oai);

        assert_eq!(
            entries,
            vec![
                ("hello".to_string(), 1.5_f32),
                ("world".to_string(), -0.5_f32),
            ]
        );
    }

    #[test]
    fn generation_prepare_build_chat_history_messages_aggregates_multiplayer_round() {
        let preset = Map::new();
        let messages = vec![
            json!({
                "name": "Player One",
                "is_user": true,
                "is_system": false,
                "mes": "你好",
                "extra": {
                    "tauritavern_multiplayer": {
                        "kind": "room_player_message",
                        "room_round_id": "round-1",
                        "participant_id": "player-1",
                        "nickname": "玩家1",
                        "pending": false,
                        "contribution_id": "contrib-1",
                        "seq": 1
                    }
                }
            })
            .as_object()
            .cloned()
            .expect("message should be object"),
            json!({
                "name": "Player Two",
                "is_user": true,
                "is_system": false,
                "mes": "你也好！",
                "extra": {
                    "tauritavern_multiplayer": {
                        "kind": "room_player_message",
                        "room_round_id": "round-1",
                        "participant_id": "player-2",
                        "nickname": "玩家2",
                        "pending": false,
                        "contribution_id": "contrib-2",
                        "seq": 2
                    }
                }
            })
            .as_object()
            .cloned()
            .expect("message should be object"),
        ];

        let history = build_chat_history_messages(
            &messages,
            0,
            "User",
            false,
            0,
            messages.len(),
            &preset,
            "Alice",
            "",
        );

        assert_eq!(history.len(), 1);
        assert_eq!(history[0].role, "user");
        assert_eq!(history[0].content, "玩家1：“你好”\n玩家2：“你也好！”");
    }

    #[test]
    fn generation_prepare_build_chat_history_messages_skips_pending_multiplayer_contributions() {
        let preset = Map::new();
        let messages = vec![
            json!({
                "name": "Player One",
                "is_user": true,
                "is_system": false,
                "mes": "稍后发送",
                "extra": {
                    "tauritavern_multiplayer": {
                        "kind": "room_player_message",
                        "room_round_id": "round-1",
                        "participant_id": "player-1",
                        "nickname": "玩家1",
                        "pending": true,
                        "contribution_id": "contrib-1",
                        "seq": 1
                    }
                }
            })
            .as_object()
            .cloned()
            .expect("message should be object"),
            json!({
                "name": "Player Two",
                "is_user": true,
                "is_system": false,
                "mes": "已发送",
                "extra": {
                    "tauritavern_multiplayer": {
                        "kind": "room_player_message",
                        "room_round_id": "round-1",
                        "participant_id": "player-2",
                        "nickname": "玩家2",
                        "pending": false,
                        "contribution_id": "contrib-2",
                        "seq": 2
                    }
                }
            })
            .as_object()
            .cloned()
            .expect("message should be object"),
        ];

        let history = build_chat_history_messages(
            &messages,
            0,
            "User",
            false,
            0,
            messages.len(),
            &preset,
            "Alice",
            "",
        );

        assert_eq!(history.len(), 1);
        assert_eq!(history[0].content, "玩家2：“已发送”");
    }

    #[test]
    fn generation_prepare_validate_multiplayer_round_request_blocks_missing_participants() {
        let payload = json!([
            {
                "chat_metadata": {
                    "tauritavern": {
                        "session": {
                            "mode": "multiplayer"
                        }
                    }
                }
            },
            {
                "name": "玩家1",
                "is_user": true,
                "is_system": false,
                "mes": "你好",
                "extra": {
                    "tauritavern_multiplayer": {
                        "kind": "room_player_message",
                        "room_round_id": "round-1",
                        "participant_id": "player-1",
                        "nickname": "玩家1",
                        "pending": false,
                        "contribution_id": "contrib-1",
                        "seq": 1
                    }
                }
            }
        ]);
        let participants = vec![
            json!({ "participant_id": "player-1", "nickname": "玩家1" }),
            json!({ "participant_id": "player-2", "nickname": "玩家2" }),
        ];

        let issue = validate_multiplayer_round_request(
            &payload,
            &GenerationMode::Reply,
            &participants,
        )
        .expect("missing participant should block generation");

        assert_eq!(issue.code, "multiplayer_round_incomplete");
        assert_eq!(issue.severity, "blocking");
        assert_eq!(issue.details, Some(vec!["玩家2".to_string()]));
    }

    #[test]
    fn generation_prepare_compose_messages_includes_multiplayer_participant_context_block() {
        let payload = json!([
            { "chat_metadata": {} },
            {
                "name": "玩家1",
                "is_user": true,
                "is_system": false,
                "mes": "你好",
                "extra": {
                    "tauritavern_multiplayer": {
                        "kind": "room_player_message",
                        "room_round_id": "round-1",
                        "participant_id": "player-1",
                        "nickname": "玩家1",
                        "pending": false,
                        "contribution_id": "contrib-1",
                        "seq": 1
                    }
                }
            }
        ]);
        let participants = vec![json!({
            "participant_id": "player-1",
            "nickname": "玩家1",
            "character_name": "Alice",
            "character_card": {
                "description": "来自北境的术士",
                "personality": "冷静克制",
                "scenario": "雨夜酒馆",
                "first_mes": "欢迎来到这里。",
                "system_prompt": "保持神秘感",
                "post_history_instructions": "避免脱离设定"
            }
        })];

        let messages = compose_messages(
            &payload,
            &GenerationMode::Reply,
            None,
            &json!([]),
            &json!([]),
            "",
            &Map::new(),
            &Map::new(),
            "User",
            "Assistant",
            &Map::new(),
            None,
            &participants,
            &Map::new(),
            0,
            None,
            false,
            "",
        );

        assert!(messages.iter().any(|message| {
            message.role == "system"
                && message.content.contains("[Multiplayer Participant Context]")
                && message.content.contains("Player nickname: 玩家1")
                && message.content.contains("Role card name: Alice")
                && message.content.contains("Description: 来自北境的术士")
        }));
    }

    #[test]
    fn generation_prepare_project_chat_display_payload_applies_display_and_prompt_fields() {
        let payload = json!([
            { "chat_metadata": {} },
            {
                "name": "Alice",
                "is_user": false,
                "is_system": false,
                "send_date": "1",
                "mes": "Visible body",
                "extra": {
                    "source_response_text": "<thinking>Reasoning block</thinking>Visible body"
                }
            }
        ]);
        let preset = json!({
            "regex_scripts": [
                {
                    "id": "display-rule",
                    "findRegex": "Visible",
                    "replaceString": "Rendered",
                    "trimStrings": [],
                    "placement": [2],
                    "disabled": false,
                    "markdownOnly": true,
                    "promptOnly": false,
                    "runOnEdit": true,
                    "substituteRegex": 0,
                    "minDepth": null,
                    "maxDepth": null
                },
                {
                    "id": "prompt-rule",
                    "findRegex": "Reasoning",
                    "replaceString": "PromptReasoning",
                    "trimStrings": [],
                    "placement": [2],
                    "disabled": false,
                    "markdownOnly": false,
                    "promptOnly": true,
                    "runOnEdit": true,
                    "substituteRegex": 0,
                    "minDepth": null,
                    "maxDepth": null
                }
            ]
        });

        let projected = project_chat_display_payload(
            &payload,
            Some(&preset),
            0,
            Some(1),
            Some(0),
            false,
            None,
            "default",
            "User",
            "Alice",
            None,
            false,
        );

        let message = projected
            .as_array()
            .and_then(|items| items.get(1))
            .and_then(Value::as_object)
            .expect("message should exist");
        let extra = message
            .get("extra")
            .and_then(Value::as_object)
            .expect("extra should exist");

        assert_eq!(
            extra.get("regex_display_text").map(vstr).as_deref(),
            Some("<thinking>Reasoning block</thinking>Rendered body")
        );
        assert_eq!(
            extra.get("regex_prompt_text").map(vstr).as_deref(),
            Some("<thinking>PromptReasoning block</thinking>Visible body")
        );
        assert_eq!(
            extra.get("source_response_text").map(vstr).as_deref(),
            Some("<thinking>Reasoning block</thinking>Visible body")
        );
    }

    #[test]
    fn generation_prepare_project_chat_display_payload_persists_canonical_into_mes_and_reasoning() {
        let payload = json!([
            { "chat_metadata": {} },
            {
                "name": "Alice",
                "is_user": false,
                "is_system": false,
                "send_date": "1",
                "mes": "Visible body",
                "extra": {
                    "source_response_text": "<thinking>Hidden reasoning</thinking>Visible body"
                }
            }
        ]);
        let preset = json!({
            "regex_scripts": [
                {
                    "id": "canonical-rule",
                    "findRegex": "Visible",
                    "replaceString": "Projected",
                    "trimStrings": [],
                    "placement": [2],
                    "disabled": false,
                    "markdownOnly": false,
                    "promptOnly": false,
                    "runOnEdit": true,
                    "substituteRegex": 0,
                    "minDepth": null,
                    "maxDepth": null
                }
            ]
        });

        let projected = project_chat_display_payload(
            &payload,
            Some(&preset),
            0,
            Some(1),
            Some(0),
            true,
            None,
            "default",
            "User",
            "Alice",
            None,
            false,
        );

        let message = projected
            .as_array()
            .and_then(|items| items.get(1))
            .and_then(Value::as_object)
            .expect("message should exist");
        let extra = message
            .get("extra")
            .and_then(Value::as_object)
            .expect("extra should exist");

        assert_eq!(message.get("mes").map(vstr).as_deref(), Some("Projected body"));
        assert_eq!(extra.get("reasoning").map(vstr).as_deref(), Some("Hidden reasoning"));
        assert_eq!(
            extra.get("reasoning_display_text").map(vstr).as_deref(),
            Some("Reasoning")
        );
        assert_eq!(
            extra.get("source_response_text").map(vstr).as_deref(),
            Some("<thinking>Hidden reasoning</thinking>Visible body")
        );
    }
}
