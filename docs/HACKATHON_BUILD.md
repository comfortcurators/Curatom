# Building Curatom's Fortified Enterprise Fleet for All Things Agentic

This write-up was created for the purposes of entering Google Cloud's All Things Agentic hackathon (deadline 31 August 2026).

Curatom is Comfort Curators' tenant-scoped agent registry. The problem we actually have: every time a different model (Claude, GPT, Gemini) is asked to act for a business, the business's own facts get reinvented. Agents leak across tenants. Policy lives in a doc, not in the request path. Deletion is a slide.

During this hackathon we put a real Google ADK fleet on that product, on Gemini 3.5 Flash via Vertex AI, running on Cloud Run with Firestore and Cloud Tasks.

## What judges can hit without logging in

- Live app: https://curatom.comfortcurators.io
- Architecture (Cloud Run revision, no login): https://curatom.comfortcurators.io/#/architecture
- Proof JSON: https://curatom.comfortcurators.io/ops/gcp-proof
- Source: https://github.com/comfortcurators/Curatom

## The fleet

Three specialists — gateway, memory, orchestrator — on `google-adk` 2.8.0. A SequentialAgent was the textbook shape; it 429'd this project's Vertex quota, so the live path is one ADK Agent holding those tools. We say that in HARDENING_STATUS.md because a security claim you cannot back with a test is not a claim we want to make.

Cloud Tasks calls `POST /tasks/execute` as a real HTTP request so Cloud Run keeps CPU allocated. The task record is in Firestore first. If the queue is unbound, the same fleet runs inline. Either way it is durable and audited.

## Model Armor, without pretending we bought the product

The Fortified Enterprise Fleet track names Model Armor. First-party equivalents are accepted. Curatom screens every fleet goal for prompt-injection and policy-bypass language *before* Gemini runs, drops tenant-scope keys a model might smuggle into a tool call, redacts PII with a documented heuristic, and 403s residency/classification mismatches by name rather than returning an empty list.

Click **Demonstrate Model Armor** on Fleet Runtime and the jailbreak is refused. The fleet does not run.

## What the agent actually does

Judging is 40% autonomous action over chat. After grounded recall, the orchestrator can write a Decision Log entry citing memory ids — a durable write, policy-checked, audited. That is the difference between "the model said something" and "the tenant now has a record."

## Honesty

SSO/OIDC and MFA are still absent. Prompt-injection detection is a heuristic. rv0.2.0 of Curatom existed before this hackathon; the fleet, Cloud Tasks runtime, live proof, Agent Cards, and Model Armor screening were built during the Submission Period. The rules asked us to disclose that, so we did.
