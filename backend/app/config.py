"""Application configuration module using Pydantic Settings."""

from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://www.youtube.com",
        "https://youtube.com",
    ]
    # Allow matching unpacked chrome-extension:// origins
    CORS_ALLOW_EXTENSION_REGEX: bool = True

    # Future LLM configuration placeholders
    LLM_PROVIDER: str = "placeholder"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "placeholder-model"

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
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )


settings = Settings()
