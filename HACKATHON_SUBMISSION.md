# Curatom Enterprise — All Things Agentic submission

**Category (pick ONE):** Fortified Enterprise Fleet  
**Also tick:** Startup Excellence — Comfort Curators Private Limited, CIN `U47912HR2026PTC144195`, use a corporate email.

## Tagline

A tenant-scoped agent registry with grounded, policy-aware memory recall — Google ADK fleet, Cloud Run, Firestore, Vertex AI Gemini 3.5.

## Pre-existing work (required disclosure)

The official rules require disclosure of code that existed before the Submission Period (3–31 Aug 2026).

Curatom Enterprise is not a greenfield three-week prototype. rv0.2.0 is archived on Zenodo ([10.5281/zenodo.22112980](https://doi.org/10.5281/zenodo.22112980)). The pre-existing product is the tenant-scoped registry, policy engine, grounded recall, residency enforcement, and control-plane UI.

**Built during this hackathon** for the Fortified Enterprise Fleet track:

- Google ADK 2.8.0 fleet (`backend/agents/adk_fleet.py`) on Gemini 3.5 Flash / Vertex ADC
- Durable Agent Runtime via Cloud Tasks (`POST /tasks` → `/tasks/execute`)
- Live Cloud Run proof (`GET /ops/gcp-proof`, `/#/architecture`)
- Model Armor first-party equivalent (prompt-injection / tool-poisoning / PII)
- A2A-shaped Agent Cards (`GET /atoms/{id}/card`)
- Reasoning-chain traces on every fleet task
- Grounded decision writes from the fleet (the agent takes an action, not only a reply)

We are not claiming the entire codebase was written in three weeks.

## Required stack (every track)

| Requirement | What we ship |
| --- | --- |
| Gemini 3.5 or newer via Gemini API or Vertex AI | `gemini-3.5-flash` on Vertex AI, keyless ADC from the Cloud Run service account |
| Google agent framework (ADK, GenAI SDK, Antigravity, or GenKit) | **Google ADK** multi-agent fleet (`gateway`, `memory_specialist`, `fleet_orchestrator`) plus `google-genai` for embeddings/chat |
| At least one Google Cloud infrastructure service | Cloud Run, Firestore (documents + 768-d vector search), Cloud Tasks, Secret Manager, Artifact Registry, Cloud Build |

Live, unauthenticated proof: `GET https://curatom.comfortcurators.io/ops/gcp-proof`  
ADK catalog: `GET https://curatom.comfortcurators.io/v1/adk/catalog`

## Fortified Enterprise Fleet mapping

First-party equivalents are accepted (Devpost organizer reply, 14 Aug 2026). Curatom maps the named subsystems onto capabilities we already enforce:

| Subcomponent | Curatom surface |
| --- | --- |
| Agent Registry | `/atoms` publish, version, discover, rotate keys + `GET /atoms/{id}/card` |
| Agent Runtime | Google ADK orchestrator + Cloud Tasks `POST /tasks` → `/tasks/execute` |
| Memory Bank | Firestore vector search, classification + residency filter, fail-closed |
| Agent Identity | Human JWT sessions and per-atom API keys, never a client-supplied role |
| Agent Gateway | `authorize()` on every non-ops route; policy simulation |
| Model Armor | Goal screening before dispatch; tool-arg sanitization; PII redaction; residency/classification 403s |
| Observability | `/audit`, `/logs`, `X-Request-Id`, `/metrics`, reasoning chain on `GET /tasks/{id}` |

## Live demo

**https://curatom.comfortcurators.io**

Judges: register your own workspace on the sign-in screen ("New business — create your workspace"). That path creates a genuinely isolated tenant. No shared password is published.

Public pages (incognito, no login):

- `/#/architecture` — diagram + live Cloud Run revision
- `/ops/gcp-proof` — JSON proof of Cloud Run / Vertex / Firestore / ADK
- `/readyz` — `{"status":"ready","database":"connected"}`

Cloud proof in the video: the Architecture page, `/ops/gcp-proof`, **and** the live `https://curatom-backend-xoupwyyw3a-uc.a.run.app` URL in the address bar (acceptable proof per FAQ).

## Architecture diagram

See `/#/architecture` on the live site (the source is `frontend/pages/Architecture.tsx`) and `docs/architecture.svg` in this repository.

## What is honestly still a prototype

No SSO/OIDC or MFA. Password recovery is an in-app backup code, not an emailed magic link. PII and prompt-injection detection are heuristics, not Google's Model Armor product. Resource-aware ABAC (field-level, time-based conditions) is not fully proven. SequentialAgent was attempted and 429'd Vertex quota; the live fleet is one ADK Agent with the specialist tools. We would rather write that here than have a judge find it.

Tenant isolation, route authorization, grounded recall, subject-erasure cascade, ADK fleet runtime, Cloud Tasks dispatch, Model Armor goal screening, and residency 403s are tested and live.

## Team

Comfort Curators Private Limited

---

## Devpost paste (fill the form, do not submit until the video is public)

Copy these into the matching Devpost fields.

**Project name:** Curatom Enterprise

**Tagline:** Tenant-scoped agent registry with policy-aware, residency-enforced memory recall — Google ADK on Gemini 3.5, Cloud Run, Firestore.

**Category:** Fortified Enterprise Fleet  
**Also select:** Startup Excellence Prize (incorporated org + corporate email)

**Hosted project URL:** https://curatom.comfortcurators.io

**GitHub repo:** https://github.com/comfortcurators/Curatom (public)

**Testing instructions:** see `TESTING.md`. Judges register their own workspace. No shared password.

**Architecture diagram:** upload `docs/architecture.svg`. The same diagram is live at https://curatom.comfortcurators.io/#/architecture with the running Cloud Run revision.

**How we used the required stack:**
- Gemini 3.5 Flash via Vertex AI (keyless ADC on Cloud Run). Proof: `GET /ops/gcp-proof`.
- Google ADK 2.8.0 fleet (`gateway`, `memory_specialist`, `fleet_orchestrator`). Proof: `GET /v1/adk/catalog`.
- Cloud Run + Firestore (docs + 768-d vectors) + Cloud Tasks + Secret Manager.

**Built during the Submission Period (disclose in the description):** ADK fleet, Cloud Tasks runtime, `/ops/gcp-proof`, architecture page, Model Armor screening, Agent Cards, reasoning-chain traces, grounded decision writes. Pre-existing: registry, policy engine, recall, UI (rv0.2.0 on Zenodo).

**Video beats (must be public on YouTube or Vimeo, under 4 minutes, English):**
1. Incognito: `/#/architecture` — Cloud Run service + revision.
2. New tab: `/ops/gcp-proof` JSON, then the `.run.app` URL in the address bar.
3. Register a workspace (not a shared password).
4. Fleet Runtime: run the default goal. Show specialists, reasoning chain, any decision written.
5. Click **Demonstrate Model Armor** — the jailbreak is refused, fleet does not run.
6. Proving Ground: mismatch region, show residency 403 naming the region.

**Bonus points you still own:**
- Public blog/dev.to post: paste `docs/HACKATHON_BUILD.md`, must say it was created for this hackathon.
- Social post with **#AllThingsAgenticHackathon** (X or LinkedIn). Draft below.
- Optional Gemma/Veo/Lyria — not integrated; do not claim it.

**X/LinkedIn draft:**

Curatom is our Fortified Enterprise Fleet entry for Google Cloud's All Things Agentic hackathon. Tenant-scoped agent registry, Google ADK on Gemini 3.5, Cloud Run, Firestore, fail-closed residency. Live: https://curatom.comfortcurators.io  Architecture (no login): https://curatom.comfortcurators.io/#/architecture  #AllThingsAgenticHackathon
