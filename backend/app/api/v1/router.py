"""API v1 router aggregator."""

from fastapi import APIRouter
from app.api.v1.endpoints import classify, health, notes, settings

api_router = APIRouter()

api_router.include_router(
    classify.router,
    tags=["classification"],
)

api_router.include_router(
    health.router,
    tags=["system"],
)

api_router.include_router(
    settings.router,
    tags=["settings"],
)

api_router.include_router(
    notes.router,
    tags=["notes"],
)
