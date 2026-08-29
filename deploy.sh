#!/usr/bin/env bash
#
# Curatom Enterprise — deployment to Google Cloud.
#
# Idempotent: safe to re-run. Creates what's missing, reuses what exists.
# Secrets go to Secret Manager, never to plaintext Cloud Run env vars.
#
# Usage:
#   export PROJECT_ID="your-gcp-project"
#   ./deploy.sh
#
# GEMINI_API_KEY is optional — unset means keyless Vertex AI auth.

#
# Optional overrides: REGION, SERVICE_NAME, SERVICE_ACCOUNT_NAME, DEMO_USERNAME

set -euo pipefail

REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-curatom-backend}"
SERVICE_ACCOUNT_NAME="${SERVICE_ACCOUNT_NAME:-curatom-backend-sa}"
DEMO_USERNAME="${DEMO_USERNAME:-admin}"

if [[ -z "${PROJECT_ID:-}" ]]; then
  echo "ERROR: PROJECT_ID is not set." >&2
  exit 1
fi
# GEMINI_API_KEY is OPTIONAL. Left unset, the backend authenticates to Gemini
# through Vertex AI using the Cloud Run service account's Application Default
# Credentials - no key to store, leak, or rotate, and usage bills to this
# project. Set it only to force the Developer API instead.

SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "==> Project: ${PROJECT_ID}   Region: ${REGION}   Service: ${SERVICE_NAME}"
gcloud config set project "${PROJECT_ID}" >/dev/null

# ---------------------------------------------------------------------------
# 1. Enable required APIs
# ---------------------------------------------------------------------------
echo "==> Enabling required APIs (idempotent)"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  cloudtasks.googleapis.com


# ---------------------------------------------------------------------------
# 2. Service account with least privilege
# ---------------------------------------------------------------------------
if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT_EMAIL}" >/dev/null 2>&1; then
  echo "==> Creating service account ${SERVICE_ACCOUNT_NAME}"
  gcloud iam service-accounts create "${SERVICE_ACCOUNT_NAME}" \
    --display-name="Curatom backend runtime"
else
  echo "==> Service account already exists"
fi

# datastore.user is the narrowest role that permits Firestore document
# read/write. Do NOT widen this to Editor or Owner.
echo "==> Granting roles/datastore.user"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/datastore.user" \
  --condition=None >/dev/null

# Required for keyless Gemini access through Vertex AI.
echo "==> Granting roles/aiplatform.user"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/aiplatform.user" \
  --condition=None >/dev/null

echo "==> Granting roles/cloudtasks.enqueuer"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/cloudtasks.enqueuer" \
  --condition=None >/dev/null


# ---------------------------------------------------------------------------
# 3. Secrets — created once, reused across revisions.
#
# JWT_SECRET must stay stable: regenerating it on every deploy invalidates
# every live session token. Same for DEMO_PASSWORD, which an operator needs
# to actually log in with.
# ---------------------------------------------------------------------------
create_secret_if_absent() {
  local name="$1" value="$2"
  if gcloud secrets describe "${name}" >/dev/null 2>&1; then
    echo "==> Secret ${name} exists — preserving current value"
  else
    echo "==> Creating secret ${name}"
    printf '%s' "${value}" | gcloud secrets create "${name}" --data-file=-
  fi
  gcloud secrets add-iam-policy-binding "${name}" \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" >/dev/null
}

create_secret_if_absent "curatom-jwt-secret"    "$(openssl rand -base64 48)"
create_secret_if_absent "curatom-demo-password" "$(openssl rand -base64 32)"
create_secret_if_absent "curatom-ingestion-task-secret" "$(openssl rand -base64 48)"


if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  create_secret_if_absent "curatom-api-key" "${GEMINI_API_KEY}"
  GEMINI_SECRET_ARG="API_KEY=curatom-api-key:latest,"
  echo "==> Gemini auth: Developer API (GEMINI_API_KEY provided)"
else
  GEMINI_SECRET_ARG=""
  echo "==> Gemini auth: Vertex AI via service account (no API key needed)"
fi

