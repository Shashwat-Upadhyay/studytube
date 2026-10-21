"""API v1 router aggregator."""

from fastapi import APIRouter
from app.api.v1.endpoints import classify, health

api_router = APIRouter()

api_router.include_router(
    classify.router,
    tags=["classification"],
)

api_router.include_router(
    health.router,
    tags=["system"],
)
