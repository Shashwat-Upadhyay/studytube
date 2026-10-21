"""Classifier services and abstraction layer for StudyTube.

This module provides an extensible interface for video classification.
Currently, it implements a PlaceholderClassifier. Future LLM implementations
(e.g., Gemini, OpenAI, Claude) can inherit from BaseClassifier without
changing API routes or contract definitions.
"""

from abc import ABC, abstractmethod
from app.config import settings
from app.schemas.video import ClassificationRequest, ClassificationResponse


class BaseClassifier(ABC):
    """Abstract base classifier interface."""

    @abstractmethod
    async def classify(self, request: ClassificationRequest) -> ClassificationResponse:
        """Classify a video based on metadata.

        Args:
            request: Video metadata including video_id, title, channel_name, url.

        Returns:
            ClassificationResponse with predicted category, confidence, and suggested playback mode.
        """
        pass


class PlaceholderClassifier(BaseClassifier):
    """Initial placeholder classifier returning predefined default categories.

    Used prior to LLM service integration to validate end-to-end connectivity.
    """

    async def classify(self, request: ClassificationRequest) -> ClassificationResponse:
        """Return a structured placeholder classification response."""
        return ClassificationResponse(
            video_id=request.video_id,
            category="unknown",
            confidence=0.0,
            suggested_mode="grayscale",
            classifier="placeholder",
        )


def get_classifier() -> BaseClassifier:
    """Dependency injection factory for video classifiers.

    Selects the active classifier implementation based on configuration.
    To connect an LLM service later:
      1. Create a subclass of BaseClassifier (e.g. LLMClassifier)
      2. Return it here when settings.LLM_PROVIDER != 'placeholder'
    """
    # When integrating an LLM in the future:
    # if settings.LLM_PROVIDER in ("gemini", "openai", "anthropic"):
    #     return LLMClassifier(api_key=settings.LLM_API_KEY, model=settings.LLM_MODEL)

    return PlaceholderClassifier()
