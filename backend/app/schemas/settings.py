"""Pydantic schemas for StudyTube configuration settings."""

from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


class SettingsPayload(BaseModel):
    """Configuration settings synchronized between extension, backend, and dashboard."""

    studytube_enabled: bool = Field(default=True, description="Master toggle for StudyTube focus mode.")
    whitelisted_categories: List[str] = Field(
        default_factory=lambda: [
            "education_academics",
            "programming_technology",
            "career_business",
            "productivity_self_improvement",
            "health_fitness",
            "documentaries_explainers",
        ],
        description="List of whitelisted category IDs allowed to play in grayscale.",
    )
    block_shorts_scroll: bool = Field(default=True, description="Block scrolling on YouTube Shorts.")
    block_shorts_playback: bool = Field(default=True, description="Block playback of YouTube Shorts completely.")
    hide_comments: bool = Field(default=True, description="Hide YouTube comments section with show button.")
    hide_live_chat: bool = Field(default=True, description="Hide YouTube live stream chat by default.")
    strict_fallback: bool = Field(default=True, description="Blacklist all videos when backend classification falls back.")
    backend_url: str = Field(default="http://127.0.0.1:8000", description="Backend API service URL.")
    updated_at: Optional[str] = Field(default=None, description="ISO timestamp of last settings update.")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "studytube_enabled": True,
                "whitelisted_categories": [
                    "education_academics",
                    "programming_technology",
                    "career_business",
                    "productivity_self_improvement",
                    "health_fitness",
                    "documentaries_explainers",
                ],
                "block_shorts_scroll": True,
                "block_shorts_playback": True,
                "hide_comments": True,
                "hide_live_chat": True,
                "strict_fallback": True,
                "backend_url": "http://127.0.0.1:8000",
            }
        }
    )
