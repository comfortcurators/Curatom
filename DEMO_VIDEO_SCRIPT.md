# Demo video script (~3 min, screen recording + voiceover)

Record your screen at the live URL. Talk over it live — don't script word for
word, hit these beats in order. Public YouTube or Vimeo, English, first four
minutes only. Check the finished video in an incognito window before submit.

## 0:00–0:20 — Hook
"Enterprises rolling out AI agents hit the same failure three times: one
tenant's agent leaks another tenant's data, access policy is a claim in a
doc, and when a user asks to be deleted nobody can prove the copies went
away. Curatom fixes all three. Every claim I'm about to make is backed by a
test in the repo."

## 0:20–0:50 — Visible Google Cloud proof (required)
- Incognito: https://curatom.comfortcurators.io/#/architecture
- Point at Cloud Run service + revision (K_SERVICE / K_REVISION).
- Open /ops/gcp-proof in a new tab. Scroll Vertex, Firestore, ADK, Model Armor.
- Briefly open https://curatom-backend-xoupwyyw3a-uc.a.run.app so the
  `.run.app` URL is in the address bar — the FAQ lists that as acceptable proof.
"This is Cloud Run right now. Frontend and API are one service. Gemini 3.5
authenticates as the runtime service account — there is no API key."

## 0:50–1:40 — Register + fleet action
- Register a fresh workspace. Do not use a shared password on camera.
- Optional: add one memory (internal, your region) so recall has something real.
- Fleet Runtime: run the default goal.
- Point at specialists, the reasoning chain, and any Decision Log id the
  fleet wrote. "That write is the agent taking action — not a chat bubble."

## 1:40–2:10 — Model Armor + residency
- Click **Demonstrate Model Armor**. The jailbreak is refused. The fleet
  does not run.
- Proving Ground: mismatch region or classification, show the 403 that
  names the region. "An empty result set would be the wrong behaviour.
  This is an explicit refusal."

## 2:10–2:40 — Stack + honesty
- Repo: backend/tests/test_route_authorization.py (every non-ops route
  authorize()'d; no client-supplied role).
"Under the hood: Cloud Run, Vertex AI Gemini 3.5, Firestore documents plus
768-d vectors, Cloud Tasks, Secret Manager. Model Armor here is our
first-party equivalent — the track allows that. What is still a prototype
is in HARDENING_STATUS.md, including that SSO is absent and a SequentialAgent
429'd quota so the live fleet is one ADK Agent with the specialist tools."

## 2:40–3:00 — Close
"Curatom held the business's own facts before this hackathon. The fleet,
the Cloud Tasks runtime, the live proof, and the guardrails are what we
built for All Things Agentic. That's Curatom."

---

## Recording checklist
- [ ] Incognito, no notifications, no Secret Manager values, no demo password
- [ ] Architecture page, /ops/gcp-proof, and the .run.app URL all appear
- [ ] Model Armor refusal and a residency 403 both appear
- [ ] 1080p, cursor visible, export MP4, YouTube or Vimeo **public**
- [ ] Watch the upload yourself in incognito before pasting the link on Devpost
