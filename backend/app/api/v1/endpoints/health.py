"""Health check endpoint."""

from fastapi import APIRouter, status
from app.config import settings
from app.schemas.health import HealthResponse

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Health Check",
    description="Returns the operational status, version, and environment of the API.",
)
async def health_check() -> HealthResponse:
    """Report whether the API service is running."""
    return HealthResponse(
        status="healthy",
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
    )
