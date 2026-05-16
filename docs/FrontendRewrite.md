# Frontend Rewrite

The new frontend under `frontend/` is now the default frontend for TauriTavern.

## Current status

- Default frontend: `frontend/`
- Legacy fallback frontend: `src/`
- Runtime shell: `Tauri 2`
- Frontend stack: `SolidJS + TypeScript + Vite + Tailwind`
- Backend strategy: keep reusing the current Rust/Tauri routes and commands

## Chat parity status

### Already covered

- Character and group entry points
- Session loading and saving
- Provider-backed streaming generation
- Provider defaults loading and saving through `settings.oai_settings`
- Message editing and deletion
- Continue generation on the latest assistant message
- Regenerate from a selected assistant message
- Text swipe compatibility (`swipe_id`, `swipes`, `swipe_info`)

### Intentionally not covered yet

- Legacy extension runtime
- Full prompt manager compatibility
- Image swipe parity
- Legacy slash command runtime
- Legacy jQuery plugin behaviors

## Frontend selection

### Recommended commands

```bash
npm run dev
npm run build
npm run start
```

### Windows double-click launcher

- Double-click `start.cmd` at the repository root to open a launcher menu.
- The menu lets you choose new/legacy frontend plus desktop/android dev/build flows.
- You can also call it directly with args, for example: `start.cmd --help`.

### Legacy fallback commands

```bash
npm run dev:legacy
npm run build:legacy
npm run android:dev:legacy
npm run android:build:legacy
```

## Important constraints

- New code must not import legacy `src/script.js`
- New code must not use `jQuery`
- View components must not talk to `window.__TAURI__` directly
- Native-only features stay in `frontend/src/lib/native/bridge.ts`
- HTTP and SSE access stay in `frontend/src/lib/api/http.ts`

## Transition note

The legacy frontend remains available only as a short-term fallback. Repository docs and scripts already mark it as deprecated, and it should be removed once the new chat experience is considered stable on Windows 11 and Android 12+.