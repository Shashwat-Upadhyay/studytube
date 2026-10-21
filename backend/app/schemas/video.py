"""Pydantic schemas for video classification requests and responses."""

from typing import Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict


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
    suggested_mode: str = Field(..., description="Suggested playback mode: 'grayscale' or 'color'.")
    classifier: str = Field(..., description="Identifier of the classifier model or service used.")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "video_id": "example123",
                "category": "unknown",
                "confidence": 0.0,
                "suggested_mode": "grayscale",
                "classifier": "placeholder",
            }
        }
    )
