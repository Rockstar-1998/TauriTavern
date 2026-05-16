use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tokio::fs;
use uuid::Uuid;
use zip::ZipArchive;

use crate::domain::errors::DomainError;
use crate::domain::models::renderer::{RendererManifest, RendererMode};
use crate::domain::repositories::renderer_repository::RendererRepository;
use crate::infrastructure::persistence::file_system::{read_json_file, write_json_file};

const INDEX_FILE_NAME: &str = "index.json";
const MANIFEST_FILE_NAME: &str = "renderer.json";
const MAX_PACKAGE_FILES: usize = 512;
const MAX_UNCOMPRESSED_BYTES: u64 = 32 * 1024 * 1024;
const CURRENT_APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const IFRAME_ACTION_WHITELIST: &[&str] = &[
    "send",
    "edit",
    "delete",
    "withdraw",
    "regenerate",
    "continue",
    "load_more_before",
    "stop",
    "open_session_menu",
];

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct RendererIndex {
    packages: Vec<RendererManifest>,
}

struct PreparedRendererInstall {
    manifest: RendererManifest,
    temp_dir: PathBuf,
    install_dir: PathBuf,
}

pub struct FileRendererRepository {
    root: PathBuf,
    index_path: PathBuf,
}

impl FileRendererRepository {
    pub fn new(root: PathBuf) -> Self {
        Self {
            index_path: root.join(INDEX_FILE_NAME),
            root,
        }
    }

    async fn ensure_directory_exists(&self) -> Result<(), DomainError> {
        fs::create_dir_all(&self.root).await.map_err(|error| {
            DomainError::InternalError(format!("Failed to create renderer root: {}", error))
        })
    }

    async fn read_index(&self) -> Result<RendererIndex, DomainError> {
        self.ensure_directory_exists().await?;
        if !self.index_path.exists() {
            return Ok(RendererIndex::default());
        }

        read_json_file(&self.index_path).await
    }

    async fn write_index(&self, index: &RendererIndex) -> Result<(), DomainError> {
        self.ensure_directory_exists().await?;
        write_json_file(&self.index_path, index).await
    }

    fn sanitize_relative_path(path: &str) -> Result<PathBuf, DomainError> {
        let mut safe = PathBuf::new();

        for component in Path::new(path).components() {
            match component {
                Component::Normal(value) => safe.push(value),
                Component::CurDir => continue,
                _ => {
                    return Err(DomainError::InvalidData(format!(
                        "Renderer package contains unsafe path: {}",
                        path
                    )));
                }
            }
        }

        if safe.as_os_str().is_empty() {
            return Err(DomainError::InvalidData(
                "Renderer package contains an empty path".into(),
            ));
        }

        Ok(safe)
    }

