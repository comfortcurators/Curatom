# Curatom Enterprise — Google Cloud / Gemini Hackathon Submission

## Tagline

A tenant-scoped agent registry with grounded, policy-aware memory recall — built
end-to-end on Google Cloud.

## The problem

Enterprises deploying AI agents at scale hit three walls at once:

1. **No isolation.** One tenant's agent can see another tenant's data because
   memory/retrieval layers aren't scoped by classification, region, or org.
2. **No proof of policy.** "We enforce access control" is usually a claim in
   a doc, not something a test suite verifies against the actual route table.
3. **No accountability for deletion.** A data-subject deletion request touches
   memory, cache, recall logs, and tasks — and most systems can't prove every
   one of those was actually erased, not just the primary record.

## What we built

Curatom is a **tenant-scoped agent registry** with **grounded memory recall**:
every agent ("atom") operates inside a policy boundary that's enforced at the
route layer and provable by test, not just documented.

- **Policy-aware retrieval**: memory list and vector-search results are
  filtered by the requester's classification ceiling and permitted regions;
  missing or unknown security metadata **fails closed**, not open.
- **Grounded recall**: retrieval is backed by Firestore vector search
  (768-dim, `gemini-embedding-001`), so answers are traceable to a specific
  stored memory, not hallucinated from the model alone.
- **Gemini 3.5 throughout**: every generation and embedding call — chat,
  task orchestration, directory ingestion — runs on Gemini 3.5-flash via
  Vertex AI, authenticated with zero API keys (Cloud Run's service account
  identity, Application Default Credentials).
- **Proven, not claimed, isolation**: `test_route_authorization.py` asserts
  every non-ops route carries a real `authorize()` policy dependency and that
  no route trusts a client-supplied role header. `test_tenant_isolation`
  asserts the repository is constructed with the *requesting* tenant's scope,
  not just that a query returns empty.
- **Provable erasure**: a subject-erasure request cascades `.delete()` across
  every discovered memory, cache entry, recall log, and task record — the
  test asserts each delete was actually awaited, so the erasure receipt can't
  report a deletion that never happened.

## Google Cloud stack

| Layer | Service |
| --- | --- |
| Compute | Cloud Run (source-deploy, containerized FastAPI + built React frontend, single service) |
| Model | Gemini 3.5-flash via Vertex AI (keyless, service-account auth) |
| Data | Firestore (documents + 768-dim vector search) |
| Secrets | Secret Manager (JWT signing key, demo credentials — never in plaintext env vars) |
| Build | Cloud Build (source-to-container) |
| Registry | Artifact Registry |

One `gcloud run deploy --source .` builds the frontend, bakes it into the
same image as the API, and ships both from a single Cloud Run service — no
separate hosting product, no cross-origin config, one URL.

## Live demo

**https://curatom.comfortcurators.io**

Register your own workspace directly — no invitation or provisioned
credential needed. "Register Your Business" on the sign-in screen creates a
genuinely isolated tenant and signs you in immediately as its Owner, with no
data shared with any other business on Curatom. This is a real path, not a
sandboxed demo mode: verified live end to end (register → login → an
authenticated call against the new tenant's own business-context and agent-
registry endpoints, both correctly empty for a brand-new workspace, not
pre-seeded).

A built-in demo account (username `admin`, full Owner access to a shared
demo tenant) also exists if you'd rather explore than register your own —
credentials via Secret Manager, not published here. Note its password can't
be reset via the recovery-code flow (it isn't backed by a real Firestore
user doc), so a mistyped demo password means asking for it again, not
resetting it.

## What's honestly still a prototype

We'd rather say this than have a judge find it: sign-up is real and
self-serve (`POST /auth/register` creates a genuinely isolated tenant and
hands back a working session, verified live) but there's no external
identity provider (SSO/OIDC) or MFA yet, and password recovery is an in-app
code rather than an emailed link; the `/tasks` durable-queue
surface intentionally returns HTTP 501 (contract defined, not yet backed by a
real queue); PII detection is a regex heuristic, not a trained classifier.
Full list in `HARDENING_STATUS.md` in the repo. What *is* solid — tenant
isolation, route authorization, grounded recall, erasure cascade — is solid
because it's tested, not because it's asserted.

## Team

Comfort Curators Private Limited
