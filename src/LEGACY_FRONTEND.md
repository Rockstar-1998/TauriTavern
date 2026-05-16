# Legacy Frontend Notice

The legacy frontend under `src/` is still present only as a temporary fallback.

## Status

- Default frontend: `frontend/`
- Legacy fallback: `src/`
- Legacy status: deprecated / to be removed soon

## Recommended commands

```bash
npm run dev
npm run build
npm run start
```

On Windows you can also double-click `start.cmd` from the repository root.

## Legacy-only commands

```bash
npm run dev:legacy
npm run build:legacy
```

Do not add new features to the legacy frontend unless they are necessary for short-term fallback stability.