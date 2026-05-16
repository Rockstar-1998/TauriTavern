use serde_json::Value;
use tauri::State;

use crate::app::AppState;
use crate::infrastructure::logging::logger;
use crate::presentation::errors::CommandError;

#[tauri::command]
pub async fn log_frontend_event(
    _app_state: State<'_, std::sync::Arc<AppState>>,
    message: String,
    detail: Option<Value>,
) -> Result<(), CommandError> {
    if message.trim().is_empty() {
        return Ok(());
    }

    if let Some(detail) = detail {
        let detail_text =
            serde_json::to_string(&detail).unwrap_or_else(|_| "<unserializable>".to_string());
        logger::info(&format!("[frontend] {} {}", message.trim(), detail_text));
        return Ok(());
    }

    logger::info(&format!("[frontend] {}", message.trim()));
    Ok(())
}
