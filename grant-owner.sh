#!/usr/bin/env bash
#
# Grants your own account (or a specified one) Owner on the project —
# the broadest role GCP has; Owner subsumes every other role's permissions.
#
# Usage:
#   export PROJECT_ID="rajvansh"
#   ./grant-owner.sh                       # grants the currently logged-in gcloud account
#   ./grant-owner.sh someone@example.com   # grants a specific account

set -euo pipefail

if [[ -z "${PROJECT_ID:-}" ]]; then
  echo "ERROR: PROJECT_ID is not set." >&2
  exit 1
fi

MEMBER_EMAIL="${1:-$(gcloud config get-value account 2>/dev/null)}"

if [[ -z "${MEMBER_EMAIL}" ]]; then
  echo "ERROR: no account found. Run 'gcloud auth login' first, or pass an email as \$1." >&2
  exit 1
fi

echo "==> Granting roles/owner on ${PROJECT_ID} to ${MEMBER_EMAIL}"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="user:${MEMBER_EMAIL}" \
  --role="roles/owner"

echo "==> Done. ${MEMBER_EMAIL} now has Owner on ${PROJECT_ID}."
