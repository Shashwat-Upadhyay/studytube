"""Unit tests for health check endpoints."""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root_health_endpoint():
    """Verify GET /health returns 200 with healthy status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data
    assert "timestamp" in data
    assert "environment" in data


def test_api_v1_health_endpoint():
    """Verify GET /api/v1/health returns 200 with healthy status."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data


def test_openapi_docs_endpoint():
    """Verify GET /docs and /openapi.json are accessible."""
    response = client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    assert "paths" in schema
    assert "/health" in schema["paths"]
    assert "/api/v1/classify" in schema["paths"]
