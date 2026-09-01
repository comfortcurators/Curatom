# Deployment verification

`HARDENING_STATUS.md` lists live verification as a closed boundary once the
recorded-results table below is filled with actual output from a real project.

A passing local test suite is not evidence that a deployment works; every
prior release candidate in this project's history passed its own tests while
shipping something unwired.

## Prerequisites

```bash
export PROJECT_ID="your-gcp-project"
export REGION="us-central1"
./deploy.sh
export BACKEND_URL="$(gcloud run services describe curatom-backend \
  --region "$REGION" --format='value(status.url)')"
```

Leave `API_KEY` unset. Gemini authenticates via Vertex AI ADC.

## 1. Service is reachable and healthy

```bash
curl -sS "$BACKEND_URL/readyz"
curl -sS "$BACKEND_URL/ops/gcp-proof"
```

`/readyz` reads the excerpts collection count from Firestore. If it fails,
the service account lacks `roles/datastore.user` or Firestore is not in
Native mode.

`/healthz` also exists in the app (a plain liveness check with no Firestore
call) but do not rely on it for external verification: on at least one
deployment, requests to that exact path never reached the Cloud Run
container at all. `/readyz` is the canonical liveness check.

## 2. Unauthenticated access is refused

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$BACKEND_URL/atoms"
```

Must be `401` or `403`. A `200` here means the authorization layer is not
running in the deployed revision and the release must be pulled.

## 3. Real authentication issues a real session

```bash
curl -sS -X POST "$BACKEND_URL/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"username":"verify-user","founder_name":"Verifier",
       "business_name":"Verification Co","email":"verify@example.com",
       "password":"a-long-enough-password"}'
```

Capture the returned `session_token` as `$TOKEN`. Self-serve registration
is the judge path; do not publish a shared demo password.

## 4. Firestore round-trip through the real database

```bash
curl -sS -X POST "$BACKEND_URL/atoms/register" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"verify-atom","model_family":"gemini","role":"Consumer",
       "description":"deployment verification"}'

curl -sS "$BACKEND_URL/atoms" -H "Authorization: Bearer $TOKEN"
```

The atom must appear in the list — proving a real write and read against
Firestore, not an emulator.

## 5. Indexes exist and finished building

```bash
gcloud firestore indexes composite list --project "$PROJECT_ID"
```

Every vector index in `frontend/firestore.indexes.json` must be present with
state `READY`. Vector search silently returns nothing while indexes build,
which reads as "no results" rather than an error — check this explicitly.

## 6. A real Gemini call executes

```bash
curl -sS -X POST "$BACKEND_URL/tasks" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"goal":"List registered atoms for this tenant."}'
```

Confirm the task completes with `framework: google-adk` and model
`gemini-3.5-flash`. `/ops/gcp-proof` must report `vertex_ai: true`.

## 7. Residency enforcement refuses, not just filters

Register an atom whose `profile.permitted_regions` is `["SG"]`, create a
memory with `"region":"EU"`, then:

```bash
curl -sS -X POST "$BACKEND_URL/recall" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"atom_id":"...","memory_id":"...","query":"what is stored"}'
```

The response must be HTTP 403 with `code: residency_denied` naming the
region — an empty result set is a different (and wrong) behaviour.

## 8. Direct Firestore access is denied

Confirm `firestore.rules` (deny-all client access) and that a caller without
the backend service account cannot read any collection.

```bash
curl -sS "https://firestore.googleapis.com/v1/projects/$PROJECT_ID/databases/(default)/documents/atoms"
gcloud firestore databases describe --database='(default)' --project "$PROJECT_ID"
```

---

## Recorded results

Recorded 2026-08-29 against project `rajvansh`, region `us-central1`,
service `curatom-backend` revision `curatom-backend-00102-xvg`.
Public URL: https://curatom.comfortcurators.io
Cloud Run URL: https://curatom-backend-xoupwyyw3a-uc.a.run.app

| # | Check | Result | Date |
|---|-------|--------|------|
| 1 | Health / readiness | `GET /readyz` → `{"status":"ready","database":"connected"}`. `GET /ops/gcp-proof` reports `running_on_cloud_run: true`, `K_SERVICE=curatom-backend`, `K_REVISION=curatom-backend-00102-xvg`, Firestore `connected`, Vertex AI keyless, Cloud Tasks callback configured, `google-adk` 2.8.0. | 2026-08-29 |
| 2 | Unauthenticated refused | `GET /atoms` → HTTP 401 | 2026-08-29 |
| 3 | Login issues session | `POST /auth/register` returns `session_token` for a new isolated tenant (`tenant_6d2a3eb18301`). Demo Owner login also issues a session. | 2026-08-29 |
| 4 | Firestore round-trip | Authenticated `POST /atoms/register` created `atom_9d111fe9a2ed4838a9eb890f981a3236`; `POST /memories` created `mem_f6f2090fce834147975f52e3e4b4398c`. Earlier `POST /tasks` listed live tenant atoms via ADK tools. | 2026-08-29 |
| 5 | Indexes READY | `gcloud firestore indexes composite list` → 16 indexes, all `READY`, including 3 VECTOR indexes (`memories` + two `excerpts` variants) on 768-d `embedding`. | 2026-08-29 |
| 6 | Real Gemini 3.5 call | Production Cloud Tasks run `task_afc83d93f5dd49fd84d2a87b31d43f27` completed with `framework: google-adk`, model `gemini-3.5-flash`. Queue `curatom-fleet-tasks` is RUNNING. | 2026-08-29 |
| 7 | Residency refusal | `POST /recall` with SG-only atom vs EU memory → HTTP 403 `{"code":"residency_denied","message":"Data residency refusal: Memory resides in region 'EU', but requesting atom is only cleared for ['SG']."}` | 2026-08-29 |
| 8 | Direct access denied | Unauthenticated Firestore REST `GET .../documents/atoms` → HTTP 403 `PERMISSION_DENIED`. `firestore.rules` is deny-all. Database is Native mode, `us-central1`. | 2026-08-29 |

`HARDENING_STATUS.md` live-verification item is closed against these eight checks.
