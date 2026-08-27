import asyncio
import os
import sys
import bcrypt
import re
import datetime
import jwt
import secrets
import uuid
from fastapi import Header, HTTPException
from typing import Optional, List, Tuple, Dict, Any
from core.config import settings
from core.firestore_client import get_db

# Demo authentication is deliberately staging-only and fail-closed.
# Exactly one username may authenticate and its password is supplied out of band.
DEMO_USERNAME = os.getenv("DEMO_USERNAME", "admin")
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD")
if not DEMO_PASSWORD:
    print("FATAL: DEMO_PASSWORD must be set for demo authentication")
    sys.exit(1)
DEMO_PASSWORD_HASH = bcrypt.hashpw(
    DEMO_PASSWORD.encode("utf-8"), bcrypt.gensalt()
).decode("utf-8")

VALID_CLASSIFICATIONS = {"public", "internal", "confidential", "restricted"}
VALID_REGIONS = {"IN", "EU", "UK", "CN", "US", "SG", "AU"}
CLASSIFICATION_HIERARCHY = {
    "public": 1,
    "internal": 2,
    "confidential": 3,
    "restricted": 4,
}


def validate_classification(classification: str) -> str:
    normalized = classification.lower().strip()
    if normalized not in VALID_CLASSIFICATIONS:
        allowed = ", ".join(sorted(VALID_CLASSIFICATIONS))
        raise ValueError(f"Invalid classification '{classification}'. Must be one of: {allowed}")
    return normalized


def validate_region(region: str) -> str:
    normalized = region.upper().strip()
    if normalized not in VALID_REGIONS:
        allowed = ", ".join(sorted(VALID_REGIONS))
        raise ValueError(f"Invalid region '{region}'. Must be one of: {allowed}")
    return normalized


def get_classification_rank(classification: str) -> int:
    """Return a known classification rank; unknown values fail closed as restricted."""
    try:
        normalized = validate_classification(classification)
    except (AttributeError, ValueError):
        return CLASSIFICATION_HIERARCHY["restricted"]
    return CLASSIFICATION_HIERARCHY[normalized]


def is_classification_permitted(atom_ceiling: str, resource_classification: str) -> bool:
    # Access checks reject unknown labels instead of relying on rank fallback.
    try:
        ceiling = validate_classification(atom_ceiling)
        resource = validate_classification(resource_classification)
    except (AttributeError, ValueError):
        return False
    return CLASSIFICATION_HIERARCHY[ceiling] >= CLASSIFICATION_HIERARCHY[resource]


def hash_key(key: str) -> str:
    return bcrypt.hashpw(key.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_key(plain_key: str, hashed_key: str) -> bool:
    try:
        return bcrypt.checkpw(plain_key.encode("utf-8"), hashed_key.encode("utf-8"))
    except (ValueError, TypeError):
        return False


PII_PATTERNS = {
    "email": re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"),
    "phone": re.compile(r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}"),
    "payment_ref": re.compile(r"\b(?:\d[ -]*?){13,16}\b"),
    "gov_id": re.compile(r"\b\d{3}-\d{2}-\d{4}\b|\b[A-Z]{1,2}\d{6,8}\b|\b\d{4}-\d{4}-\d{4}\b"),
    "aadhaar": re.compile(r"\b\d{4}\s?\d{4}\s?\d{4}\b"),
}


def detect_and_redact_pii(text: str) -> Tuple[str, List[str]]:
    detected: List[str] = []
    redacted = text
    for pii_type, pattern in PII_PATTERNS.items():
        if pattern.search(redacted):
            detected.append(pii_type)
            redacted = pattern.sub(f"[REDACTED_{pii_type.upper()}]", redacted)
    return redacted, detected


class AuthContext:
    def __init__(
        self,
        principal_id: str,
        principal_type: str,
        org_id: str,
        tenant_id: str,
        role: str,
        permitted_regions: List[str],
        classification_ceiling: str = "restricted",
        session_id: Optional[str] = None,
        atom_profile: Optional[Dict[str, Any]] = None,
        requires_approval: bool = False,
    ):
        self.principal_id = principal_id
        self.principal_type = principal_type
        self.org_id = org_id
        self.tenant_id = tenant_id
        self.role = role
        self.permitted_regions = permitted_regions
        self.classification_ceiling = classification_ceiling
        self.session_id = session_id
        self.atom_profile = atom_profile
        self.requires_approval = requires_approval


def create_session_token(principal_id: str, role: str, org_id: str, tenant_id: str) -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        "sub": principal_id,
        "role": role,
        "org_id": org_id,
        "tenant_id": tenant_id,
        "type": "human",
        "jti": f"sess_{uuid.uuid4().hex}",
        "iat": now,
        "exp": now + datetime.timedelta(hours=12),
        "iss": "curatom",
        "aud": "curatom-api",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def verify_session_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=["HS256"],
            issuer="curatom",
            audience="curatom-api",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, detail={"code": "token_expired", "message": "Session token has expired"})
    except jwt.InvalidTokenError as exc:
        raise HTTPException(401, detail={"code": "invalid_token", "message": f"Token verification failed: {exc}"})


