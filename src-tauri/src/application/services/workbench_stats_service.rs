use std::path::PathBuf;

use serde_json::{Map, Value};
use tokio::fs;

use crate::application::errors::ApplicationError;

pub struct WorkbenchStatsService {
    path: PathBuf,
}

impl WorkbenchStatsService {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub async fn get_stats(&self) -> Result<Value, ApplicationError> {
        match fs::read_to_string(&self.path).await {
            Ok(content) => {
                let parsed: Value = serde_json::from_str(&content).map_err(|error| {
                    ApplicationError::InternalError(format!(
                        "Failed to parse workbench stats: {}",
                        error
                    ))
                })?;

                if !parsed.is_object() {
                    return Err(ApplicationError::InternalError(
                        "Workbench stats payload is not an object".to_string(),
                    ));
                }

                Ok(parsed)
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(Value::Object(Map::new()))
            }
            Err(error) => Err(ApplicationError::InternalError(format!(
                "Failed to read workbench stats: {}",
                error
            ))),
        }
    }

    pub async fn update_stats(&self, value: Value) -> Result<Value, ApplicationError> {
        if !value.is_object() {
            return Err(ApplicationError::ValidationError(
                "Workbench stats payload must be an object".to_string(),
            ));
        }

        self.write_stats(&value).await?;
        Ok(value)
    }

    pub async fn recreate_stats(&self) -> Result<Value, ApplicationError> {
        let value = Value::Object(Map::new());
        self.write_stats(&value).await?;
        Ok(value)
    }

    async fn write_stats(&self, value: &Value) -> Result<(), ApplicationError> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).await.map_err(|error| {
                ApplicationError::InternalError(format!(
                    "Failed to create workbench stats directory: {}",
                    error
                ))
            })?;
        }

        let serialized = serde_json::to_vec_pretty(value).map_err(|error| {
            ApplicationError::InternalError(format!(
                "Failed to serialize workbench stats: {}",
                error
            ))
        })?;

        fs::write(&self.path, serialized).await.map_err(|error| {
            ApplicationError::InternalError(format!("Failed to save workbench stats: {}", error))
        })
    }
}
