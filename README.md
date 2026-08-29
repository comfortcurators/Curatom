# Curatom Enterprise rv0.3.0

Curatom Enterprise holds the canonical record of what a business is and what
it wants, so that intent doesn't get lost or reinvented every time a
different LLM (Claude, GPT, Gemini, or whatever launches next) is asked to
act on the business's behalf. That's the actual product. A tenant-scoped
agent registry, Google ADK fleet runtime, policy evaluation, grounded memory
recall, data residency enforcement, and audit telemetry sit underneath it as
the machinery that enforces and records what happens once that intent is acted
on.

> **Release boundary:** rv0.3.0 is the All Things Agentic evaluation build.
> SSO/OIDC and MFA are still absent. Durable fleet tasks now run (Google ADK
> + Cloud Tasks). Identity is self-serve registration plus a demo Owner
> account — not a production IdP.


## Implemented capabilities

- **Business context** (`/context`) — the founder's own answer to what the
  business is, who it serves, its current stack, and its priorities. No
  pre-filled or synthetic data: a tenant that hasn't answered these questions
  yet has no context, and every route says so honestly. Readable by any
  authenticated human or agent principal, writable by the Owner.
- **Decision log** (`/decisions`) — a claim-backed choice (e.g. "this model
  claims 10x efficiency over that one") recorded alongside the real outcome
  once it's known, so the next similar choice weighs the business's own
  track record rather than trusting the same claim again. States facts only;
  never a recommendation.
- **Real per-teammate accounts** (`/users`) — Owner, Tech Lead, Manager, etc.
  as distinct logins with their own role-scoped access, managed by the
  Owner, instead of one shared demo credential.
- Tenant- and organization-scoped repositories, quotas, and cost counters.
- Human session and per-atom key authentication with baseline policy checks.
- Atom registration, lifecycle transitions, key rotation, and profile
  identification grounded in indexed model documentation.
- Gemini embedding vectors (`gemini-embedding-001`) at 768 dimensions, with
  model/dimension migration gates in every active KNN path, paced under the
  provider's verified per-minute quota.
- Memory recall with classification ceilings, region boundaries, redacted
  content, grounding citations, caching, token metering, and DSR linkage.
- Clearance filtering on both cursor-based memory listings and vector search.
- A full audit trail (`/audit`) of every mutating operator action, separate
  from recall telemetry (`/logs`).
- Google ADK multi-agent fleet (`gateway`, `memory_specialist`,
  `fleet_orchestrator`) on Gemini 3.5-flash. `GET /v1/adk/catalog` lists them.
- Durable fleet tasks: `POST /tasks` writes a Firestore record and dispatches
  Cloud Tasks to `POST /tasks/execute`. If the queue is unbound, the same
  fleet runs inline in the request — still durable, still audited.
- Public Google Cloud proof: `GET /ops/gcp-proof` and `/#/architecture`.

## Project structure

- `frontend/` — React 18, TypeScript, and Vite control-plane UI.
- `backend/` — FastAPI service, Firestore repositories, Google ADK fleet,
  Cloud Tasks runtime, policy/recall services, tests.
- `frontend/firestore.indexes.json` — composite and vector index definitions.
- `HARDENING_STATUS.md` — exact security boundary and remaining work.
- `RELEASE_NOTES.md` — rv0.2.0 changes and deliberate limitations.

## Requirements

- Python 3.12
- Node.js 20.19 or newer (or Node.js 22.12+)
- A Google Cloud project with Firestore in Native mode
- Vertex AI access on that project (preferred) or a Gemini API key

The validated dependency versions are pinned in `backend/requirements.txt` and
`frontend/package.json` for reproducible evaluation.

## Required backend configuration

Set secrets out of band. Do not commit `.env` files.

```bash
export PROJECT_ID="your-gcp-project"
export JWT_SECRET="$(openssl rand -base64 48)"
export DEMO_USERNAME="admin"
export DEMO_PASSWORD="$(openssl rand -base64 32)"
export FRONTEND_URL_PRODUCTION="https://your-frontend.example"
```

The backend exits during startup when `PROJECT_ID` is absent, or when
`JWT_SECRET` is shorter than 32 characters. Human demo authentication also
fails closed when `DEMO_PASSWORD` is absent. `DEMO_PASSWORD` is a
controlled-evaluation stub, not a production identity system.

`API_KEY` is **optional**, not required — leaving it unset is the intended
path inside Google Cloud: the backend authenticates to Gemini via Vertex AI
using the runtime service account's Application Default Credentials, so a
Cloud Run deployment needs zero Gemini secrets. Set `API_KEY` only to force
the Developer API instead (e.g. for local dev outside Google Cloud).

When deployed behind a proxy, the proxy must overwrite (not merely preserve)
`X-Forwarded-For`, because login throttling uses its first address. Directly
exposed deployments should add an explicit trusted-proxy policy before use.

For the frontend, set `VITE_API_BASE_URL` to the FastAPI service URL. It
defaults to `http://localhost:8000` for local development.

## Run locally

Backend:

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Frontend:

```bash
cd frontend
npm ci
npm run dev
```

Build the frontend:

```bash
npm run build
```

Run backend tests from the repository root:

```bash
pytest -q
```

Firestore/vector integration checks require the emulator or a controlled GCP
staging project with the included indexes applied.

## Production deploy

Live at `curatom.comfortcurators.io`, one Cloud Run service
(`curatom-backend`) serving both the built frontend and the API — no separate
frontend hosting. No CI: build and deploy by hand.

```bash
export PROJECT_ID="your-gcp-project"
./deploy.sh
```

`deploy.sh` is idempotent — it enables required APIs, creates the runtime
service account with `roles/datastore.user` and `roles/aiplatform.user` only
(never broader), stores `JWT_SECRET`/`DEMO_PASSWORD` in Secret Manager on
first run and preserves them on every rerun, deploys Firestore rules/indexes
if the `firebase` CLI is available, and builds+deploys the Cloud Run service
from source. Re-running it after a code change redeploys; it does not
regenerate secrets that already exist.

Before deploying a change to `service/schema.sql`-equivalent Firestore state,
note there are no Firestore migrations — index changes need
`firebase deploy --only firestore:indexes` run explicitly (`deploy.sh` does
this only when `firebase` is installed).

## Recent capabilities (not yet reflected above)

Shipped after rv0.2.0's initial release, real and live:

- **Usage by model family** (Registry page) — real call-volume aggregation
  per connected key's `model_family`, computed from actual audit-log
  activity. No cost or accuracy figures — Curatom doesn't meter either yet,
  so none are invented.
- **White Paper version history and rollback** (`/context/history`,
  `/context/history/restore`) — every prior version was already being
  snapshotted on write; this exposes and makes it restorable, Owner-only.
- **`context_version`** on `GET /context` — a monotonic integer so an agent
  can detect a stale cached answer without comparing timestamps.
- **Real approval-email notification** — an approval-gated agent key's queued
  write now actually emails the tenant's registered contact, not just claims
  to.
- **Per-key activity tracking** — `last_seen` updates on every authenticated
  agent call (previously set once at registration and never touched again).
- **Woven Locus background** — a pointer/touch-reactive canvas field, ported
  to full design parity with the Host and SuperhostOS marketing sites and
  mounted once at the app root, so it renders behind every route rather than
  only the Reception sign-in screen it started on.

## Data ethics

Comfort Curators Private Limited is the incorporated publisher of this
software. Earlier releases shipped with a synthetic fixture of fabricated
company data for testing; it has been removed entirely — there is no seeded
or pre-filled business data anywhere in this repository. A deployment starts
with no business context until the Owner answers the onboarding questions
themselves, and no memory records until an operator creates them.

## AI assistance disclosure

This project was developed with assistance from large language models for code
generation, security review, and documentation. Architectural decisions,
synthetic fixture design, release boundaries, and policy behavior were
human-directed and reviewed.

## Security

Read `HARDENING_STATUS.md` before deployment. In particular, do not interpret a
successful local build as proof of Cloud Run IAM, Firestore indexes, proxy
trust, CORS, external identity, or live provider integration.

Please do not demo `/tasks` as if it were unattended overnight autonomy —
it is a durable ADK fleet run per submitted goal, not a weeks-long worker.

## Publisher, license, and citation

Published by **Comfort Curators Private Limited**, incorporated in India on
15 April 2026 (Corporate Identity Number `U47912HR2026PTC144195`). The older
name-reservation approval is not treated as evidence of incorporation; the
certificate of incorporation is the controlling identity source.

Curatom on the current `main` branch is licensed under the GNU Affero General
Public License v3.0 only (AGPL-3.0-only). Comfort Curators Private Limited may
separately offer commercial licensing for Curatom material for which it holds
sufficient rights, but no commercial license is granted by this repository
itself, and the project should not be described as already dual-licensed
unless and until one has actually been granted. See `LICENSE`, `LICENSING.md`,
and `NOTICE`. Citation metadata for Zenodo and GitHub is in `CITATION.cff`.
rv0.2.0 is archived on Zenodo: [10.5281/zenodo.22112980](https://doi.org/10.5281/zenodo.22112980).

Curatom Enterprise is independent software. Google Gemini, Google Cloud
Firestore, FastAPI, React, and all other third-party names, trademarks, and
libraries belong to their respective owners.

rv0.2.0 honors the 35th anniversary of Linux and the open-source tradition it
helped establish.
