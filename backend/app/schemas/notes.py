"""Pydantic schemas for video timestamped notes."""

from typing import List, Optional, Union
from pydantic import BaseModel, Field, field_validator, ConfigDict


def format_timestamp(seconds: float) -> str:
    """Format total seconds into MM:SS or HH:MM:SS."""
    total_sec = max(0, int(seconds))
    hours = total_sec // 3600
    minutes = (total_sec % 3600) // 60
    sec = total_sec % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{sec:02d}"
    return f"{minutes:02d}:{sec:02d}"


def parse_timestamp_to_seconds(v: Union[int, float, str]) -> float:
    """Parse various timestamp representations into numeric seconds.

    Supports:
      - Raw numbers (75 -> 75.0)
      - Strings with seconds ("75" -> 75.0)
      - MM:SS ("01:15" -> 75.0)
      - HH:MM:SS ("1:02:15" -> 3735.0)
    """
    if isinstance(v, (int, float)):
        return max(0.0, float(v))

    if isinstance(v, str):
        cleaned = v.strip()
        if not cleaned:
            return 0.0

        # If it contains colons like "01:23" or "1:02:05"
        if ":" in cleaned:
            parts = cleaned.split(":")
            try:
                if len(parts) == 2:
                    m, s = int(parts[0]), float(parts[1])
                    return max(0.0, float(m * 60 + s))
                elif len(parts) == 3:
                    h, m, s = int(parts[0]), int(parts[1]), float(parts[2])
                    return max(0.0, float(h * 3600 + m * 60 + s))
            except (ValueError, TypeError):
                return 0.0

        # If it's a numeric string like "120" or "120.5"
        try:
            return max(0.0, float(cleaned))
        except (ValueError, TypeError):
            return 0.0

    return 0.0


class NoteCreate(BaseModel):
    """Payload to create a new timestamped note."""

    url: str = Field(..., min_length=1, max_length=2048, description="YouTube video URL or video ID")
    timestamp: Union[int, float, str] = Field(
        ...,
        description="Timestamp in seconds or formatted string (e.g. 75, '75', '01:15', '1:02:15')",
        examples=[75, "01:15"],
    )
    content: str = Field(..., min_length=1, max_length=10000, description="Note body text")
    title: Optional[str] = Field(default=None, max_length=500, description="Optional video title override")
    thumbnail_url: Optional[str] = Field(default=None, max_length=2048, description="Optional thumbnail URL override")

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        stripped = v.strip() if isinstance(v, str) else ""
        if not stripped:
            raise ValueError("Note content cannot be empty or blank")
        return stripped

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        stripped = v.strip() if isinstance(v, str) else ""
        if not stripped:
            raise ValueError("Video URL cannot be empty or blank")
        return stripped

    model_config = ConfigDict(
        str_strip_whitespace=True,
        json_schema_extra={
            "example": {
                "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "timestamp": "01:23",
                "content": "Key formula discussed at this step of the lecture.",
                "title": "Introduction to Machine Learning",
            }
        },
    )


class NoteResponse(BaseModel):
    """Timestamped note response."""

    id: int = Field(..., description="Unique database identifier for the note")
    video_id: str = Field(..., description="Unique YouTube video ID")
    video_url: str = Field(..., description="Canonical YouTube video URL")
    video_title: str = Field(..., description="Title of the video")
    thumbnail_url: str = Field(..., description="Thumbnail image URL for the video")
    timestamp_seconds: float = Field(..., ge=0.0, description="Timestamp position in seconds")
    timestamp_formatted: str = Field(..., description="Formatted timestamp (e.g. 01:23 or 1:02:15)")
    content: str = Field(..., description="Note text content")
    created_at: str = Field(..., description="Creation ISO datetime string")
    updated_at: str = Field(..., description="Last updated ISO datetime string")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": 1,
                "video_id": "dQw4w9WgXcQ",
                "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "video_title": "Introduction to Machine Learning",
                "thumbnail_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
                "timestamp_seconds": 83.0,
                "timestamp_formatted": "01:23",
                "content": "Key formula discussed at this step of the lecture.",
                "created_at": "2026-10-24T19:45:00Z",
                "updated_at": "2026-10-24T19:45:00Z",
            }
        }
    )


class VideoGroupResponse(BaseModel):
    """Group of notes aggregated by video for the frontend notes window."""

    video_id: str = Field(..., description="Unique YouTube video ID")
    video_url: str = Field(..., description="Canonical YouTube video URL")
    video_title: str = Field(..., description="Title of the video")
    thumbnail_url: str = Field(..., description="Thumbnail image URL")
    notes_count: int = Field(..., ge=0, description="Total count of notes for this video")
    latest_note_at: Optional[str] = Field(default=None, description="ISO timestamp of latest note")
    notes: List[NoteResponse] = Field(default_factory=list, description="List of notes for this video")
