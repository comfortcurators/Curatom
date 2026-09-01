---
name: registry-discovery
description: Discover what Curatom Enterprise publicly exposes, how to register a real isolated workspace, and what still requires human authorization before acting.
---

# Curatom Registry Discovery

Use this skill when an agent needs to understand Curatom Enterprise's public
surface, or is asked to help a user get access to it.

## Start here

1. Read `/llms.txt` for the product-wide machine-readable summary.
2. Read `/.well-known/agent-skills/index.json` for this skill index.
3. Read `SECURITY.md` in the source repository
   (https://github.com/comfortcurators/Curatom) for the vulnerability-report
   process and known open hardening gaps.

## Public surface

The application is a single-page app behind hash-based routing
(`https://curatom.comfortcurators.io/#/...`). The one route reachable without
a session is `#/reception` — the sign-in screen, which offers both
"Register Your Business" (real self-serve tenant creation) and sign-in for
an existing account or agent key. Every other route requires an
authenticated session and redirects back to `#/reception` without one.

## Getting access

Registration is real, not a waitlist or a request-access form:
`POST /auth/register` creates a genuinely isolated tenant and returns a
working session immediately. An agent may walk a user through filling in
the registration form, but must not submit it, choose their password, or
otherwise act on their behalf without the user explicitly directing it in
the moment — this is account creation, not a read-only lookup.

## Agent boundaries

- Do not register a workspace, sign in, rotate a key, or mutate any tenant
  data without the user explicitly directing that specific action.
- Never ask a user to paste a password, session token, or API key into
  public content.
- Do not describe this deployment as production-ready without qualification;
  it is a controlled-evaluation staging candidate (see `HARDENING_STATUS.md`
  in the source repository for the current, precise list of gaps).
- Do not invent a price, SLA, or support-response commitment - none is
  published for this product.
