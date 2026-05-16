# Global Project Instructions

These instructions are mandatory for every task in this repository.

## Always-On Skill

- Always apply the local skill: `skills/frontend-backend-compat-guard/SKILL.md`.
- Treat `skills/frontend-backend-compat-guard/references/implementation-gates.md` as required gates.
- Do not wait for explicit `$skill` invocation in this repo; it is always active.

## Product Direction

- Build a high-performance desktop AI chat app that stays compatible with SillyTavern where interoperability matters.
- Keep UI desktop-grade, clean layout, rounded style, and Mica-like blur when platform and performance budget allow.
- Prefer modern rendering stack choices and evaluate Vulkan-capable paths when relevant.

## Language Policy

- Do not optimize for pure-Rust purity as a goal by itself.
- Use Rust for backend and hot-path runtime code when it is the best fit.
- UI, frontend, and tooling work may use non-Rust languages without extra justification.
- For non-Rust changes that affect core runtime behavior, briefly note scope and impact.

## Architecture Policy

- Treat the frontend as a render-only layer.
- Do not place computation, business rules, compatibility transforms, or storage logic in the frontend.
- Treat the backend as the single owner of all computation, persistence, and authoritative state transitions.
- Follow DOP/DOD principles:
  - data belongs to data models and storage representations,
  - logic belongs to use-case or service layers,
  - keep data contiguous for hot paths where practical.
- Keep long-term maintainability as a hard requirement for all changes.

## Performance Policy

- Default to the highest-performance implementation that still preserves SillyTavern compatibility, correctness, and maintainability.
- Do not require a predetermined optimization checklist; choose the concrete technique from the workload and bottleneck you are actually changing.

## Mandatory Risk Escalation

If any of the following is detected, report immediately and explicitly (do not silently continue):

- major design defects,
- high-risk regressions,
- major architecture inconsistency,
- frontend taking on computation or storage responsibilities,
- SillyTavern compatibility drift,
- severe performance hazards,
- severe security hazards.

For each reported issue, include:

- risk point,
- impact scope,
- recommended correction direction.

## Debug Strategy (Mandatory)

- In DEBUG work, prefer replacing flawed architecture/design/algorithm/data-path over parameter tuning.
- Use parameter tuning only as a temporary diagnostic aid.
- Explain why tuning alone cannot solve root cause when replacement-first is chosen.

## Safety and Correctness Policy (No Fallback)

- Safety-critical and correctness-critical behavior must not use fallback execution paths.
- If preconditions fail or unsafe state is detected, reject execution and return explicit error handling.
- If fallback-based fault masking is found, report it immediately and prioritize removal.
