use std::sync::Arc;

use crate::domain::errors::DomainError;
use crate::domain::models::renderer::RendererManifest;
use crate::domain::repositories::renderer_repository::RendererRepository;
use crate::infrastructure::logging::logger;

pub struct RendererService {
    renderer_repository: Arc<dyn RendererRepository>,
}

impl RendererService {
    pub fn new(renderer_repository: Arc<dyn RendererRepository>) -> Self {
        Self {
            renderer_repository,
        }
    }

    pub async fn list_renderers(&self) -> Result<Vec<RendererManifest>, DomainError> {
        logger::debug("Listing renderer packages");
        self.renderer_repository.list_renderers().await
    }

    pub async fn import_renderer_package(
        &self,
        file_name: &str,
        data: &[u8],
    ) -> Result<RendererManifest, DomainError> {
        logger::debug(&format!("Importing renderer package: {}", file_name));
        self.renderer_repository
            .import_renderer_package(file_name, data)
            .await
    }

    pub async fn delete_renderer_package(&self, renderer_id: &str) -> Result<bool, DomainError> {
        logger::debug(&format!("Deleting renderer package: {}", renderer_id));
        self.renderer_repository
            .delete_renderer_package(renderer_id)
            .await
    }
}