    fn is_valid_renderer_id(value: &str) -> bool {
        !value.is_empty()
            && value.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            })
    }

    fn compare_versions(left: &str, right: &str) -> std::cmp::Ordering {
        let left_parts = left
            .split('.')
            .map(|part| part.parse::<u64>().unwrap_or(0))
            .collect::<Vec<_>>();
        let right_parts = right
            .split('.')
            .map(|part| part.parse::<u64>().unwrap_or(0))
            .collect::<Vec<_>>();
        let max = left_parts.len().max(right_parts.len());

        for index in 0..max {
            let left_value = *left_parts.get(index).unwrap_or(&0);
            let right_value = *right_parts.get(index).unwrap_or(&0);
            match left_value.cmp(&right_value) {
                std::cmp::Ordering::Equal => continue,
                ordering => return ordering,
            }
        }

        std::cmp::Ordering::Equal
    }

    fn finalize_manifest_paths(
        mut manifest: RendererManifest,
        install_dir: &Path,
    ) -> RendererManifest {
        manifest.root_path = install_dir.to_string_lossy().to_string();

        if !manifest.entry.is_empty() {
            manifest.entry_asset_path = install_dir
                .join(&manifest.entry)
                .to_string_lossy()
                .to_string();
        }

        if !manifest.stylesheet.is_empty() {
            manifest.stylesheet_asset_path = install_dir
                .join(&manifest.stylesheet)
                .to_string_lossy()
                .to_string();
        }

        manifest
    }

    fn validate_manifest(manifest: &RendererManifest) -> Result<(), DomainError> {
        if !Self::is_valid_renderer_id(&manifest.id) {
            return Err(DomainError::InvalidData(
                "Renderer id must contain only ASCII letters, digits, '-' or '_'".into(),
            ));
        }

        if manifest.name.trim().is_empty() || manifest.version.trim().is_empty() {
            return Err(DomainError::InvalidData(
                "Renderer manifest is missing name or version".into(),
            ));
        }

        if !manifest.min_app_version.trim().is_empty()
            && Self::compare_versions(CURRENT_APP_VERSION, &manifest.min_app_version)
                == std::cmp::Ordering::Less
        {
            return Err(DomainError::InvalidData(format!(
                "Renderer requires app version {} or newer",
                manifest.min_app_version
            )));
        }

        for target in &manifest.targets {
            if target != "desktop" && target != "android" {
                return Err(DomainError::InvalidData(format!(
                    "Unsupported renderer target: {}",
                    target
                )));
            }
        }

        if manifest.mode == RendererMode::IframeDevV1 {
            if manifest.entry.trim().is_empty() {
                return Err(DomainError::InvalidData(
                    "iframe-dev-v1 renderer manifest must declare entry".into(),
                ));
            }

            for capability in &manifest.capabilities {
                if !IFRAME_ACTION_WHITELIST.contains(&capability.as_str()) {
                    return Err(DomainError::InvalidData(format!(
                        "Unsupported iframe renderer capability: {}",
                        capability
                    )));
                }
            }
        }

        Ok(())
    }

    fn extract_archive(data: &[u8], temp_dir: &Path) -> Result<Vec<u8>, DomainError> {
        let mut archive = ZipArchive::new(Cursor::new(data)).map_err(|error| {
            DomainError::InvalidData(format!("Invalid renderer zip: {}", error))
        })?;
        let mut manifest_bytes = Vec::new();
        let mut file_count = 0usize;
        let mut total_uncompressed = 0u64;

        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(|error| {
                DomainError::InvalidData(format!("Invalid renderer zip entry: {}", error))
            })?;
            file_count += 1;
            if file_count > MAX_PACKAGE_FILES {
                return Err(DomainError::InvalidData(
                    "Renderer package contains too many files".into(),
                ));
            }

            let safe_path = Self::sanitize_relative_path(entry.name())?;
            let output_path = temp_dir.join(&safe_path);

            if entry.is_dir() {
                std::fs::create_dir_all(&output_path).map_err(|error| {
                    DomainError::InternalError(format!(
                        "Failed to create renderer package directory: {}",
                        error
                    ))
                })?;
                continue;
            }

            total_uncompressed = total_uncompressed.saturating_add(entry.size());
            if total_uncompressed > MAX_UNCOMPRESSED_BYTES {
                return Err(DomainError::InvalidData(
                    "Renderer package exceeds the maximum unpacked size".into(),
                ));
            }

            if let Some(parent) = output_path.parent() {
                std::fs::create_dir_all(parent).map_err(|error| {
                    DomainError::InternalError(format!(
                        "Failed to create renderer package directory: {}",
                        error
                    ))
                })?;
            }

            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes).map_err(|error| {
                DomainError::InternalError(format!(
                    "Failed to read renderer package file {}: {}",
                    entry.name(),
                    error
                ))
            })?;
            std::fs::write(&output_path, &bytes).map_err(|error| {
                DomainError::InternalError(format!(
                    "Failed to extract renderer package file {}: {}",
                    output_path.display(),
                    error
                ))
            })?;

            if safe_path == PathBuf::from(MANIFEST_FILE_NAME) {
                manifest_bytes = bytes;
            }
        }

        if manifest_bytes.is_empty() {
            return Err(DomainError::InvalidData(
                "Renderer package is missing renderer.json".into(),
            ));
        }

        Ok(manifest_bytes)
    }

    fn prepare_install(
        root: PathBuf,
        file_name: String,
        data: Vec<u8>,
    ) -> Result<PreparedRendererInstall, DomainError> {
        if data.is_empty() {
            return Err(DomainError::InvalidData(format!(
                "Renderer package {} is empty",
                file_name
            )));
        }

        let temp_dir = root.join(format!(".tmp-renderer-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).map_err(|error| {
            DomainError::InternalError(format!(
                "Failed to create renderer temp directory: {}",
                error
            ))
        })?;

        let manifest_bytes = match Self::extract_archive(&data, &temp_dir) {
            Ok(bytes) => bytes,
            Err(error) => {
                let _ = std::fs::remove_dir_all(&temp_dir);
                return Err(error);
            }
        };

        let manifest: RendererManifest = match serde_json::from_slice(&manifest_bytes) {
            Ok(manifest) => manifest,
            Err(error) => {
                let _ = std::fs::remove_dir_all(&temp_dir);
                return Err(DomainError::InvalidData(format!(
                    "Invalid renderer manifest: {}",
                    error
                )));
            }
        };
        Self::validate_manifest(&manifest)?;

        if !manifest.entry.is_empty() {
            Self::sanitize_relative_path(&manifest.entry)?;
        }
        if !manifest.stylesheet.is_empty() {
            Self::sanitize_relative_path(&manifest.stylesheet)?;
        }

        if manifest.mode == RendererMode::IframeDevV1 && !temp_dir.join(&manifest.entry).exists() {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Err(DomainError::InvalidData(
                "Renderer entry file does not exist in package".into(),
            ));
        }

        if !manifest.stylesheet.is_empty() && !temp_dir.join(&manifest.stylesheet).exists() {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Err(DomainError::InvalidData(
                "Renderer stylesheet file does not exist in package".into(),
            ));
        }

        let install_dir = root.join(&manifest.id).join(&manifest.version);

        Ok(PreparedRendererInstall {
            manifest,
            temp_dir,
            install_dir,
        })
    }
}

