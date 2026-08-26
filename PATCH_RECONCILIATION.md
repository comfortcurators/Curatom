# rv0.2.0 Audit Reconciliation — 26 August 2026

The three supplied code-audit requests were applied as one ordered change set.
Where the continuation corrected an earlier snippet, the continuation wins:

- `/metrics` requires authentication via `resolve_auth`, so every authenticated
  UI role can read its own tenant counters.
- `/ask` also uses `resolve_auth`, preserving the authenticated UI flow. It is
  not left unauthenticated.
- `/directory/ingest` uses a global repository for the ingestion guard and a
  tenant repository for the operator audit record, eliminating the undefined
  variable in the earlier draft.

## Findings closed

1. Synchronous Gemini calls in async handlers/services.
2. Unauthenticated chat access (authenticated access retained per correction).
3. Cross-classification and cross-region memory listing/search.
4. Unconditional localhost CORS in deployed mode.
5. Proxy-unsafe login rate-limit identity.
6. Raw dictionary input on atom identification.
7. Uncontained startup and duplicate manual ingestion.
8. `allowed_regions`/`permitted_regions` profile drift.
9. Missing frontend recall/task fields.
10. Client bundle API-key definition.
11. Missing React type packages.
12. `null%` fleet health rendering input.
13. Missing audit trails on key, memory, fixture, and ingestion mutations.
14. Unused atom selector query parameter.
15. Non-global route-title formatting.
16. Unused Beautiful Soup dependency.
17. Root container runtime user.
18. Shipped pytest cache and missing release exclusions.
19. Alert-based rotated-key exposure.
20. Single-subject DSR UI behavior.

## Release integrity additions

- AGPL-3.0-only public licensing, a separately executed commercial-license
  path, `NOTICE`, and `CITATION.cff` for Zenodo/GitHub.
- rv0.2.0 package/UI metadata and release notes.
- AI-assistance, synthetic-data, third-party, and capability-boundary
  disclosures.
- Verified publisher identity from the certificate of incorporation. The older
  name-reservation letter is not represented as incorporation evidence.
- Removed an unverified DPIIT recognition string from the frontend constants.
- Replaced the audit draft's unsatisfiable dependency set with mutually
  compatible, current stable pins, including Google Gen AI 2.20.0, Firestore
  2.29.0, FastAPI 0.141.1, Pydantic 2.13.4, Google Auth 2.57.0, and HTTPX
  0.28.1.
- Added HTTPX2 2.12.0 for the current Starlette/FastAPI test client while
  retaining HTTPX for Google Gen AI and the ingestion service.
- Removed the unused `google-cloud-tasks` runtime dependency; the task worker is
  explicitly a non-functional scaffold and imports no Cloud Tasks client.
- Added a frontend lockfile and moved React Router/Vite tooling to audited
  releases; the final `npm audit` reports no known vulnerabilities.

## Deliberate limits

The implementation does not claim that durable task execution, production
identity, complete ABAC/DSR governance, or live cloud deployment has been
finished. Those boundaries remain visible in the UI and documentation.
