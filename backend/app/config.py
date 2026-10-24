"""Application configuration module using Pydantic Settings."""

from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


from pathlib import Path
_BACKEND_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    """Central configuration for StudyTube backend."""

    PROJECT_NAME: str = "StudyTube API"
    VERSION: str = "0.1.0"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    # CORS configuration
    CORS_ORIGINS: Union[str, List[str]] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://www.youtube.com",
        "https://youtube.com",
    ]
    # Allow matching unpacked chrome-extension:// origins
    CORS_ALLOW_EXTENSION_REGEX: bool = True

    # LLM Configuration
    # Supported providers: "placeholder", "gemini", "openai", "ollama"
    LLM_PROVIDER: str = "placeholder"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "gemini-1.5-flash"
    LLM_BASE_URL: Union[str, None] = None
    LLM_TIMEOUT_SECONDS: float = 5.0
    LLM_FALLBACK_DEFAULT: str = "gaming"
    CACHE_SIZE: int = 1000
    # SQLite Database Cache Configuration (1GB default max size)
    SQLITE_CACHE_DB_PATH: str = str(_BACKEND_DIR / "data" / "classification_cache.db")
    SQLITE_CACHE_MAX_BYTES: int = 1 * 1024 * 1024 * 1024  # 1 GB in bytes
    # SQLite Notes Database Configuration
    SQLITE_NOTES_DB_PATH: str = str(_BACKEND_DIR / "data" / "notes.db")

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        """Parse comma-separated string or list into a list of origins."""
        if isinstance(v, str):
            if v.strip().startswith("[") and v.strip().endswith("]"):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [item.strip() for item in v.split(",") if item.strip()]
        elif isinstance(v, list):
            return [str(item).strip() for item in v if str(item).strip()]
        return []

    model_config = SettingsConfigDict(
        env_file=(str(_BACKEND_DIR / ".env"), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )


settings = Settings()

