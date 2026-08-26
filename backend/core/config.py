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

    INGESTION_PAGES_LIMIT: int = 5
    GEMINI_CONCURRENCY_LIMIT: int = 10

settings = Settings()

# Fail closed if required staging/production configuration is absent or trivially weak.
if not settings.JWT_SECRET or len(settings.JWT_SECRET) < 32:
    print("FATAL: JWT_SECRET must be set to a stable value of at least 32 characters")
    sys.exit(1)

if not settings.API_KEY:
    print("FATAL: API_KEY must be set in environment")
    sys.exit(1)

if not settings.PROJECT_ID:
    print("FATAL: PROJECT_ID must be set in environment")
    sys.exit(1)
