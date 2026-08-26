# Deployment verification

`HARDENING_STATUS.md` lists live verification as an open boundary. This file
closes it — but only once someone actually runs these commands against a real
project and records the real output below.

**Nothing in this file is verified until the "Recorded results" section is
filled in with actual output.** A passing local test suite is not evidence
that a deployment works; every prior release candidate in this project's
history passed its own tests while shipping something unwired.

## Prerequisites

```bash
export PROJECT_ID="your-gcp-project"
export GEMINI_API_KEY="your-gemini-key"
export REGION="us-central1"
./deploy.sh
export BACKEND_URL="$(gcloud run services describe curatom-backend \
  --region "$REGION" --format='value(status.url)')"
export DEMO_PASSWORD="$(gcloud secrets versions access latest \
  --secret=curatom-demo-password)"
```

## 1. Service is reachable and healthy

```bash
curl -sS "$BACKEND_URL/healthz"
curl -sS "$BACKEND_URL/readyz"
```

`/readyz` writes a probe document to Firestore. If it fails, the service
account lacks `roles/datastore.user` or Firestore is not in Native mode.

## 2. Unauthenticated access is refused

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$BACKEND_URL/atoms"
```

Must be `401` or `403`. A `200` here means the authorization layer is not
running in the deployed revision and the release must be pulled.

## 3. Real authentication issues a real session

```bash
curl -sS -X POST "$BACKEND_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"$DEMO_PASSWORD\"}"
```

Capture the returned `session_token` as `$TOKEN`.

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
curl -sS -X POST "$BACKEND_URL/fixtures/load-synthetic" \
  -H "Authorization: Bearer $TOKEN"

curl -sS -X POST "$BACKEND_URL/ask" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"query":"what regions does this enterprise operate in"}'
```

Then confirm in the logs that a real model call happened, and on which model:

```bash
gcloud run services logs read curatom-backend --region "$REGION" --limit 50
```

The deployed model must be `gemini-3.5-flash`. If logs show `gemini-2.5-flash`,
a stale revision is serving.

## 7. Residency enforcement refuses, not just filters

Issue a recall for a memory outside the requesting atom's permitted regions.
The response must be an explicit residency refusal naming the region — an
empty result set is a different (and wrong) behaviour.

## 8. Direct Firestore access is denied

Confirm `firestore.rules` deployed and that a client without the backend's
service account credentials cannot read any collection.

```bash
gcloud firestore databases describe --database='(default)' --project "$PROJECT_ID"
```

---

## Recorded results

> Fill this in with actual captured output. Date, project, region, service
> URL, and the real response for each numbered check. Until then this release
> has **not** been verified live, and `HARDENING_STATUS.md` item 7 stays open.

| # | Check | Result | Date |
|---|-------|--------|------|
| 1 | Health / readiness | _not yet run_ | |
| 2 | Unauthenticated refused | _not yet run_ | |
| 3 | Login issues session | _not yet run_ | |
| 4 | Firestore round-trip | _not yet run_ | |
| 5 | Indexes READY | _not yet run_ | |
| 6 | Real Gemini 3.5 call | _not yet run_ | |
| 7 | Residency refusal | _not yet run_ | |
| 8 | Direct access denied | _not yet run_ | |
