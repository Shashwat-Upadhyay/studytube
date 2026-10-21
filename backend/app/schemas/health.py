"""Pydantic schemas for health check endpoint."""

from datetime import datetime, timezone
from pydantic import BaseModel, Field, ConfigDict


class HealthResponse(BaseModel):
    """Health status response."""

    status: str = Field(default="healthy", description="Current health status of the service.")
    version: str = Field(..., description="Application version.")
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Current server timestamp in UTC.",
    )
    environment: str = Field(..., description="Running environment (development, production, etc.).")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "healthy",
                "version": "0.1.0",
                "timestamp": "2026-10-21T16:39:14Z",
                "environment": "development",
            }
        }
    )
