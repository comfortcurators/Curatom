# Curatom Enterprise rv0.2.0

Release date: 26 August 2026

This open-source staging candidate provides a tenant-scoped agent registry,
policy evaluation, grounded memory recall, data-residency enforcement,
synthetic proving-ground fixtures, and an audit/telemetry interface.

## Security and correctness pass

- Converted provider model calls on asynchronous request and ingestion paths
  to the Google Gen AI SDK asynchronous client.
- Enforced classification-ceiling and permitted-region filtering on memory
  listings and vector search results.
- Made CORS origins deployment-aware and login limiting proxy-aware.
- Added validated atom-identification input, mutation audit records, guarded
  ingestion, schema/type reconciliation, and an unprivileged container user.
- Replaced alert-based key disclosure with a masked, one-time copy dialog and
  made the DSR UI process every linked subject identifier.
- Licensed under AGPL-3.0-only (see `LICENSING.md` for the current status and
  why this is not described as dual-licensed until a commercial agreement
  actually exists), added citation metadata, release exclusions, data ethics
  disclosure, and AI-assistance disclosure.

## Deliberate boundaries

This release is not represented as production-ready. Human login remains a
controlled-evaluation stub, PII detection is heuristic, and live Cloud Run,
Firestore index, IAM, and Gemini integration checks require a configured
staging project.

Task planning and decomposition code exists, but durable task execution does
not. The `/tasks` endpoints intentionally return HTTP 501 until a real queued
worker with retries, idempotency, state transitions, and dead-letter handling
is implemented and deployed.

## Open-source dedication

rv0.2.0 honors the 35th anniversary of Linux and the open-source tradition it
helped establish. The complete staging implementation is included as source;
no opaque service-only backend is required to inspect or build it.