# ---------------------------------------------------------------------------
# 4. Firestore: rules + indexes
#
# Vector indexes take time to build. Retrieval paths filter on
# embedding_model/embedding_dimension, so partially-built indexes cannot
# serve wrong-dimension vectors — but searches will return nothing until the
# build completes.
# ---------------------------------------------------------------------------
if command -v firebase >/dev/null 2>&1; then
  echo "==> Deploying Firestore rules and indexes"
  firebase deploy --only firestore:rules,firestore:indexes --project "${PROJECT_ID}"
else
  echo "!!  firebase CLI not found — rules and indexes NOT deployed."
  echo "!!  Install it (npm i -g firebase-tools) and run:"
  echo "!!    firebase deploy --only firestore:rules,firestore:indexes --project ${PROJECT_ID}"
  echo "!!  Vector search returns nothing until the indexes exist."
fi

# ---------------------------------------------------------------------------
# 4b. Cloud Tasks queues
# ---------------------------------------------------------------------------
echo "==> Ensuring Cloud Tasks queues"
if gcloud tasks queues describe directory-ingestion --location="${REGION}" >/dev/null 2>&1; then
  echo "==> Queue directory-ingestion exists"
else
  gcloud tasks queues create directory-ingestion --location="${REGION}" \
    --max-attempts=3 --max-concurrent-dispatches=1
fi
if gcloud tasks queues describe curatom-fleet-tasks --location="${REGION}" >/dev/null 2>&1; then
  echo "==> Queue curatom-fleet-tasks exists"
else
  gcloud tasks queues create curatom-fleet-tasks --location="${REGION}" \
    --max-attempts=3 --max-concurrent-dispatches=4 --max-dispatches-per-second=2
fi

# ---------------------------------------------------------------------------
# 5. Deploy backend to Cloud Run
#
# --allow-unauthenticated exposes the HTTP surface; the application's own
# session/atom-key auth is the gate. Every route is covered by an authorize()
# dependency, verified by backend/tests/test_route_authorization.py.
# ---------------------------------------------------------------------------
echo "==> Deploying ${SERVICE_NAME} to Cloud Run"
ZEPTO_SECRET_ARG=""
if gcloud secrets describe curatom-zeptomail-token >/dev/null 2>&1; then
  gcloud secrets add-iam-policy-binding curatom-zeptomail-token \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" >/dev/null
  ZEPTO_SECRET_ARG="ZEPTOMAIL_TOKEN=curatom-zeptomail-token:latest,"
fi

gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --region "${REGION}" \
  --service-account "${SERVICE_ACCOUNT_EMAIL}" \
  --allow-unauthenticated \
  --timeout=3600 \
  --set-env-vars "PROJECT_ID=${PROJECT_ID},LOCATION=${REGION},DEMO_USERNAME=${DEMO_USERNAME},FRONTEND_URL_PRODUCTION=https://curatom.comfortcurators.io,FLEET_TASKS_QUEUE=curatom-fleet-tasks,INGESTION_TASKS_QUEUE=directory-ingestion" \
  --set-secrets "${GEMINI_SECRET_ARG}${ZEPTO_SECRET_ARG}JWT_SECRET=curatom-jwt-secret:latest,DEMO_PASSWORD=curatom-demo-password:latest,INGESTION_TASK_SECRET=curatom-ingestion-task-secret:latest"

BACKEND_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" --format='value(status.url)')"

echo "==> Binding SERVICE_BASE_URL for Cloud Tasks callbacks"
gcloud run services update "${SERVICE_NAME}" \
  --region "${REGION}" \
  --update-env-vars "SERVICE_BASE_URL=${BACKEND_URL}"


echo
echo "==> Deployed (frontend + backend, one service): ${BACKEND_URL}"
echo
echo "Next:"
echo "  1. Retrieve the demo password to log in:"
echo "       gcloud secrets versions access latest --secret=curatom-demo-password"
echo
echo "  2. Verify the live deployment (see DEPLOYMENT_VERIFICATION.md):"
echo "       curl -sS ${BACKEND_URL}/readyz"
echo
echo "  3. Open the app:"
echo "       ${BACKEND_URL}"
