"""First-party Model Armor equivalent.

Google's Model Armor product is not required for the Fortified Enterprise
Fleet track (first-party equivalents are accepted). This module is the
inline guardrail: prompt-injection, tool-poisoning, and PII. It is
deterministic on purpose — a regex/heuristic that fails closed does not
depend on a second model remaining available, which is the failure mode
an LLM-only guardrail has under quota.

It is a heuristic, not a trained classifier. HARDENING_STATUS.md says so.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from core.security import detect_and_redact_pii

ENGINE = "curatom-model-armor"

_INJECTION = [
    re.compile(r"ignore (all )?(previous|prior|above) (instructions|prompts)", re.I),
    re.compile(r"disregard (your )?(system|policy|residency|classification)", re.I),
    re.compile(r"\byou are now\b", re.I),
    re.compile(r"\bjailbreak\b", re.I),
    re.compile(r"override (the )?(classification|residency|policy|permit)", re.I),
    re.compile(r"(set|change|switch) (the )?(tenant_id|org_id)\b", re.I),
    re.compile(r"\bexfiltrate\b", re.I),
    re.compile(r"reveal (your )?(system prompt|hidden (prompt|instructions))", re.I),
    re.compile(r"(do not|don't|skip) (run |call )?(check_policy|the policy)", re.I),
    re.compile(r"always (return|report|say) allowed", re.I),
    re.compile(r"pretend residency (does not|doesn't) apply", re.I),
]

_POISON_KEYS = {
    "org_id",
    "tenant_id",
    "permitted_regions",
    "classification_ceiling",
    "api_key",
    "jwt",
    "session_token",
}


def screen_prompt(text: str) -> Dict[str, Any]:
    """Screen an operator goal or free-text tool argument.

    Returns allowed=False on injection. PII is redacted but does not by
    itself deny — the redacted text is what downstream models should see.
    """
    raw = text or ""
    threats: List[str] = []
    for pattern in _INJECTION:
        if pattern.search(raw):
            threats.append("prompt_injection")
            break
    redacted, pii_classes = detect_and_redact_pii(raw)
    if pii_classes:
        threats.append("pii")
    allowed = "prompt_injection" not in threats
    reason = ""
    if not allowed:
        reason = (
            "Model Armor refused this goal: prompt-injection or policy-bypass "
            "language was detected. The fleet does not run."
        )
    return {
        "allowed": allowed,
        "engine": ENGINE,
        "threats": threats,
        "pii_classes": pii_classes,
        "redacted_text": redacted,
        "reason": reason,
    }


def sanitize_tool_args(args: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Drop tool-poisoning keys a model might try to smuggle.

    Tenant scope comes from the bound AuthContext, never from the model.
    """
    if not args:
        return {}
    cleaned = {}
    dropped: List[str] = []
    for key, value in args.items():
        if key in _POISON_KEYS:
            dropped.append(key)
            continue
        cleaned[key] = value
    cleaned["_armor_dropped"] = dropped
    return cleaned