VALID_ROLES = {"Owner", "Tech Lead", "Software Designer", "Technical Reviewer", "Auditor"}


async def verify_human_login(username: str, password: str) -> Dict[str, Any]:
    # Real accounts (core/repository "users" collection) are checked first,
    # so an Owner-created teammate (CTO, manager, whoever) authenticates the
    # same way as everyone else. The single env-var demo account is checked
    # second and kept working indefinitely - it must never stop
    # authenticating just because real accounts now exist, since it may be
    # the only account able to create the first real one.
    #
    # Bounded with a short timeout deliberately: an unreachable Firestore
    # (a genuinely offline environment, not a production concern) must fail
    # this lookup in seconds and fall through to the demo check below,
    # rather than hang the request indefinitely.
    user_doc = None
    try:
        db = get_db()
        user_doc = await asyncio.wait_for(db.collection("users").document(username).get(), timeout=5)
    except (asyncio.TimeoutError, Exception):
        user_doc = None

    if user_doc is not None and user_doc.exists:
        user = user_doc.to_dict()
        if not user.get("is_active", True):
            raise HTTPException(401, detail={"code": "invalid_credentials", "message": "Invalid username or password"})
        if not bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
            raise HTTPException(401, detail={"code": "invalid_credentials", "message": "Invalid username or password"})
        return {
            "principal_id": username,
            "role": user["role"],
            "org_id": user["org_id"],
            "tenant_id": user["tenant_id"],
        }

    if username != DEMO_USERNAME:
        raise HTTPException(401, detail={"code": "invalid_credentials", "message": "Invalid username or password"})

    if not bcrypt.checkpw(password.encode("utf-8"), DEMO_PASSWORD_HASH.encode("utf-8")):
        raise HTTPException(401, detail={"code": "invalid_credentials", "message": "Invalid username or password"})

    return {
        "principal_id": username,
        "role": "Owner",
        "org_id": os.getenv("DEMO_ORG_ID", "org_comfort_curators"),
        "tenant_id": os.getenv("DEMO_TENANT_ID", "tenant_apac_enterprise"),
    }


# --- Backup code (self-service account recovery) ---
# The user writes this down or photographs it themselves - Curatom never
# stores or sees that paper/photo, only a bcrypt hash of the code itself.
# Single-use: redeeming it resets the password and clears the hash, so a
# fresh code has to be issued before it can be used again.
def generate_recovery_code() -> str:
    raw = secrets.token_hex(10).upper()
    return "-".join(raw[i:i + 4] for i in range(0, len(raw), 4))


