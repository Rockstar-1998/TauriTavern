use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager};

use crate::application::services::avatar_service::AvatarService;
use crate::application::services::background_service::BackgroundService;
use crate::application::services::character_service::CharacterService;
use crate::application::services::chat_completion_service::ChatCompletionService;
use crate::application::services::chat_service::ChatService;
use crate::application::services::content_service::ContentService;
use crate::application::services::display_projection_service::DisplayProjectionService;
use crate::application::services::extension_service::ExtensionService;
use crate::application::services::generation_binding_service::GenerationBindingService;
use crate::application::services::generation_prepare_service::GenerationPrepareService;
use crate::application::services::generation_trace_service::GenerationTraceService;
use crate::application::services::group_service::GroupService;
use crate::application::services::lan_sync_service::LanSyncService;
use crate::application::services::multiplayer_room_service::MultiplayerRoomService;
use crate::application::services::player_persona_service::PlayerPersonaService;
use crate::application::services::preset_service::PresetService;
use crate::application::services::quick_reply_service::QuickReplyService;
use crate::application::services::renderer_service::RendererService;
use crate::application::services::secret_service::SecretService;
use crate::application::services::settings_service::SettingsService;
use crate::application::services::theme_service::ThemeService;
use crate::application::services::tokenization_service::TokenizationService;
use crate::application::services::update_service::UpdateService;
use crate::application::services::user_directory_service::UserDirectoryService;
use crate::application::services::user_service::UserService;
use crate::application::services::workbench_stats_service::WorkbenchStatsService;
use crate::application::services::world_info_service::WorldInfoService;
use crate::domain::errors::DomainError;
use crate::infrastructure::paths::RuntimePaths;

mod bootstrap;

pub struct AppState {
    pub character_service: Arc<CharacterService>,
    pub chat_service: Arc<ChatService>,
    pub user_service: Arc<UserService>,
    pub settings_service: Arc<SettingsService>,
    pub user_directory_service: Arc<UserDirectoryService>,
    pub workbench_stats_service: Arc<WorkbenchStatsService>,
    pub secret_service: Arc<SecretService>,
    pub content_service: Arc<ContentService>,
    pub display_projection_service: Arc<DisplayProjectionService>,
    pub extension_service: Arc<ExtensionService>,
    pub generation_binding_service: Arc<GenerationBindingService>,
    pub generation_prepare_service: Arc<GenerationPrepareService>,
    pub generation_trace_service: Arc<GenerationTraceService>,
    pub avatar_service: Arc<AvatarService>,
    pub group_service: Arc<GroupService>,
    pub background_service: Arc<BackgroundService>,
    pub theme_service: Arc<ThemeService>,
    pub preset_service: Arc<PresetService>,
    pub quick_reply_service: Arc<QuickReplyService>,
    pub renderer_service: Arc<RendererService>,
    pub chat_completion_service: Arc<ChatCompletionService>,
    pub tokenization_service: Arc<TokenizationService>,
    pub world_info_service: Arc<WorldInfoService>,
    pub lan_sync_service: Arc<LanSyncService>,
    pub multiplayer_room_service: Arc<MultiplayerRoomService>,
    pub player_persona_service: Arc<PlayerPersonaService>,
    pub update_service: Arc<UpdateService>,
}

#[derive(Default)]
pub struct AppStartupState {
    ready: AtomicBool,
    error: Mutex<Option<String>>,
}

impl AppStartupState {
    pub fn mark_ready(&self) {
        self.ready.store(true, Ordering::Release);
        if let Ok(mut error) = self.error.lock() {
            *error = None;
        }
    }

    pub fn mark_error(&self, message: String) {
        self.ready.store(false, Ordering::Release);
        if let Ok(mut error) = self.error.lock() {
            *error = Some(message);
        }
    }

    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::Acquire)
    }

    pub fn error_message(&self) -> Option<String> {
        self.error.lock().ok().and_then(|error| error.clone())
    }
}

impl AppState {
    pub async fn new(
        app_handle: AppHandle,
        runtime_paths: RuntimePaths,
    ) -> Result<Self, DomainError> {
        tracing::info!(
            "Initializing application in {:?} mode with data root: {:?}",
            runtime_paths.mode,
            runtime_paths.data_root
        );

        let data_directory = bootstrap::initialize_data_directory(&runtime_paths.data_root).await?;
        let services = bootstrap::build_services(&app_handle, &data_directory)?;

        tracing::info!("Application initialized successfully");

        Ok(Self {
            character_service: services.character_service,
            chat_service: services.chat_service,
            user_service: services.user_service,
            settings_service: services.settings_service,
            user_directory_service: services.user_directory_service,
            workbench_stats_service: services.workbench_stats_service,
            secret_service: services.secret_service,
            content_service: services.content_service,
            display_projection_service: services.display_projection_service,
            extension_service: services.extension_service,
            generation_binding_service: services.generation_binding_service,
            generation_prepare_service: services.generation_prepare_service,
            generation_trace_service: services.generation_trace_service,
            avatar_service: services.avatar_service,
            group_service: services.group_service,
            background_service: services.background_service,
            theme_service: services.theme_service,
            preset_service: services.preset_service,
            quick_reply_service: services.quick_reply_service,
            renderer_service: services.renderer_service,
            chat_completion_service: services.chat_completion_service,
            tokenization_service: services.tokenization_service,
            world_info_service: services.world_info_service,
            lan_sync_service: services.lan_sync_service,
            multiplayer_room_service: services.multiplayer_room_service,
            player_persona_service: services.player_persona_service,
            update_service: services.update_service,
        })
    }
}

pub fn spawn_initialization(app_handle: AppHandle, runtime_paths: RuntimePaths) {
    tauri::async_runtime::spawn(async move {
        let startup_state = app_handle.state::<Arc<AppStartupState>>().inner().clone();

        match AppState::new(app_handle.clone(), runtime_paths).await {
            Ok(state) => {
                app_handle.manage(Arc::new(state));

                startup_state.mark_ready();

                match app_handle.emit("app-ready", ()) {
                    Ok(_) => tracing::debug!("Application is ready"),
                    Err(error) => tracing::error!("Failed to emit app-ready event: {}", error),
                }

                let content_service = app_handle.state::<Arc<AppState>>().content_service.clone();
                tauri::async_runtime::spawn(async move {
                    match content_service
                        .initialize_default_content("default-user")
                        .await
                    {
                        Ok(_) => tracing::debug!("Successfully initialized default content"),
                        Err(error) => {
                            tracing::warn!("Failed to initialize default content: {}", error)
                        }
                    }
                });
            }
            Err(error) => {
                tracing::error!("Failed to initialize application state: {}", error);

                startup_state.mark_error(error.to_string());

                match app_handle.emit("app-error", error.to_string()) {
                    Ok(_) => {}
                    Err(emit_error) => {
                        tracing::error!("Failed to emit app-error event: {}", emit_error);
                    }
                }
            }
        }
    });
}
