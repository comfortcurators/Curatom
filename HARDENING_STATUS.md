# Curatom Enterprise rv0.3.0 — Hardening Status

This is the All Things Agentic evaluation build: Google ADK fleet runtime
and durable Cloud Tasks are live on Cloud Run. SSO/OIDC and MFA are still
absent. It is **not** a claim of a finished identity provider.


## Implemented

- All Gemini generation and embedding calls made from asynchronous application
  paths use the Google Gen AI SDK asynchronous client.
- Memory list and vector-search results are filtered by the authenticated
  principal's classification ceiling and permitted regions; missing or unknown
  security metadata fails closed.
- CORS admits only the configured deployment origin; local origins are enabled
  only in local mode.
- Login throttling uses the first trusted `X-Forwarded-For` address with a
  direct-client fallback.
- Atom identification uses a Pydantic request model.
- Startup and manually triggered directory ingestion are guarded; failures are
  contained and ingestion state is cleared when possible.
- Atom key rotation, memory creation, fixture loading, and ingestion triggering
  write tenant-scoped audit records.
- Backend/frontend profile and recall-log schemas are aligned.
- The Vite bundle no longer defines any provider key, React type packages are
  declared, and the container runs as an unprivileged user.
- Rotated secrets use a masked one-time copy dialog; DSR actions process every
  subject identifier linked to the selected memory.
- Release caches, build output, local configuration, and secret-file patterns
  are excluded. CFF citation metadata is present. See `LICENSING.md` for the
  current license status; no commercial license has been granted, so the
  repository should not be described as already dual-licensed.
- `httpx2==2.12.0` in `backend/requirements.txt` was checked against PyPI and
  confirmed real (published by httpx's own author; Starlette's `TestClient`
  now names it as the deprecation successor to `httpx`). An earlier automated
  review flagged it as a hallucinated package on the strength of stale
  training data — verified against the live registry rather than assumed
  either way, and kept.
- Every model call now targets `gemini-3.5-flash`, meeting the Gemini 3.5+
  requirement.
- Dead `backend/agents/adk_definitions.py` (an `httpx` client against an
  unprovisioned `reasoningEngines` URL) was removed. Real Google Agent
  Development Kit integration lives in `backend/agents/adk_fleet.py`
  (`google-adk==2.8.0`) on `gemini-3.5-flash`. `GET /v1/adk/catalog` reports
  the loaded framework. If `google-adk` cannot import, the same tools run
  through a google-genai function-calling loop — still Gemini 3.5, never a
  stub. `framework_status()` is the source of truth for which path is live.
- Durable fleet tasks: `POST /tasks` writes a Firestore record and Cloud Tasks
  calls `POST /tasks/execute` when `SERVICE_BASE_URL` and
  `INGESTION_TASK_SECRET` are set; otherwise the creating request runs the
  fleet inline. Retries stop after 3 attempts and mark the record failed.
- Model Armor first-party equivalent (`backend/services/model_armor.py`):
  prompt-injection / policy-bypass language is refused before Gemini runs;
  tenant-scope keys are stripped from tool arguments; PII is the existing
  heuristic. This is not Google's Model Armor product. A SequentialAgent of
  specialists 429'd Vertex quota; the live path is one ADK Agent holding
  those tools.
- Live verification against project `rajvansh` on 2026-08-29 is recorded in
  `DEPLOYMENT_VERIFICATION.md` (Cloud Run revision `curatom-backend-00102-xvg`,
  Firestore indexes READY, Vertex AI Gemini 3.5, Cloud Tasks, residency 403,
  deny-all client rules).


## Still not production-ready

1. **Identity:** `POST /auth/register` is real, self-serve, rate-limited
   (5/min/IP), and verified live against production: it creates a genuinely
   isolated tenant and hands back a working session immediately. Password
   recovery is an in-app backup code, not an emailed magic link. What's still
   missing: no external identity provider (SSO/OIDC), no MFA, and session
   revocation is JWT expiry only — there is no explicit sign-out-everywhere.
   Email verification is best-effort and does not gate login (`ZEPTOMAIL_TOKEN`
   unset means no email leaves the service, and registration says so honestly).
2. **Durable-task dead-letter:** retries stop after 3 attempts and mark the
   Firestore record failed. That failed record is the dead-letter; there is
   no separate DLQ.
3. **ABAC coverage:** route-level authorization is proven by automated test
   (`test_route_authorization.py`) — every non-ops route carries an
   `authorize()` dependency and none reads a role from a client header. What
   remains unproven is *resource-aware* policy: field-level, time-based, and
   dynamic condition evaluation within each business operation.
4. **DSR proof:** live deletion covers scoped memory, cache, recall, and task
   records; backups, exports, provider logs, and retention-policy proof remain
   deployment responsibilities.
5. **PII governance:** regex detection/redaction is a staging heuristic.
6. **Proxy trust:** the edge must overwrite `X-Forwarded-For`; direct exposure
   without a trusted-proxy policy is unsupported.


## Fail-closed configuration

```bash
export PROJECT_ID="your-gcp-project"
export JWT_SECRET="$(openssl rand -base64 48)"
export DEMO_USERNAME="admin"
export DEMO_PASSWORD="$(openssl rand -base64 32)"
export FRONTEND_URL_PRODUCTION="https://your-frontend.example"
```

`API_KEY` is optional. Inside Google Cloud, leave it unset so Gemini
authenticates via Vertex AI Application Default Credentials.

Do not commit these values. A successful syntax check or local build is not
evidence that the external deployment boundary is secure.
