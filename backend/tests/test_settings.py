"""Tests for StudyTube Settings configuration API."""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_get_settings_default():
    """Verify default settings can be fetched successfully."""
    response = client.get("/api/v1/settings")
    assert response.status_code == 200
    data = response.json()
    assert "studytube_enabled" in data
    assert "whitelisted_categories" in data
    assert "block_shorts_scroll" in data
    assert "block_shorts_playback" in data
    assert "hide_comments" in data
    assert "hide_live_chat" in data
    assert isinstance(data["whitelisted_categories"], list)


def test_update_settings():
    """Verify settings can be updated and retrieved."""
    new_settings = {
        "studytube_enabled": True,
        "whitelisted_categories": ["programming_technology", "career_business"],
        "block_shorts_scroll": True,
        "block_shorts_playback": True,
        "hide_comments": True,
        "hide_live_chat": True,
        "strict_fallback": True,
        "backend_url": "http://127.0.0.1:8000",
    }
    post_res = client.post("/api/v1/settings", json=new_settings)
    assert post_res.status_code == 200
    post_data = post_res.json()
    assert post_data["whitelisted_categories"] == ["programming_technology", "career_business"]
    assert post_data["hide_comments"] is True

    # Verify GET reflects the update
    get_res = client.get("/api/v1/settings")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["whitelisted_categories"] == ["programming_technology", "career_business"]


def test_dashboard_endpoint():
    """Verify frontend static dashboard is mounted and served at /dashboard."""
    response = client.get("/dashboard/")
    assert response.status_code == 200
    assert "StudyTube" in response.text
    assert "Command Center" in response.text

