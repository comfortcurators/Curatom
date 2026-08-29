# Testing instructions (hackathon judges)

Hosted URL: **https://curatom.comfortcurators.io**

The app is not gated behind a shared password. Register a workspace:

1. Open the URL in an incognito window.
2. Click **New business — create your workspace**.
3. Fill founder name, username, business name, email, password.
4. You are signed in as Owner of a new isolated tenant. Business context and the agent registry start empty — that is correct, not a broken demo.

Optional public checks (no login):

```
GET /readyz
GET /ops/gcp-proof
GET /v1/adk/catalog
GET /#/architecture
```

After login, the path that shows the fleet:

1. Overview — fill the White Paper (business context) if you want grounded answers about *your* company.
2. Atom Registry — register an agent (model family e.g. `gemini`).
3. Memory Bank — add a memory (pick a classification and region).
4. Fleet Runtime — submit a goal. The Google ADK gateway + memory specialists run against that tenant's data.
5. Proving Ground — pick the agent and memory, ask a question, watch a real residency/classification refusal if you mismatch them.

Visible Google Cloud proof in the demo video: the Architecture page prints the live Cloud Run service name and revision (`K_SERVICE` / `K_REVISION` are injected only by Cloud Run), plus Vertex AI / Firestore status from `/ops/gcp-proof`.