#[async_trait]
impl RendererRepository for FileRendererRepository {
    async fn list_renderers(&self) -> Result<Vec<RendererManifest>, DomainError> {
        let index = self.read_index().await?;
        Ok(index
            .packages
            .into_iter()
            .filter(|manifest| {
                !manifest.root_path.is_empty() && Path::new(&manifest.root_path).exists()
            })
            .collect())
    }

    async fn import_renderer_package(
        &self,
        file_name: &str,
        data: &[u8],
    ) -> Result<RendererManifest, DomainError> {
        self.ensure_directory_exists().await?;
        let prepared = tokio::task::spawn_blocking({
            let root = self.root.clone();
            let file_name = file_name.to_string();
            let data = data.to_vec();
            move || Self::prepare_install(root, file_name, data)
        })
        .await
        .map_err(|error| {
            DomainError::InternalError(format!("Renderer import task failed: {}", error))
        })??;

        let renderer_root = prepared
            .install_dir
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| {
                DomainError::InternalError("Renderer install directory is invalid".into())
            })?;

        if renderer_root.exists() {
            fs::remove_dir_all(&renderer_root).await.map_err(|error| {
                DomainError::InternalError(format!(
                    "Failed to replace existing renderer package: {}",
                    error
                ))
            })?;
        }

        if let Some(parent) = renderer_root.parent() {
            fs::create_dir_all(parent).await.map_err(|error| {
                DomainError::InternalError(format!(
                    "Failed to create renderer install parent directory: {}",
                    error
                ))
            })?;
        }

