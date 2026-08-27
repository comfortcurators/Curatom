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
        return genai.Client(
            vertexai=True,
            project=settings.PROJECT_ID,
            location=settings.LOCATION,
        )
    return genai.Client(
        api_key=settings.API_KEY, http_options={"api_version": "v1beta1"}
    )
