# Security Policy

## Supported versions

Curatom Enterprise is released as a single rolling line (currently
`rv0.2.0`), not a maintained set of parallel version branches. Security
fixes land on `main`; there is no older release still receiving separate
patches, so there is nothing to table by version number here. If that
changes — a tagged release that stops receiving updates while a newer one
continues — this section will name the cutover explicitly rather than
implying one that doesn't exist.

Before relying on any deployment for anything sensitive, read
[`HARDENING_STATUS.md`](./HARDENING_STATUS.md). It lists, by name, what is
and is not production-ready as of the current commit — identity, durable
task execution, resource-aware authorization, DSR/backup coverage, PII
handling, and proxy trust are all called out there as open items, not
buried in a changelog.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository
(**Security → Report a vulnerability**) if it is enabled — that path keeps
the report out of public issues until a fix ships. This document does not
promise it is enabled; if the option isn't available when you go to use it,
open a regular issue that states you have a security report **without**
exploit details or reproduction steps, and ask a maintainer to open a
private channel.

No dedicated security-contact email is published for this project. Do not
send vulnerability reports to email addresses found elsewhere (build logs,
commit metadata, unrelated Comfort Curators properties) on the assumption
they reach this project's maintainers — they may not, and that path isn't
supported.

What to include:

- The affected route, file, or component, and the commit/deploy it was
  observed on.
- Impact: what an attacker gains (auth bypass, cross-tenant data access,
  classification/region-ceiling bypass, secret exposure, etc.), not just
  the mechanism.
- Reproduction steps or a minimal proof of concept, if you have one.

## Scope

In scope: this repository's `frontend/` and `backend/` source, `deploy.sh`,
`firestore.rules`, and the Dockerfile as committed to `main`.

Out of scope: the live Google Cloud project backing any Comfort Curators
deployment (IAM configuration, Secret Manager contents, network policy,
billing) — report a live-infrastructure concern the same way, but expect it
to be handled as an operational incident rather than a code fix, since a
misconfigured deployment and a vulnerable commit are different problems
with different owners. Third-party dependencies (Gemini/Vertex AI, Firebase,
Firestore) have their own security reporting channels; use those directly
for issues that originate in the dependency itself rather than in how this
project calls it.

## What to expect

This is an AGPL-3.0-only open-source project published by Comfort Curators
Private Limited (see [`LICENSING.md`](./LICENSING.md)), not a project with a
staffed security team or a bug-bounty program. There is no committed
response-time SLA. A report that turns out to be a duplicate of an item
already listed in `HARDENING_STATUS.md` will be pointed there rather than
re-triaged from scratch — check that document first if you're unsure
whether something is a known gap or a new finding.

## Coordinated disclosure

Please give a reasonable window to investigate and, where practical, ship a
fix or a documented mitigation before any public disclosure or write-up.
"Reasonable" is not defined here as a fixed number of days; if you have a
specific deadline in mind, say so in the report and it will be honored
where feasible.
