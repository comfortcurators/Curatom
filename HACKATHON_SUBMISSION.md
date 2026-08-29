# Curatom Enterprise — All Things Agentic submission

**Category:** Fortified Enterprise Fleet  
**Also eligible:** Startup Excellence (Comfort Curators Private Limited, CIN `U47912HR2026PTC144195`)

## Tagline

A tenant-scoped agent registry with grounded, policy-aware memory recall — Google ADK fleet, Cloud Run, Firestore, Vertex AI Gemini 3.5.

## Required stack (every track)

| Requirement | What we ship |
| --- | --- |
| Gemini 3.5 or newer via Gemini API or Vertex AI | `gemini-3.5-flash` on Vertex AI, keyless ADC from the Cloud Run service account |
| Google agent framework (ADK, GenAI SDK, Antigravity, or GenKit) | **Google ADK** multi-agent fleet (`gateway`, `memory_specialist`, `fleet_orchestrator`) plus `google-genai` for embeddings/chat |
| At least one Google Cloud infrastructure service | Cloud Run, Firestore (documents + 768-d vector search), Cloud Tasks, Secret Manager, Artifact Registry, Cloud Build |

Live, unauthenticated proof: `GET https://curatom.comfortcurators.io/ops/gcp-proof`  
ADK catalog: `GET https://curatom.comfortcurators.io/v1/adk/catalog`

## Fortified Enterprise Fleet mapping

| Subcomponent | Curatom surface |
| --- | --- |
| Agent Registry | `/atoms` — publish, version, discover, rotate keys |
| Agent Runtime | Google ADK orchestrator + Cloud Tasks `POST /tasks` → `/tasks/execute` |
| Memory Bank | Firestore vector search, classification + residency filter, fail-closed |
| Agent Identity | Human JWT sessions and per-atom API keys, never a client-supplied role |
| Agent Gateway | `authorize()` on every non-ops route; policy simulation |
| Model Armor | Classification/residency refusals, PII regex redaction, approval-gated writes |
| Observability | `/audit`, `/logs`, `X-Request-Id`, `/metrics` |

## Live demo

**https://curatom.comfortcurators.io**

Judges: register your own workspace on the sign-in screen ("New business — create your workspace"). That path creates a genuinely isolated tenant. No shared password is published.

Public pages (incognito, no login):

- `/#/architecture` — diagram + live Cloud Run revision
- `/ops/gcp-proof` — JSON proof of Cloud Run / Vertex / Firestore / ADK
- `/readyz` — `{"status":"ready","database":"connected"}`

## Architecture diagram

See `/#/architecture` on the live site (the source is `frontend/pages/Architecture.tsx`) and `docs/architecture.svg` in this repository.

## What is honestly still a prototype

No SSO/OIDC or MFA. Password recovery is an in-app backup code, not an emailed magic link. PII detection is a regex heuristic. Resource-aware ABAC (field-level, time-based conditions) is not fully proven. We would rather write that here than have a judge find it.

Tenant isolation, route authorization, grounded recall, subject-erasure cascade, ADK fleet runtime, and Cloud Tasks dispatch are tested and live.

## Team

Comfort Curators Private Limited

---

## Devpost paste (fill the form, do not submit until the video is public)

Copy these into the matching Devpost fields.

**Project name:** Curatom Enterprise

**Tagline:** Tenant-scoped agent registry with policy-aware, residency-enforced memory recall — Google ADK on Gemini 3.5, Cloud Run, Firestore.

**Category:** Fortified Enterprise Fleet (also eligible: Startup Excellence)

**Hosted project URL:** https://curatom.comfortcurators.io

**GitHub repo:** https://github.com/comfortcurators/Curatom (public)

**Testing instructions:** see `TESTING.md`. Judges register their own workspace. No shared password.

**Architecture diagram:** upload `docs/architecture.svg`. The same diagram is live at https://curatom.comfortcurators.io/#/architecture with the running Cloud Run revision.

**How we used the required stack:**
- Gemini 3.5 Flash via Vertex AI (keyless ADC on Cloud Run). Proof: `GET /ops/gcp-proof`.
- Google ADK 2.8.0 fleet (`gateway`, `memory_specialist`, `fleet_orchestrator`). Proof: `GET /v1/adk/catalog`.
- Cloud Run + Firestore (docs + 768-d vectors) + Cloud Tasks + Secret Manager.

**Video beats (must be public, under 4 minutes):** start on `/#/architecture`, show `K_SERVICE` / `K_REVISION`, open `/ops/gcp-proof`, register a workspace, run a fleet task, show a residency 403.