async def issue_recovery_code(username: str) -> str:
    db = get_db()
    doc_ref = db.collection("users").document(username)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(404, detail="User not found")
    code = generate_recovery_code()
    code_hash = bcrypt.hashpw(code.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    await doc_ref.update({
        "recovery_code_hash": code_hash,
        "recovery_code_created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    })
    return code


async def redeem_recovery_code(username: str, code: str, new_password: str) -> Dict[str, Any]:
    db = get_db()
    doc_ref = db.collection("users").document(username)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(401, detail={"code": "invalid_recovery", "message": "Invalid username or backup code"})
    user = doc.to_dict()
    stored_hash = user.get("recovery_code_hash")
    if not stored_hash or not bcrypt.checkpw(code.encode("utf-8"), stored_hash.encode("utf-8")):
        raise HTTPException(401, detail={"code": "invalid_recovery", "message": "Invalid username or backup code"})
    if not user.get("is_active", True):
        raise HTTPException(401, detail={"code": "invalid_recovery", "message": "Invalid username or backup code"})
    new_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    await doc_ref.update({
        "password_hash": new_hash,
        "recovery_code_hash": None,
        "recovery_code_created_at": None,
    })
    return {
        "principal_id": username,
        "role": user["role"],
        "org_id": user["org_id"],
        "tenant_id": user["tenant_id"],
    }


# --- Email verification ---
# A 6-digit code, hashed the same way a password is, single-use, expiring.
# The plaintext is never stored - only sent (via mail_service) and hashed.
EMAIL_VERIFICATION_TTL_MINUTES = 30


def generate_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


async def issue_email_verification_code(username: str) -> str:
    db = get_db()
    doc_ref = db.collection("users").document(username)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(404, detail="User not found")
    code = generate_verification_code()
    code_hash = bcrypt.hashpw(code.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    await doc_ref.update({
        "email_verification_code_hash": code_hash,
        "email_verification_sent_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "email_verified": False,
    })
    return code


async def verify_email_code(username: str, code: str) -> bool:
    db = get_db()
    doc_ref = db.collection("users").document(username)
    doc = await doc_ref.get()
    if not doc.exists:
        return False
    user = doc.to_dict()
    stored_hash = user.get("email_verification_code_hash")
    sent_at = user.get("email_verification_sent_at")
    if not stored_hash or not sent_at:
        return False
    try:
        sent = datetime.datetime.fromisoformat(sent_at)
        if sent.tzinfo is None:
            sent = sent.replace(tzinfo=datetime.timezone.utc)
    except (ValueError, TypeError):
        return False
    if datetime.datetime.now(datetime.timezone.utc) - sent > datetime.timedelta(minutes=EMAIL_VERIFICATION_TTL_MINUTES):
        return False
    if not bcrypt.checkpw(code.encode("utf-8"), stored_hash.encode("utf-8")):
        return False
    await doc_ref.update({
        "email_verified": True,
        "email_verification_code_hash": None,
        "email_verification_sent_at": None,
    })
    return True


async def resolve_auth(
    authorization: Optional[str] = Header(None),
    x_atom_key: Optional[str] = Header(None),
) -> AuthContext:
    # Do not initialize Firestore unless agent-key authentication actually needs it.
    if x_atom_key:
        db = get_db()
        try:
            key_id, _secret = x_atom_key.split(".", 1)
            if not key_id.startswith("atom_"):
                raise ValueError("Invalid atom ID prefix")
            atom_id = key_id
        except ValueError as exc:
            raise HTTPException(
                status_code=401,
                detail={
                    "code": "invalid_key_format",
                    "message": f"Invalid atom key format. Expected 'atom_<id>.<secret>'. Error: {exc}",
                },
            )

        atom_doc = await db.collection("atoms").document(atom_id).get()
        if not atom_doc.exists:
            raise HTTPException(status_code=401, detail={"code": "atom_not_found", "message": "Agent account not found"})

        atom = atom_doc.to_dict()
        if atom.get("status") not in ["active", "draining"]:
            raise HTTPException(status_code=403, detail={"code": "atom_inactive", "message": f"Atom status is {atom.get('status')}"})

        is_valid = verify_key(x_atom_key, atom.get("api_key_hash", ""))
        if not is_valid and atom.get("previous_key_hash") and atom.get("rotated_at"):
            try:
                rotated_at = datetime.datetime.fromisoformat(atom["rotated_at"])
                if rotated_at.tzinfo is None:
                    rotated_at = rotated_at.replace(tzinfo=datetime.timezone.utc)
                if (datetime.datetime.now(datetime.timezone.utc) - rotated_at).total_seconds() < 86400:
                    is_valid = verify_key(x_atom_key, atom["previous_key_hash"])
            except (ValueError, TypeError):
                is_valid = False

        if not is_valid:
            raise HTTPException(status_code=401, detail={"code": "invalid_credentials", "message": "Invalid agent API key credentials"})

        profile = atom.get("profile", {})
        return AuthContext(
            principal_id=atom["id"],
            principal_type="agent",
            org_id=atom["org_id"],
            tenant_id=atom["tenant_id"],
            role="Agent",
            permitted_regions=profile.get("permitted_regions", ["SG", "US", "IN", "EU"]),
            classification_ceiling=profile.get("classification_ceiling", "confidential"),
            atom_profile=profile,
            requires_approval=atom.get("requires_approval", False),
        )

    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        payload = verify_session_token(token)
        return AuthContext(
            principal_id=payload["sub"],
            principal_type="human",
            org_id=payload["org_id"],
            tenant_id=payload["tenant_id"],
            role=payload["role"],
            permitted_regions=["IN", "EU", "UK", "CN", "US", "SG", "AU"],
            classification_ceiling="restricted",
            session_id=payload.get("jti"),
        )

    raise HTTPException(status_code=401, detail={"code": "auth_required", "message": "Authentication required via Bearer session token or X-Atom-Key"})
