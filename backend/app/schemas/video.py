"""Pydantic schemas for video classification requests and responses."""

from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict

# Standard StudyTube categories per specification
STANDARD_CATEGORIES: List[str] = [
    "education_academics",
    "programming_technology",
    "career_business",
    "productivity_self_improvement",
    "health_fitness",
    "news_current_affairs",
    "documentaries_explainers",
    "gaming",
    "entertainment_comedy",
    "music",
    "lifestyle_vlogs",
    "hobbies_creative_arts",
    "unknown",
]

# ALLOWED_CATEGORIES includes backward-compatible mock categories like "educational"
ALLOWED_CATEGORIES: List[str] = STANDARD_CATEGORIES + ["educational"]

# Random fallback categories must exclude "unknown" per specification
FALLBACK_CATEGORIES: List[str] = [
    cat for cat in STANDARD_CATEGORIES if cat != "unknown"
]


class ClassificationRequest(BaseModel):
    """Payload sent by Chrome extension or client to classify a YouTube video."""

    video_id: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Unique YouTube Video identifier (e.g. dQw4w9WgXcQ).",
        examples=["example123"],
    )
    title: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Title of the YouTube video.",
        examples=["Introduction to Machine Learning"],
    )
    channel_name: Optional[str] = Field(
        default=None,
        max_length=255,
        description="Name of the YouTube channel uploading the video.",
        examples=["Example Learning"],
    )
    url: Optional[str] = Field(
        default=None,
        max_length=2048,
        description="Full URL of the YouTube video.",
        examples=["https://www.youtube.com/watch?v=example123"],
    )

    @field_validator("video_id")
    @classmethod
    def validate_video_id(cls, v: str) -> str:
        stripped = v.strip() if isinstance(v, str) else ""
        if not stripped:
            raise ValueError("video_id cannot be empty or blank whitespace")
        return stripped

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        stripped = v.strip() if isinstance(v, str) else ""
        if not stripped:
            raise ValueError("title cannot be empty or blank whitespace")
        return stripped

    @field_validator("channel_name", "url")
    @classmethod
    def clean_optional_fields(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            stripped = v.strip()
            return stripped if stripped else None
        return None

    model_config = ConfigDict(
        str_strip_whitespace=True,
        json_schema_extra={
            "example": {
                "video_id": "example123",
                "title": "Introduction to Machine Learning",
                "channel_name": "Example Learning",
                "url": "https://www.youtube.com/watch?v=example123",
            }
        },
    )


class ClassificationResponse(BaseModel):
    """Classification response returned to Chrome extension."""

    video_id: str = Field(..., description="The classified YouTube video ID.")
    category: str = Field(..., description="Predicted educational/entertainment category.")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score between 0.0 and 1.0.")
    suggested_mode: str = Field(default="grayscale", description="Suggested playback mode: 'grayscale' or 'color'.")
    classifier: str = Field(..., description="Identifier of the classifier model or service used.")
    is_fallback: bool = Field(default=False, description="Whether this response was generated via failure fallback.")

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        clean = v.strip().lower() if isinstance(v, str) else "unknown"
        if clean not in ALLOWED_CATEGORIES:
            return "unknown"
        return clean

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "video_id": "example123",
                "category": "education_academics",
                "confidence": 0.95,
                "suggested_mode": "grayscale",
                "classifier": "gemini:gemini-1.5-flash",
                "is_fallback": False,
            }
        }
    )
