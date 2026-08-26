#!/usr/bin/env bash
#
# One-shot: clone-free (run from inside ~/curatom), fixes IAM, deploys,
# and makes the service reachable — either publicly (if org policy allows)
# or by telling you exactly how to reach it if it doesn't.
#
# Usage:
#   export PROJECT_ID="rajvansh"
#   ./deploy-all.sh

set -euo pipefail

REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-curatom-backend}"

if [[ -z "${PROJECT_ID:-}" ]]; then
  echo "ERROR: PROJECT_ID is not set." >&2
  exit 1
fi

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
CLOUDBUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "==> Granting roles/logging.logWriter"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/logging.logWriter" --condition=None >/dev/null

echo "==> Granting roles/artifactregistry.writer"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/artifactregistry.writer" --condition=None >/dev/null

if ! gcloud artifacts repositories describe cloud-run-source-deploy \
    --location="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "==> Creating Artifact Registry repo"
  gcloud artifacts repositories create cloud-run-source-deploy \
    --repository-format=docker --location="${REGION}" --project="${PROJECT_ID}"
fi

echo "==> Deploying"
./deploy.sh

BACKEND_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" --format='value(status.url)')"

echo "==> Attempting public (unauthenticated) access"
if gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
    --region "${REGION}" --member=allUsers --role=roles/run.invoker 2>/tmp/invoker_err; then
  echo "==> Public access granted. Verifying:"
  curl -sS "${BACKEND_URL}/healthz" || true
  echo
  echo "==> DONE. Live at: ${BACKEND_URL}"
else
  if grep -q "do not belong to a permitted customer" /tmp/invoker_err; then
    echo
    echo "==> BLOCKED by org policy (Domain Restricted Sharing:"
    echo "    iam.allowedPolicyMemberDomains). This is set at the GCP"
    echo "    organization level, above this project — no script run"
    echo "    against this project can override it. Two real options:"
    echo
    echo "    A) Keep it authenticated-only (no code change needed)."
    echo "       Reach it with an identity token, e.g.:"
    echo "         curl -H \"Authorization: Bearer \$(gcloud auth print-identity-token)\" ${BACKEND_URL}/healthz"
    echo "       A frontend/other service needs a service account with"
    echo "       roles/run.invoker granted on THIS service (not allUsers):"
    echo "         gcloud run services add-iam-policy-binding ${SERVICE_NAME} \\"
    echo "           --region ${REGION} \\"
    echo "           --member=\"serviceAccount:<caller-sa>@${PROJECT_ID}.iam.gserviceaccount.com\" \\"
    echo "           --role=roles/run.invoker"
    echo
    echo "    B) Get the org policy exempted/removed for this project"
    echo "       (needs orgpolicy.policyAdmin at the org, not project,"
    echo "       level — likely not you unless you admin comfortcurators.org):"
    echo "         gcloud resource-manager org-policies describe \\"
    echo "           iam.allowedPolicyMemberDomains --project=${PROJECT_ID}"
    echo "       then either delete the constraint at the project level"
    echo "       or add an exception, from Cloud Console > IAM & Admin >"
    echo "       Organization Policies (requires org-level access)."
    echo
    echo "==> Backend IS deployed and running at: ${BACKEND_URL}"
    echo "    It just isn't open to anonymous internet traffic yet."
  else
    echo "==> Unexpected error setting invoker policy:"
    cat /tmp/invoker_err
    exit 1
  fi
fi
