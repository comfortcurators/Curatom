# Demo video script (~2.5 min, screen recording + voiceover)

Record your screen at the live URL. Talk over it live — don't script word for
word, hit these beats in order.

## 0:00–0:20 — Hook + problem (talking head or slide, no screen yet)
"Enterprises rolling out AI agents run into the same failure three times:
one tenant's agent leaks another tenant's data, access policy is a claim in
a doc instead of something enforced, and when a user asks to be deleted,
nobody can prove every copy of their data actually went away. Curatom fixes
all three, and every claim I'm about to make is backed by a test in the repo,
not a slide."

## 0:20–0:50 — Live Google Cloud proof, then a real tenant
- Screen: open https://curatom.comfortcurators.io
- Open `/#/architecture` first (no login) and point at the live Cloud Run
  revision and `/ops/gcp-proof` JSON — this is the required "visible proof
  the backend runs on Google Cloud."
- Then click **New business — create your workspace** and register. That
  path creates a genuinely isolated tenant. Do not show a shared password.
- Show the empty dashboard/atom list — empty is correct for a new workspace.
"This is running live on Cloud Run right now — one service, frontend and
API baked into the same container. Everything you're about to see is a real
request hitting Firestore and Gemini through Vertex AI, not a mock."


## 0:50–1:30 — Policy-aware recall
- Register one agent (Atom Registry) and one memory (Memory Bank).
- Trigger a memory recall on Proving Ground.
- Then mismatch region (SG-only atom vs EU memory) and show the 403
  residency refusal naming the region.
"This answer is grounded — it's backed by a 768-dimension vector search
against Firestore, using Gemini's embedding model, so the answer traces back
to an actual stored memory. And the results you see are filtered by this
principal's classification ceiling and permitted regions before they ever
reach the model — unknown or missing security metadata fails closed, it
doesn't get through by default."

## 1:30–2:00 — ADK fleet task, then a test
- Fleet Runtime: submit a goal, show gateway + memory specialists.
- Switch to `backend/tests/test_route_authorization.py`.
"The fleet is Google ADK on Gemini 3.5. Isolation is not a slide —
test_route_authorization.py asserts every non-ops route carries a real
authorization policy, and that no route trusts a role header from the
client. Same discipline for tenant isolation and subject erasure."


## 2:00–2:20 — The stack
- Show the Cloud Console page for `curatom-backend`, briefly — revision
  name matching `/ops/gcp-proof`.
"Under the hood: Cloud Run for compute, Gemini 3.5 through Vertex AI with
zero API keys — auth comes from the service account identity — Firestore
for both documents and vector search, and Secret Manager for anything
sensitive. One `gcloud run deploy` builds the frontend, bakes it into the
same image as the API, and ships the whole thing as a single service."

## 2:20–2:30 — Close
"Curatom is a staging candidate, not a finished product — we say exactly
what's still a prototype in the repo's HARDENING_STATUS.md, because a
security claim you can't back with a test isn't a claim we want to make.
That's Curatom."

---

## Recording checklist
- [ ] Close any tabs/notifications with sensitive info before recording
- [ ] Use a freshly registered workspace — never show Secret Manager values
      or the demo password on screen
- [ ] Keep resolution at least 1080p, cursor visible
- [ ] Export as MP4, upload as a **public** YouTube (or Devpost-hosted) video
      under 4 minutes. Check it in an incognito window before submitting.
