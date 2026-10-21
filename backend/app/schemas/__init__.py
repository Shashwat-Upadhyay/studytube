"""Schemas package export."""

from app.schemas.video import ClassificationRequest, ClassificationResponse
from app.schemas.health import HealthResponse

__all__ = [
    "ClassificationRequest",
    "ClassificationResponse",
    "HealthResponse",
]
