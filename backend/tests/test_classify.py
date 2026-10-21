"""Unit tests for video classification endpoint and validation."""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.video import ClassificationRequest, ClassificationResponse
from app.services.classifier import BaseClassifier, get_classifier

client = TestClient(app)


def test_classify_valid_full_payload():
    """Verify POST /api/v1/classify with all fields returns placeholder response."""
    payload = {
        "video_id": "example123",
        "title": "Introduction to Machine Learning",
        "channel_name": "Example Learning",
        "url": "https://www.youtube.com/watch?v=example123",
    }
    response = client.post("/api/v1/classify", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["video_id"] == "example123"
    assert data["category"] == "unknown"
    assert data["confidence"] == 0.0
    assert data["suggested_mode"] == "grayscale"
    assert data["classifier"] == "placeholder"


def test_classify_valid_required_fields_only():
    """Verify POST /api/v1/classify works with only video_id and title."""
    payload = {
        "video_id": "xyz789",
        "title": "Calculus 1 Full Course",
    }
    response = client.post("/api/v1/classify", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["video_id"] == "xyz789"
    assert data["category"] == "unknown"
    assert data["confidence"] == 0.0
    assert data["suggested_mode"] == "grayscale"
    assert data["classifier"] == "placeholder"


def test_classify_missing_title_rejected():
    """Verify request missing title is rejected with 422."""
    payload = {
        "video_id": "example123",
    }
    response = client.post("/api/v1/classify", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert "errors" in data
    assert any(err["field"] == "title" for err in data["errors"])


def test_classify_blank_whitespace_title_rejected():
    """Verify request with whitespace-only title is rejected with 422."""
    payload = {
        "video_id": "example123",
        "title": "    \t \n  ",
    }
    response = client.post("/api/v1/classify", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert any("title" in err["field"] for err in data["errors"])


def test_classify_missing_video_id_rejected():
    """Verify request missing video_id is rejected with 422."""
    payload = {
        "title": "Valid Title Here",
    }
    response = client.post("/api/v1/classify", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert any("video_id" in err["field"] for err in data["errors"])


def test_classify_blank_whitespace_video_id_rejected():
    """Verify request with whitespace-only video_id is rejected with 422."""
    payload = {
        "video_id": "    ",
        "title": "Valid Title Here",
    }
    response = client.post("/api/v1/classify", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert any("video_id" in err["field"] for err in data["errors"])


def test_classify_title_exceeding_max_length_rejected():
    """Verify title over 500 characters is rejected with 422."""
    payload = {
        "video_id": "abc123",
        "title": "A" * 501,
    }
    response = client.post("/api/v1/classify", json=payload)
    assert response.status_code == 422


def test_classify_video_id_exceeding_max_length_rejected():
    """Verify video_id over 64 characters is rejected with 422."""
    payload = {
        "video_id": "V" * 65,
        "title": "Short Title",
    }
    response = client.post("/api/v1/classify", json=payload)
    assert response.status_code == 422


def test_classify_malformed_json_body():
    """Verify malformed payload returns 422 instead of crashing."""
    response = client.post(
        "/api/v1/classify",
        content="not-a-valid-json",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422


def test_cors_preflight_for_chrome_extension():
    """Verify CORS preflight OPTIONS request for Chrome extension origin."""
    extension_origin = "chrome-extension://abcdefghijklmnop"
    response = client.options(
        "/api/v1/classify",
        headers={
            "Origin": extension_origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == extension_origin
    assert "POST" in response.headers.get("access-control-allow-methods", "")


def test_classifier_service_replacement():
    """Verify that replacing the classifier service (e.g. with an LLM service) works seamlessly."""
    class MockLLMClassifier(BaseClassifier):
        async def classify(self, request: ClassificationRequest) -> ClassificationResponse:
            return ClassificationResponse(
                video_id=request.video_id,
                category="educational",
                confidence=0.95,
                suggested_mode="color",
                classifier="mock-llm-v1",
            )

    # Use FastAPI dependency override to swap classifier
    app.dependency_overrides[get_classifier] = lambda: MockLLMClassifier()
    try:
        response = client.post(
            "/api/v1/classify",
            json={"video_id": "math101", "title": "Linear Algebra Lecture 1"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "educational"
        assert data["confidence"] == 0.95
        assert data["suggested_mode"] == "color"
        assert data["classifier"] == "mock-llm-v1"
    finally:
        app.dependency_overrides.clear()
