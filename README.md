# Curatom Enterprise rv0.2.0

Curatom Enterprise is an open-source React and FastAPI staging candidate for a
tenant-scoped agent registry, policy evaluation, grounded memory recall, data
residency enforcement, and audit telemetry.

> **Release boundary:** rv0.2.0 is suitable for controlled evaluation with
> synthetic data. It is not represented as production-ready. Durable task
> execution and production identity provisioning are intentionally absent.

## Implemented capabilities

- Tenant- and organization-scoped repositories, quotas, and cost counters.
- Human session and per-atom key authentication with baseline policy checks.
- Atom registration, lifecycle transitions, key rotation, and profile
  identification grounded in indexed model documentation.
- Gemini Embedding 2 vectors at 768 dimensions, with model/dimension migration
  gates in every active KNN path.
- Memory recall with classification ceilings, region boundaries, redacted
  content, grounding citations, caching, token metering, and DSR linkage.
- Clearance filtering on both cursor-based memory listings and vector search.
- Synthetic multi-region proving-ground data and mutation audit records.
- Explicitly disabled task execution: `/tasks` returns HTTP 501 until a durable
  queue worker is implemented and deployed.

## Project structure

- `frontend/` — React 18, TypeScript, and Vite control-plane UI.
- `backend/` — FastAPI service, Firestore repositories, policy/recall services,
  migration scripts, tests, and a non-functional task-worker scaffold.
- `frontend/firestore.indexes.json` — composite and vector index definitions.
- `HARDENING_STATUS.md` — exact security boundary and remaining work.
- `RELEASE_NOTES.md` — rv0.2.0 changes and deliberate limitations.

## Requirements

- Python 3.12
- Node.js 20.19 or newer (or Node.js 22.12+)
- A Google Cloud project with Firestore configured
- A Gemini API key

The validated dependency versions are pinned in `backend/requirements.txt` and
`frontend/package.json` for reproducible evaluation.

## Required backend configuration

Set secrets out of band. Do not commit `.env` files.

```bash
export PROJECT_ID="your-gcp-project"
export API_KEY="<provider-key>"
export JWT_SECRET="$(openssl rand -base64 48)"
export DEMO_USERNAME="admin"
export DEMO_PASSWORD="$(openssl rand -base64 32)"
export FRONTEND_URL_PRODUCTION="https://your-frontend.example"
```

The backend exits during startup when `PROJECT_ID` or `API_KEY` is absent, or
when `JWT_SECRET` is shorter than 32 characters. Human demo authentication also
fails closed when `DEMO_PASSWORD` is absent. `DEMO_PASSWORD` is a
controlled-evaluation stub, not a production identity system.

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

## Data ethics and synthetic content

Comfort Curators Private Limited is the incorporated publisher of this
software. The fixtures reference that company identity, but every operational
metric, employee count, booking figure, and synthetic subject identifier in
`backend/fixtures/synthetic_enterprise.py` is fabricated for multi-region
policy testing. No real customer or employee data is included.

## AI assistance disclosure

This project was developed with assistance from large language models for code
generation, security review, and documentation. Architectural decisions,
synthetic fixture design, release boundaries, and policy behavior were
human-directed and reviewed.

## Security

Read `HARDENING_STATUS.md` before deployment. In particular, do not interpret a
successful local build as proof of Cloud Run IAM, Firestore indexes, proxy
trust, CORS, external identity, or live provider integration.

Please do not demo or describe `/tasks` as live autonomous execution. Planning
and decomposition are present; durable queued execution is a documented future
component.

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

Curatom Enterprise is independent software. Google Gemini, Google Cloud
Firestore, FastAPI, React, and all other third-party names, trademarks, and
libraries belong to their respective owners.

rv0.2.0 honors the 35th anniversary of Linux and the open-source tradition it
helped establish.
