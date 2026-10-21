"""Video classification route."""

from fastapi import APIRouter, Depends, status
from app.schemas.video import ClassificationRequest, ClassificationResponse
from app.services.classifier import BaseClassifier, get_classifier

router = APIRouter()


@router.post(
    "/classify",
    response_model=ClassificationResponse,
    status_code=status.HTTP_200_OK,
    summary="Classify a YouTube Video",
    description="Validates video metadata and returns classification details and suggested display mode.",
)
async def classify_video(
    payload: ClassificationRequest,
    classifier: BaseClassifier = Depends(get_classifier),
) -> ClassificationResponse:
    """Classify video metadata using the configured classifier service."""
    return await classifier.classify(payload)
