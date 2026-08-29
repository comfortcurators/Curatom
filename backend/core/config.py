import os
import sys
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_ID: str = os.getenv("PROJECT_ID", "")
    LOCATION: str = os.getenv("LOCATION", "us-central1")
    API_KEY: str = os.getenv("API_KEY", "")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    ENTERPRISE_NAME: str = os.getenv("ENTERPRISE_NAME", "Comfort Curators Fleet")
    # ZeptoMail (Zoho) - optional. Unset means email verification is not
    # sent; registration still succeeds, but the account stays unverified
    # and the frontend is told so honestly rather than claiming an email
    # went out when nothing was configured to send one.
    ZEPTOMAIL_TOKEN: str = os.getenv("ZEPTOMAIL_TOKEN", "")
    ZEPTOMAIL_FROM_ADDRESS: str = os.getenv("ZEPTOMAIL_FROM_ADDRESS", "noreply@comfortcurators.io")
    ZEPTOMAIL_FROM_NAME: str = os.getenv("ZEPTOMAIL_FROM_NAME", "Curatom Enterprise")

    INGESTION_PAGES_LIMIT: int = 5
    GEMINI_CONCURRENCY_LIMIT: int = 10
    # Shared secret Cloud Tasks presents when it calls back into
    # /directory/ingest/execute. That route runs the real ingestion work
    # synchronously inside a genuine incoming request, which is the actual
    # fix for the fire-and-forget-under-cpuIdle problem documented in
    # directory_fetcher.py - not a public route, so it needs its own gate
    # independent of user auth (Cloud Tasks isn't a logged-in user).
    INGESTION_TASK_SECRET: str = os.getenv("INGESTION_TASK_SECRET", "")
    # This service's own public URL, so it can hand Cloud Tasks a target to
    # call back into. Cloud Run doesn't expose this to the container at
    # runtime, so it's set once as a plain env var rather than guessed from
    # incoming request headers, which a proxy could spoof.
    SERVICE_BASE_URL: str = os.getenv("SERVICE_BASE_URL", "")
    INGESTION_TASKS_QUEUE: str = os.getenv("INGESTION_TASKS_QUEUE", "directory-ingestion")
    FLEET_TASKS_QUEUE: str = os.getenv("FLEET_TASKS_QUEUE", "curatom-fleet-tasks")

settings = Settings()

# Fail closed if required staging/production configuration is absent or trivially weak.
if not settings.JWT_SECRET or len(settings.JWT_SECRET) < 32:
    print("FATAL: JWT_SECRET must be set to a stable value of at least 32 characters")
    sys.exit(1)

if not settings.PROJECT_ID:
    print("FATAL: PROJECT_ID must be set in environment")
    sys.exit(1)

# Two ways to reach Gemini, and inside Google Cloud only one of them needs a
# secret:
#
#   Vertex AI  - authenticates with the runtime service account through
#                Application Default Credentials. On Cloud Run, GKE, or any
#                environment with ADC, no API key exists to leak or rotate,
#                and usage bills to this project. This is the default.
#
#   Developer  - authenticates with a GEMINI API key. Needed only outside
#     API      - Google Cloud, or when deliberately billing a key rather
#                than the project.
#
# USE_VERTEX_AI defaults to true when no API_KEY is provided, so a Cloud Run
# deployment works with zero Gemini secrets. Setting API_KEY switches to the
# Developer API unless USE_VERTEX_AI is explicitly forced on.
USE_VERTEX_AI: bool = os.getenv(
    "USE_VERTEX_AI", "false" if settings.API_KEY else "true"
).lower() in ("1", "true", "yes")

if not USE_VERTEX_AI and not settings.API_KEY:
    print(
        "FATAL: set API_KEY, or leave it unset to use Vertex AI with "
        "Application Default Credentials"
    )
    sys.exit(1)


def build_genai_client():
    """
    Construct the Gemini client for the configured auth mode.

    Vertex AI mode requires no key: credentials come from the environment's
    service account. Developer API mode uses settings.API_KEY.
    """
    from google import genai

    if USE_VERTEX_AI:
        # "global", not settings.LOCATION - gemini-3.5-flash returns 404
        # ("not found or your project does not have access to it") on every
        # regional Vertex AI endpoint checked (us-central1, us-east5,
        # us-east1, europe-west4, us-west1); only the global endpoint serves
        # it. Verified live against this project, including that
        # gemini-embedding-001 also works correctly under "global" (768-dim
        # output unchanged), so this is safe for every call this client
        # makes, not just generation. settings.LOCATION stays a real region
        # for Cloud Tasks (task_queue.py) - that's a separate concern, not
        # coupled to where Gemini itself is reachable.
        return genai.Client(
            vertexai=True,
            project=settings.PROJECT_ID,
            location="global",
        )
    return genai.Client(
        api_key=settings.API_KEY, http_options={"api_version": "v1beta1"}
    )
