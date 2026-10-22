"""Tests for LLM integration, category validation, caching, and fallback behavior."""

import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
import httpx
import pytest

from app.schemas.video import (
    ALLOWED_CATEGORIES,
    FALLBACK_CATEGORIES,
    STANDARD_CATEGORIES,
    ClassificationRequest,
    ClassificationResponse,
)
from app.services.classifier import (
    GeminiClassifier,
    OpenAIClassifier,
    PlaceholderClassifier,
    _create_fallback_response,
)


def test_allowed_categories_definitions():
    """Verify all 12 categories plus unknown are in standard categories and fallback excludes unknown."""
    expected_categories = [
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
    for cat in expected_categories:
        assert cat in STANDARD_CATEGORIES
        assert cat in ALLOWED_CATEGORIES

    assert "unknown" not in FALLBACK_CATEGORIES
    for cat in FALLBACK_CATEGORIES:
        assert cat in STANDARD_CATEGORIES
        assert cat != "unknown"


def test_classification_response_validator_unknown_fallback():
    """Verify that unallowed category strings default cleanly to unknown."""
    resp = ClassificationResponse(
        video_id="test1",
        category="completely_unsupported_category",
        confidence=0.5,
        classifier="test",
    )
    assert resp.category == "unknown"


def test_fallback_response_properties():
    """Verify fallback helper creates safe responses defaulting to gaming and excluding unknown."""
    fb = _create_fallback_response("vid_123", "gemini", "Simulated timeout")
    assert fb.video_id == "vid_123"
    assert fb.is_fallback is True
    assert fb.category == "gaming"
    assert fb.category in FALLBACK_CATEGORIES
    assert fb.category != "unknown"
    assert fb.confidence == 0.1
    assert "fallback" in fb.classifier


def test_gemini_classifier_mock_success():
    """Verify GeminiClassifier parses valid JSON response and caches result."""
    async def _run():
        classifier = GeminiClassifier(api_key="test-api-key", model="gemini-1.5-flash")

        gemini_payload = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": '{"category": "programming_technology", "confidence": 0.95, "reasoning": "Python tutorial"}'
                            }
                        ]
                    }
                }
            ]
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = gemini_payload

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            req = ClassificationRequest(
                video_id="py101",
                title="Python Async Programming Tutorial",
                channel_name="Tech Academy",
            )
            res = await classifier.classify(req)

            assert res.video_id == "py101"
            assert res.category == "programming_technology"
            assert res.confidence == 0.95
            assert res.is_fallback is False
            assert "gemini" in res.classifier
            assert mock_post.call_count == 1

            # Verify cached: second call should not invoke httpx.post
            res_cached = await classifier.classify(req)
            assert res_cached.category == "programming_technology"
            assert mock_post.call_count == 1

    asyncio.run(_run())


def test_gemini_classifier_fallback_on_api_error():
    """Verify GeminiClassifier falls back safely when API returns 500 without caching fallback."""
    async def _run():
        classifier = GeminiClassifier(api_key="test-api-key", model="gemini-1.5-flash")

        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.text = "Internal Server Error"

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            req = ClassificationRequest(
                video_id="err_vid_1",
                title="Some Broken Video",
            )
            res = await classifier.classify(req)

            assert res.video_id == "err_vid_1"
            assert res.is_fallback is True
            assert res.category in FALLBACK_CATEGORIES
            assert res.category != "unknown"
            assert classifier.get_cached("err_vid_1") is None

    asyncio.run(_run())


def test_openai_classifier_mock_success():
    """Verify OpenAIClassifier parses valid chat completion JSON."""
    async def _run():
        classifier = OpenAIClassifier(api_key="sk-test", model="gpt-4o-mini")

        openai_payload = {
            "choices": [
                {
                    "message": {
                        "content": '{"category": "health_fitness", "confidence": 0.88, "reasoning": "Workout video"}'
                    }
                }
            ]
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = openai_payload

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            req = ClassificationRequest(
                video_id="fit99",
                title="15 Min Full Body HIIT Workout",
                channel_name="Fitness Club",
            )
            res = await classifier.classify(req)

            assert res.video_id == "fit99"
            assert res.category == "health_fitness"
            assert res.confidence == 0.88
            assert res.is_fallback is False
            assert "openai" in res.classifier

    asyncio.run(_run())


def test_openai_classifier_fallback_on_malformed_json():
    """Verify OpenAIClassifier returns fallback when model returns malformed JSON."""
    async def _run():
        classifier = OpenAIClassifier(api_key="sk-test", model="gpt-4o-mini")

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {"message": {"content": "I am not able to output JSON right now."}}
            ]
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            req = ClassificationRequest(
                video_id="bad_json_vid",
                title="Video With Bad Output",
            )
            res = await classifier.classify(req)

            assert res.video_id == "bad_json_vid"
            assert res.is_fallback is True
            assert res.category in FALLBACK_CATEGORIES
            assert classifier.get_cached("bad_json_vid") is None

    asyncio.run(_run())


def test_concurrent_request_deduplication():
    """Verify that multiple concurrent calls for the same video_id trigger only one execution."""
    async def _run():
        classifier = GeminiClassifier(api_key="test-api-key")

        call_count = 0

        async def mock_post(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.05)  # Simulate network latency
            resp = MagicMock()
            resp.status_code = 200
            resp.json.return_value = {
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {"text": '{"category": "documentaries_explainers", "confidence": 0.9}'}
                            ]
                        }
                    }
                ]
            }
            return resp

        with patch("httpx.AsyncClient.post", side_effect=mock_post):
            req = ClassificationRequest(
                video_id="shared_video_123",
                title="The Deep History of Space Telescopes",
            )
            # Launch 5 concurrent calls for the identical video_id
            results = await asyncio.gather(*(classifier.classify(req) for _ in range(5)))

            assert len(results) == 5
            for r in results:
                assert r.category == "documentaries_explainers"
                assert r.video_id == "shared_video_123"

            # The underlying network call should have executed only once!
            assert call_count == 1

    asyncio.run(_run())


def test_ollama_classifier_initialization_and_mock():
    """Verify Ollama provider configures base_url and calls local endpoint."""
    from app.services.classifier import get_classifier, set_classifier
    from app.config import settings

    orig_provider = settings.LLM_PROVIDER
    try:
        settings.LLM_PROVIDER = "ollama"
        set_classifier(None)
        classifier = get_classifier()

        assert classifier.provider_name == "openai"
        assert "localhost:11434" in classifier.base_url

        async def _run():
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "choices": [
                    {
                        "message": {
                            "content": '{"category": "programming_technology", "confidence": 0.95, "reasoning": "Python tutorial"}'
                        }
                    }
                ]
            }

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_resp
                req = ClassificationRequest(
                    video_id="ollama_py_101",
                    title="Learn Python in 100 Minutes",
                )
                res = await classifier.classify(req)
                assert res.video_id == "ollama_py_101"
                assert res.category == "programming_technology"
                assert res.is_fallback is False

        asyncio.run(_run())
    finally:
        settings.LLM_PROVIDER = orig_provider
        set_classifier(None)

