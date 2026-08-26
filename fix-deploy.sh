#!/usr/bin/env bash
#
# Fixes the two Cloud Build service-account permission gaps hit so far
# (log writing, Artifact Registry push) and creates the registry repo
# if it's missing, then re-runs the deploy. One shot.
#
# Usage:
#   export PROJECT_ID="rajvansh"
#   ./fix-deploy.sh

set -euo pipefail

REGION="${REGION:-us-central1}"

if [[ -z "${PROJECT_ID:-}" ]]; then
  echo "ERROR: PROJECT_ID is not set." >&2
  exit 1
fi

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
CLOUDBUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "==> Granting roles/logging.logWriter to ${CLOUDBUILD_SA}"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/logging.logWriter" \
  --condition=None >/dev/null

echo "==> Granting roles/artifactregistry.writer to ${CLOUDBUILD_SA}"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/artifactregistry.writer" \
  --condition=None >/dev/null

if ! gcloud artifacts repositories describe cloud-run-source-deploy \
    --location="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "==> Creating missing Artifact Registry repo cloud-run-source-deploy"
  gcloud artifacts repositories create cloud-run-source-deploy \
    --repository-format=docker \
    --location="${REGION}" \
    --project="${PROJECT_ID}"
else
  echo "==> Artifact Registry repo cloud-run-source-deploy already exists"
fi

echo "==> Re-running deploy"
cd "$(dirname "$0")"
./deploy.sh
