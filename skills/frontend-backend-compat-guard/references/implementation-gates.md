# Implementation Gates

Apply every gate that matches the change. Stop and redesign if a gate fails.

## Frontend Boundary Gate

- Does the frontend stay limited to rendering, user input capture, and backend command dispatch?
- Has all business logic, data shaping, compatibility logic, and authoritative derived state been pushed into the backend?
- Are DTOs already shaped for rendering so the frontend does not need to reconstruct domain meaning?

## Backend Ownership Gate

- Does the backend remain the only owner of persistence, caches, and authoritative state transitions?
- Are reads, writes, and mutations explicit instead of hidden behind fallback behavior?

## SillyTavern Compatibility Gate

- Does the change preserve SillyTavern-compatible payloads, schemas, import or export semantics, and observable behavior?
- If compatibility could drift, is the drift rejected or escalated immediately rather than left implicit?

## Performance Gate

- Have you chosen the highest-performance design that still preserves SillyTavern compatibility, correctness, and maintainability?
- Have you removed redundant copies, duplicate transforms, and frontend recomputation when the backend can produce the final result once?
- If you did not choose the fastest compatible path, have you documented the blocking constraint clearly?

## Safety Gate

- Does the code reject invalid or unsafe state explicitly instead of masking it with fallback execution?
- Are failure paths observable and testable from the owning backend layer?
