---
name: frontend-backend-compat-guard
description: Enforce TauriTavern's runtime boundary and performance policy. Use for any task in this repo that changes frontend behavior, backend services, persistence, DTOs, runtime architecture, SillyTavern compatibility, or performance-sensitive code paths. Keep the frontend render-only, move all computation and storage to the backend, and choose the highest-performance SillyTavern-compatible design by default.
---

# Frontend Backend Compatibility Guard

## Workflow

1. Classify every touched responsibility before editing.
   - Keep the frontend limited to rendering backend-provided state, collecting user input, and dispatching backend commands or events.
   - Keep all business logic, data shaping, validation, compatibility mapping, persistence, caching, indexing, file I/O, and background work in the backend.
2. Reject frontend computation.
   - Do not add domain logic, storage logic, prompt assembly, import or export transforms, or authoritative derived state to the frontend.
   - If the current frontend already does these jobs, move them behind backend commands or services instead of extending the pattern.
3. Preserve SillyTavern compatibility as a hard constraint.
   - Keep compatible payloads, schemas, import or export semantics, and observable behavior wherever the product interoperates with SillyTavern data or workflows.
   - If a faster design would break compatibility, choose the fastest compatible design instead.
4. Choose the highest-performance compatible design automatically.
   - Evaluate the code path you are changing and pick the best expected latency and throughput profile that still preserves correctness, maintainability, and compatibility.
   - Do not follow a fixed optimization checklist. Select the implementation technique from the workload and bottleneck you actually see.
5. Fail explicitly on invalid state.
   - Do not hide correctness problems behind fallback paths.
   - Reject unsafe execution and return explicit errors from the owning backend layer.

## Implementation Gates

Read [references/implementation-gates.md](references/implementation-gates.md) before any substantial change and satisfy every gate that applies.

## Architecture Rules

- Treat the backend as the single owner of computation, persistence, and authoritative state transitions.
- Shape DTOs for rendering in the backend instead of asking the frontend to reconstruct domain meaning.
- Keep data concerns in data or storage models and business logic in application or service layers.
- Prefer stable backend contracts over duplicated frontend recomputation.
- Allow non-Rust frontend or tooling code freely. Use Rust for backend and hot paths when it is the best fit, but do not optimize for pure-Rust purity by itself.

## Required Reporting

- Report immediately if the frontend starts owning computation or storage.
- Report immediately if SillyTavern compatibility drifts or becomes ambiguous.
- Report immediately if a slower path is kept only for convenience when a compatible faster design is available.
- Report immediately if fallback-based fault masking, severe performance hazards, or severe security hazards appear.
- For each reported issue, state the risk point, impact scope, and recommended correction direction.

## Output Expectations

- For substantial changes, state the chosen architecture direction briefly in terms of frontend boundary, backend ownership, and SillyTavern compatibility.
- If multiple approaches exist, mention why the chosen one is the highest-performance compatible option. Keep the note short unless the tradeoff is contentious.

## Cache Management Rule

- All caches generated during development or runtime must be stored in the project cache folder (`D:\software_cache`). Do not occupy C drive space with any cache files.

## Android Debugging Rule

- When debugging the Android version, always use the ADB tools from the `platform-tools` folder in the project root to connect to Android devices for debugging.
