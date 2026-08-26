#!/usr/bin/env bash
#
# Builds the frontend against the live Cloud Run backend and deploys it
# to Firebase Hosting, then wires the resulting URL into the backend's
# CORS allowlist (FRONTEND_URL_PRODUCTION) so the browser isn't blocked.
#
# Run this AFTER deploy-all.sh / deploy.sh has already put the backend live.
#
# Usage:
#   export PROJECT_ID="rajvansh"
#   ./deploy-frontend.sh

set -euo pipefail

REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-curatom-backend}"

if [[ -z "${PROJECT_ID:-}" ]]; then
  echo "ERROR: PROJECT_ID is not set." >&2
  exit 1
fi

if ! command -v firebase >/dev/null 2>&1; then
  echo "==> firebase CLI not found, installing (npm i -g firebase-tools)"
  npm install -g firebase-tools
fi

BACKEND_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" --project "${PROJECT_ID}" --format='value(status.url)')"

if [[ -z "${BACKEND_URL}" ]]; then
  echo "ERROR: could not resolve backend URL. Deploy the backend first (./deploy-all.sh)." >&2
  exit 1
fi

echo "==> Building frontend against backend: ${BACKEND_URL}"
cd "$(dirname "$0")/frontend"
npm ci
VITE_API_BASE_URL="${BACKEND_URL}" npm run build
cd ..

echo "==> Deploying to Firebase Hosting (project ${PROJECT_ID})"
firebase deploy --only hosting --project "${PROJECT_ID}"

FRONTEND_URL="https://${PROJECT_ID}.web.app"

echo "==> Wiring FRONTEND_URL_PRODUCTION into backend CORS"
gcloud run services update "${SERVICE_NAME}" \
  --region "${REGION}" --project "${PROJECT_ID}" \
  --update-env-vars "FRONTEND_URL_PRODUCTION=${FRONTEND_URL}"

echo
echo "==> DONE."
echo "    Frontend: ${FRONTEND_URL}"
echo "    Backend:  ${BACKEND_URL}"
echo "    Log in with the demo password:"
echo "      gcloud secrets versions access latest --secret=curatom-demo-password --project ${PROJECT_ID}"