        fs::create_dir_all(&renderer_root).await.map_err(|error| {
            DomainError::InternalError(format!("Failed to create renderer root: {}", error))
        })?;

        fs::rename(&prepared.temp_dir, &prepared.install_dir)
            .await
            .map_err(|error| {
                DomainError::InternalError(format!(
                    "Failed to finalize renderer install: {}",
                    error
                ))
            })?;

        let manifest = Self::finalize_manifest_paths(prepared.manifest, &prepared.install_dir);
        let mut index = self.read_index().await?;
        index.packages.retain(|item| item.id != manifest.id);
        index.packages.push(manifest.clone());
        index.packages.sort_by(|left, right| left.id.cmp(&right.id));
        self.write_index(&index).await?;

        Ok(manifest)
    }

    async fn delete_renderer_package(&self, renderer_id: &str) -> Result<bool, DomainError> {
        let mut index = self.read_index().await?;
        let removed_from_index = index
            .packages
            .iter()
            .any(|manifest| manifest.id == renderer_id);
        let package_root = self.root.join(renderer_id);
        let existed_on_disk = package_root.exists();

        if existed_on_disk {
            fs::remove_dir_all(&package_root).await.map_err(|error| {
                DomainError::InternalError(format!("Failed to delete renderer package: {}", error))
            })?;
        }

        index.packages.retain(|manifest| manifest.id != renderer_id);
        if removed_from_index {
            self.write_index(&index).await?;
        }

        Ok(removed_from_index || existed_on_disk)
    }
}

#[cfg(test)]
mod tests {
    use super::FileRendererRepository;
    use crate::domain::repositories::renderer_repository::RendererRepository;
    use std::env;
    use std::io::{Cursor, Write};
    use std::path::PathBuf;
    use uuid::Uuid;
    use zip::ZipWriter;
    use zip::write::SimpleFileOptions;

    fn temp_root() -> PathBuf {
        env::temp_dir().join(format!("tauritavern-renderer-repo-{}", Uuid::new_v4()))
    }

    fn build_zip(entries: &[(&str, &str)]) -> Vec<u8> {
        let cursor = Cursor::new(Vec::new());
        let mut writer = ZipWriter::new(cursor);
        let options = SimpleFileOptions::default();

        for (path, contents) in entries {
            writer.start_file(path, options).expect("start file");
            writer
                .write_all(contents.as_bytes())
                .expect("write file contents");
        }

        writer.finish().expect("finish zip").into_inner()
    }

    #[tokio::test]
    async fn imports_renderer_package_and_updates_index() {
        let root = temp_root();
        let repository = FileRendererRepository::new(root.clone());
        let bytes = build_zip(&[(
            "renderer.json",
            r#"{
              "id": "renderer_demo",
              "name": "Renderer Demo",
              "version": "1.0.0",
              "mode": "host-v1",
              "targets": ["desktop"]
            }"#,
        )]);

        let manifest = repository
            .import_renderer_package("renderer-demo.zip", &bytes)
            .await
            .expect("import renderer package");

        assert_eq!(manifest.id, "renderer_demo");
        assert!(PathBuf::from(&manifest.root_path).exists());

        let listed = repository
            .list_renderers()
            .await
            .expect("list renderer packages");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "renderer_demo");

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn rejects_zip_path_traversal() {
        let root = temp_root();
        let repository = FileRendererRepository::new(root.clone());
        let bytes = build_zip(&[
            (
                "renderer.json",
                r#"{
                  "id": "renderer_demo",
                  "name": "Renderer Demo",
                  "version": "1.0.0",
                  "mode": "host-v1",
                  "targets": ["desktop"]
                }"#,
            ),
            ("../escape.js", "console.log('escape')"),
        ]);

        let error = repository
            .import_renderer_package("renderer-demo.zip", &bytes)
            .await
            .expect_err("path traversal should be rejected");

        assert!(error.to_string().contains("unsafe path"));

        let _ = tokio::fs::remove_dir_all(root).await;
    }
}
