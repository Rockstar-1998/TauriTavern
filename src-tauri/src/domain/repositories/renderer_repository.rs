use async_trait::async_trait;

use crate::domain::errors::DomainError;
use crate::domain::models::renderer::RendererManifest;

#[async_trait]
pub trait RendererRepository: Send + Sync {
    async fn list_renderers(&self) -> Result<Vec<RendererManifest>, DomainError>;

    async fn import_renderer_package(
        &self,
        file_name: &str,
        data: &[u8],
    ) -> Result<RendererManifest, DomainError>;

    async fn delete_renderer_package(&self, renderer_id: &str) -> Result<bool, DomainError>;
}
