mod app;
mod application;
mod domain;
mod infrastructure;
mod presentation;

use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use app::{AppStartupState, spawn_initialization};
use infrastructure::logging::logger;
use infrastructure::paths::resolve_runtime_paths;
use presentation::commands::registry::invoke_handler;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub async fn run() {
    let show_main_window_once = Arc::new(AtomicBool::new(false));

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .on_page_load({
            let show_main_window_once = show_main_window_once.clone();
            move |window, _payload| {
                if window.label() != "main" {
                    return;
                }

                if show_main_window_once.swap(true, Ordering::AcqRel) {
                    return;
                }

                #[cfg(not(mobile))]
                {
                    if let Err(error) = window.show() {
                        show_main_window_once.store(false, Ordering::Release);
                        tracing::error!("Failed to show main window after page load: {}", error);
                    }
                }
            }
        });

    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());

    builder
        .setup(move |app| {
            let app_handle = app.handle().clone();
            logger::bind_app_handle(app_handle.clone());
            app_handle.manage(Arc::new(AppStartupState::default()));

            let runtime_paths = resolve_runtime_paths(&app_handle)?;

            if let Err(error) = logger::init_logger(&runtime_paths.log_root) {
                eprintln!("Failed to initialize logger: {}", error);
            }

            tracing::debug!("Starting TauriTavern application");

            if let Err(error) = app_handle
                .asset_protocol_scope()
                .allow_directory(&runtime_paths.data_root, true)
            {
                tracing::warn!(
                    "Failed to extend asset protocol scope for {:?}: {}",
                    runtime_paths.data_root,
                    error
                );
            }
            spawn_initialization(app_handle.clone(), runtime_paths.clone());
            Ok(())
        })
        .invoke_handler(invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
