use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RendererMode {
    HostV1,
    IframeDevV1,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RendererManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub mode: RendererMode,
    #[serde(default)]
    pub targets: Vec<String>,
    #[serde(default)]
    pub min_app_version: String,
    #[serde(default)]
    pub root_path: String,
    #[serde(default)]
    pub entry: String,
    #[serde(default)]
    pub entry_asset_path: String,
    #[serde(default)]
    pub stylesheet: String,
    #[serde(default)]
    pub stylesheet_asset_path: String,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub iframe: Option<serde_json::Value>,
    #[serde(default, flatten)]
    pub additional: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportRendererPackageDto {
    pub file_name: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteRendererPackageResult {
    pub ok: bool,
}
