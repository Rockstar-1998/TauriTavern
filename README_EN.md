# TauriTavern

> The default frontend is now `frontend/` (SolidJS + TypeScript + Vite).
>
> The legacy frontend under `src/` is kept only as a **legacy fallback** and is marked as **to be removed soon**.
>
> Common commands: `npm run dev`, `npm run build`, `npm run dev:legacy`, `npm run start`.
>
> Windows double-click launcher: `start.cmd`.

TauriTavern ports SillyTavern into a native desktop app with Tauri v2 + Rust backend while keeping the upstream frontend experience. The frontend is now synced to SillyTavern 1.15.0 and integrated through a modular Tauri injection layer.

## Highlights

- Native desktop runtime on Windows, macOS, Linux (Tauri v2)
- Rust backend with clean architecture layering
- Frontend compatibility with SillyTavern 1.15.0
- Chat Completion providers: OpenAI, Claude, Gemini(MakerSuite), and Custom OpenAI-compatible endpoint
- Modular request injection pipeline (`src/tauri/main/*`) replacing the previous monolithic `tauri-main.js`
- Unified frontend bootstrap pipeline without runtime loader indirection

## Architecture

### Backend (`src-tauri`)

- `presentation`: Tauri commands and API boundary
- `application`: use cases/services and DTO orchestration
- `domain`: core models, contracts, errors
- `infrastructure`: file persistence, repositories, logging

### Frontend (`src`)

- Upstream SillyTavern frontend code (HTML/CSS/JS)
- Tauri bridge and interception layer for replacing HTTP endpoints with local Tauri command calls

Frontend startup flow:

1. `src/init.js` loads `lib.js` -> `tauri-main.js` -> `script.js`
2. `src/lib.js` statically imports `src/dist/lib.bundle.js` and re-exports a stable ESM library surface
3. `src/tauri-main.js` delegates to `bootstrapTauriMain()`
4. `src/tauri/main/bootstrap.js` creates context/router/interceptors, then initializes bridge and runtime helpers

## Frontend Integration Layout

```text
src/
閳规壕鏀㈤埞鈧?tauri-bridge.js              # low-level Tauri bridge (invoke/listen/convertFileSrc)
閳规壕鏀㈤埞鈧?tauri-main.js                # thin bootstrap entry
閳规壕鏀㈤埞鈧?init.js                      # startup orchestrator
閳规壕鏀㈤埞鈧?lib.js                       # library facade (ESM exports)
閳规壕鏀㈤埞鈧?dist/lib.bundle.js           # webpack-built vendor bundle
閳规柡鏀㈤埞鈧?tauri/main/
    閳规壕鏀㈤埞鈧?bootstrap.js             # composition root
    閳规壕鏀㈤埞鈧?context.js               # shared state + domain helpers
    閳规壕鏀㈤埞鈧?http-utils.js            # request/response parsing helpers
    閳规壕鏀㈤埞鈧?interceptors.js          # fetch/jQuery ajax patching
    閳规壕鏀㈤埞鈧?router.js                # lightweight route registry
    閳规柡鏀㈤埞鈧?routes/
        閳规壕鏀㈤埞鈧?system-routes.js
        閳规壕鏀㈤埞鈧?settings-routes.js
        閳规壕鏀㈤埞鈧?extensions-routes.js
        閳规壕鏀㈤埞鈧?resource-routes.js
        閳规壕鏀㈤埞鈧?character-routes.js
        閳规壕鏀㈤埞鈧?chat-routes.js
        閳规柡鏀㈤埞鈧?ai-routes.js
```

## Development

Prerequisites:

- Rust stable
- Node.js 18+
- pnpm
- Tauri CLI

Setup:

```bash
git clone https://github.com/Darkatse/tauritavern.git
cd tauritavern
pnpm install
```

Common commands:

```bash
pnpm run web:build         # build frontend bundles (webpack)
pnpm run dev           # desktop dev mode (alias of tauri:dev)
pnpm run tauri:dev     # desktop dev mode
pnpm run tauri:build   # build desktop installers
pnpm run android:dev   # Android dev mode
pnpm run ios:dev       # iOS dev mode
```

Portable build notes:

- `pnpm run tauri:build:portable` outputs to `release/portable/` by default
- You can force portable runtime mode via `TAURITAVERN_RUNTIME_MODE=portable` or `portable.flag`
- On Windows, portable users must ensure WebView2 runtime is available

## FasTools (Debug Utility)

`fastools` is an useful toolkit that facilitates debugging during development and desktop deployment.

Build:

```bash
pnpm run fastools:build
```

Run:

- `pnpm run fastools:run`

If you prefer cargo directly, run from repository root:

```bash
cargo build --release --manifest-path fastools/Cargo.toml
cargo run --manifest-path fastools/Cargo.toml
```

## Documentation

- `docs/FrontendGuide.md`: frontend architecture and extension guide
- `docs/BackendStructure.md`: backend architecture details
- `docs/TechStack.md`: stack and integration choices
- `docs/ImplementationPlan.md`: roadmap and milestones

## License

AGPL-3.0 (same license family as SillyTavern).

## Acknowledgements

- [SillyTavern](https://github.com/SillyTavern/SillyTavern)
- [Tauri](https://tauri.app/)
- [Tavern-Helper](https://github.com/N0VI028/JS-Slash-Runner)
- [LittleWhiteBox](https://github.com/RT15548/LittleWhiteBox)
- [MikTik](https://github.com/Darkatse/MikTik)
