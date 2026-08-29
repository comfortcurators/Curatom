# Curatom Enterprise rv0.2.0 — Hardening Status

This archive contains the reconciled security/correctness pass for controlled
staging and open-source review. rv0.3.0 is the All Things Agentic evaluation
build: ADK fleet runtime and durable tasks are live. SSO/OIDC and MFA are
still absent. It is **not** a claim of a finished identity provider.


## Implemented in rv0.2.0

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
  requirement. Nine call sites were updated (`main.py`, `taskmaster.py`,
  `chat_handler.py`, `directory_fetcher.py`, `frontend/constants.ts`).
- `backend/agents/adk_definitions.py` has been removed. It was an `httpx`
  client against a `reasoningEngines` URL with an `agent_id` that nothing in
  this repository ever provisioned, and it was dead code — nothing imported
  it. There is no real Google Agent Development Kit integration in this
  codebase. See below.

## Still not production-ready

1. **Identity:** this line previously said demo auth was one
   environment-provisioned account, full stop - stale as of this write-up.
   `POST /auth/register` is real, self-serve, rate-limited (5/min/IP), and
   verified live against production: it creates a genuinely isolated tenant
   and hands back a working session immediately, no founder involvement.
   `POST /auth/recovery-code` / `/auth/recover` give an authenticated user a
   real way to reset their own password. What's still missing, and is the
   actual gap: no external identity provider (SSO/OIDC), no MFA, and
   recovery is an in-app code rather than an emailed reset link - by design,
   since email verification is best-effort and does not gate login
   (`ZEPTOMAIL_TOKEN` unset means no email leaves the service, and
   registration says so honestly rather than claiming otherwise). Session
   revocation is JWT expiry only; there is no explicit sign-out-everywhere.
2. **Durable tasks:** `/tasks` writes a Firestore record and runs the Google
   ADK fleet. Cloud Tasks calls `POST /tasks/execute` when
   `SERVICE_BASE_URL` and `INGESTION_TASK_SECRET` are set; otherwise the
   creating request runs the fleet inline. Retries stop after 3 attempts and
   mark the record failed. Dead-letter is that failed record, not a separate
   queue.

3. **ABAC coverage:** route-level authorization is now proven by automated
   test (`test_route_authorization.py`) — every non-ops route carries an
   `authorize()` dependency and none reads a role from a client header. What
   remains unproven is *resource-aware* policy: field-level, time-based, and
   dynamic condition evaluation within each business operation.
4. **DSR proof:** live deletion covers scoped memory, cache, recall, and task
   records; backups, exports, provider logs, and retention-policy proof remain
   deployment responsibilities.
5. **PII governance:** regex detection/redaction is a staging heuristic.
6. **Proxy trust:** the edge must overwrite `X-Forwarded-For`; direct exposure
   without a trusted-proxy policy is unsupported.
7. **Live verification:** Cloud Run IAM/networking, Firestore indexes, Gemini
   calls, and restore/incident procedures require a configured staging project.
   `deploy.sh`, `firebase.json`, and `firestore.rules` now provision these,
   and `DEPLOYMENT_VERIFICATION.md` lists the checks that close this item —
   but its results table is still empty, so **this boundary remains open until
   someone runs those checks against a real project and records the output.**
8. **Google Agent Development Kit (ADK):** integrated. `backend/agents/adk_fleet.py`
   defines a Gateway / Memory / Orchestrator fleet on `gemini-3.5-flash`.
   `GET /v1/adk/catalog` reports the loaded framework. If `google-adk` cannot
   import, the same tools run through a google-genai function-calling loop —
   still Gemini 3.5, never a stub. `framework_status()` is the source of truth
   for which path is live.


## Fail-closed configuration

```bash
export PROJECT_ID="your-gcp-project"
export API_KEY="<provider-key>"
export JWT_SECRET="$(openssl rand -base64 48)"
export DEMO_USERNAME="admin"
export DEMO_PASSWORD="$(openssl rand -base64 32)"
export FRONTEND_URL_PRODUCTION="https://your-frontend.example"
```

Do not commit these values. A successful syntax check or local build is not
evidence that the external deployment boundary is secure.
