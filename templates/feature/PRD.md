---
feature: ""        # kebab-case card name from .jairus/INTENT.md
plugin: ""         # the plugin this feature lives in; empty for a config card
version: "1.0"
status: draft      # draft | approved
---

# PRD: {{Feature Display Name}}

<!-- NOTE: This is the product contract. Complete all sections before requesting design review.
     The designer will not start without an approved PRD. -->

## 1. Overview

| Field | Value |
|-------|-------|
| **Feature** | {{feature display name}} |
| **Priority** | P0 / P1 / P2 <!-- P0 = launch blocker, P1 = important, P2 = nice-to-have --> |
| **Owner** | <!-- who is responsible for this feature --> |
| **Timeline estimate** | <!-- e.g. "2–3 days design + 3–5 days develop" --> |

## 2. Problem Statement

<!-- NOTE: What user problem does this solve? Why is it important NOW?
     Be specific: who is frustrated, what are they trying to do, what breaks today. -->

## 3. User Stories

<!-- NOTE: One row per user story. AC IDs (AC-1, AC-2, …) are those defined in spec.json. -->

| Role | Action | Benefit | AC IDs |
|------|--------|---------|--------|
| <!-- e.g. signed-in user --> | <!-- e.g. create a new project --> | <!-- e.g. so I can organize my work --> | AC-1, AC-2 |
| | | | |

## 4. Acceptance Criteria

<!-- NOTE: The criteria (AC-1, AC-2, …, testable, Given/When/Then) live in spec.json, the single owner:
     they carry their own traceability (implemented_at, test_at). Do not restate them here; the user
     stories above name the AC ids they serve, and the PR body is generated from spec.json. -->

See `spec.json` → `acceptance_criteria`.
## 5. Success Metrics

<!-- NOTE: Measurable outcomes. How do you know this feature is working?
     Examples: "90% of signups complete onboarding", "avg session duration ≥ 5 min" -->

- 

## 6. Dependencies

<!-- NOTE: Other features that must be done first, and external services required. -->

- **Feature dependencies**: <!-- e.g. "auth must be complete" -->
- **External services**: <!-- e.g. "Stripe test mode configured" -->

## 7. Out of Scope

<!-- NOTE: Explicitly list what this feature does NOT include.
     This protects scope. Be specific. -->

- 

## 8. Technical Considerations

<!-- NOTE: Constraints the designer and developer need to know upfront. -->

- **Database changes**: <!-- yes/no — new plugin tables (side tables keyed by org_id), brief description -->
- **API changes**: <!-- yes/no — server actions / route handlers, brief description -->
- **Stripe objects**: <!-- yes/no — product/price changes, webhooks needed -->
- **Performance requirements**: <!-- e.g. "list must render in <200ms", or "none" -->
- **Security notes**: <!-- e.g. "data is scoped to the active organization", GDPR, etc. -->

## 9. Open Questions

| Question | Owner | Status | Answer |
|----------|-------|--------|--------|
| <!-- e.g. Should users be able to share items? --> | <!-- PM --> | open | — |

---

## Approval

- [ ] Designer approved — design can begin
- [ ] Developer reviewed — technically feasible as described
- [ ] Reviewer signed off — acceptance criteria are testable
- [ ] Product owner approved — scope is correct
- **Date approved**: <!-- YYYY-MM-DD -->
