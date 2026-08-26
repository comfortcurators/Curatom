# Curatom Enterprise rv0.2.0 — Staging Status

This archive is prepared for isolated staging with synthetic data, not
production.

Implemented and reconciled:

- Gemini Embedding 2 (`gemini-embedding-2`) at 768 dimensions.
- Model/dimension metadata and matching Firestore vector indexes.
- Tenant/org-scoped repositories, quotas, costs, audit records, and DSR paths.
- Environment-backed demo authentication and proxy-aware login throttling.
- Policy-protected routes plus classification/residency filtering on memory
  listing, vector search, and recall.
- Async provider calls throughout request, ingestion, chat, and planning paths.
- Pydantic validation for memory security metadata and atom identification.
- Guarded directory ingestion and an unprivileged backend container.
- Explicit HTTP 501 responses for every durable task endpoint.
- Open-source licensing, citation metadata, disclosures, and clean packaging.

Still intentionally incomplete:

- Production identity and comprehensive resource-aware ABAC.
- Durable autonomous execution.
- Production-grade PII governance and complete backup/export DSR proof.
- Live Cloud Run, Firestore, Gemini, IAM, proxy, and browser verification.

See `HARDENING_STATUS.md` for the exact boundary and `VALIDATION.md` for the
checks executed against this archive.
