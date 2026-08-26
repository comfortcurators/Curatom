# Validation — Curatom Enterprise rv0.2.0

Validation date: 26 August 2026

## Backend

Executed in a clean Python 3.12 virtual environment using the exact versions
in `backend/requirements.txt`:

```text
python -m pytest -q
................                                                         [100%]
16 passed

python -m pip check
No broken requirements found.

python -m compileall -q backend
completed successfully
```

The regression suite covers authentication rejection and acceptance,
authenticated HTTP 501 task boundaries, Pydantic classification/region
validation, proxy-forwarded login rate-limit scope, tenant/org rate-limit
scope, memory classification/region visibility, and the 768-dimension
Firestore vector-index contract.

## Frontend

Installed from `frontend/package-lock.json` and executed:

```text
npm run build
tsc --noEmit && vite build
1424 modules transformed; production bundle completed successfully

npm audit
found 0 vulnerabilities
```

The production build uses Vite 8.2.2 and includes a strict TypeScript check.
No provider API key, dummy key definition, or obsolete Node proxy remains in
the Vite configuration.

## Release metadata and static contracts

- `CITATION.cff` validates against Citation File Format schema 1.2.0.
- `LICENSE` contains the complete GNU Affero General Public License version 3
  text, and `LICENSING.md` accurately separates the current AGPL public
  option from commercial rights, which require a separate signed agreement
  and are not yet granted.
- Root/frontend package versions and UI metadata agree on release 0.2.0
  (`rv0.2.0` as the product label).
- Firestore vector indexes use 768 dimensions and retrieval paths require the
  matching `gemini-embedding-2` model/dimension metadata.
- Release scans reject secret/config files, Python/pytest caches,
  `node_modules`, and frontend build output from the distributable archive.

## External checks not claimed

This validation did not deploy to Cloud Run, build indexes in a live Firestore
project, call the live Gemini API, or exercise a real identity provider. Those
checks require an authenticated, isolated staging project and remain explicit
release boundaries.
