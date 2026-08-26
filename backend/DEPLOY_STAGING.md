# Staging deployment

This candidate is intended for an isolated staging project using synthetic data.

## 1. Configure stable secrets

Generate the JWT secret once and preserve it across Cloud Run revisions. Do not regenerate it on every deploy.

```bash
export PROJECT_ID="your-staging-project"
export LOCATION="us-central1"
export API_KEY="your-gemini-api-key"
export JWT_SECRET="$(openssl rand -base64 48)"
export DEMO_USERNAME="admin"
export DEMO_PASSWORD="$(openssl rand -base64 32)"
export FRONTEND_URL_PRODUCTION="https://your-frontend-domain.com"
```

For anything beyond isolated staging, store secrets in Google Secret Manager and replace demo authentication with a real IdP.

## 2. Embedding migration

Fresh staging: start with empty `memories` and `excerpts`, deploy the indexes, then ingest/seed.

Existing staging data: before serving vector search traffic, run from `backend/`:

```bash
python -m scripts.migrate_embeddings
```

The application only searches documents whose `embedding_model` is `gemini-embedding-2` and whose `embedding_dimension` is `768`, so old or differently-sized vectors cannot enter retrieval during a partial migration.

## 3. Deploy Firestore indexes

`frontend/firestore.indexes.json` is valid Firebase index-definition JSON and contains the required 768-dimension vector indexes plus scoped query indexes. Deploy it with your configured Firebase project, for example:

```bash
firebase deploy --only firestore:indexes
```

Wait for vector indexes to finish building before enabling vector-search traffic.

## 4. Deploy backend

```bash
cd backend
gcloud run deploy curatom-backend \
  --source . \
  --region "$LOCATION" \
  --allow-unauthenticated \
  --set-env-vars PROJECT_ID="$PROJECT_ID",LOCATION="$LOCATION",API_KEY="$API_KEY",JWT_SECRET="$JWT_SECRET",DEMO_USERNAME="$DEMO_USERNAME",DEMO_PASSWORD="$DEMO_PASSWORD",FRONTEND_URL_PRODUCTION="$FRONTEND_URL_PRODUCTION"
```

`--allow-unauthenticated` exposes the HTTP service, but application endpoints still enforce their own auth. It is not a substitute for an external identity layer.

The trusted edge must overwrite `X-Forwarded-For`; login rate limiting uses
the first address in that header. Do not directly expose this staging service
without an explicit trusted-proxy policy.

## 5. Frontend

Install the locked dependencies and build:

```bash
cd frontend
npm ci
npm run build
```

The unused browser-side Gemini client has been removed; Gemini API calls are backend-only.

## Known staging limitations

- `/tasks` remains HTTP 501 until the durable task worker exists.
- Demo authentication is intentionally not production identity provisioning.
- PII redaction is heuristic regex-based handling, suitable only for synthetic staging.
- Classification and residency are enforced for memory list/search and recall,
  but comprehensive resource-aware ABAC has not been proven on every route.
