"""Tests for StudyTube SQLite notes taking service and endpoints."""

import os
import tempfile
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.notes_service import SQLiteNotesService, extract_video_id, parse_timestamp_to_seconds, format_timestamp
from app.schemas.notes import NoteCreate

client = TestClient(app)


def test_timestamp_parser_and_formatter():
    """Verify timestamp parsing and formatting utilities."""
    assert parse_timestamp_to_seconds(0) == 0.0
    assert parse_timestamp_to_seconds(75) == 75.0
    assert parse_timestamp_to_seconds(75.5) == 75.5
    assert parse_timestamp_to_seconds("75") == 75.0
    assert parse_timestamp_to_seconds("01:15") == 75.0
    assert parse_timestamp_to_seconds("02:05") == 125.0
    assert parse_timestamp_to_seconds("1:02:05") == 3725.0

    assert format_timestamp(0) == "00:00"
    assert format_timestamp(75) == "01:15"
    assert format_timestamp(125) == "02:05"
    assert format_timestamp(3725) == "1:02:05"


def test_extract_video_id():
    """Verify video ID extraction across YouTube URL formats."""
    assert extract_video_id("dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s") == "dQw4w9WgXcQ"
    assert extract_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://www.youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"


def test_sqlite_notes_service_isolated():
    """Test SQLiteNotesService independently with a temporary database."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_notes.db")
        service = SQLiteNotesService(db_path=db_path)

        # 1. Create a note
        note1 = service.create_note(
            NoteCreate(
                url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                timestamp="01:30",
                content="Note at 1m30s",
                title="Rick Astley - Never Gonna Give You Up",
            )
        )
        assert note1.id is not None
        assert note1.video_id == "dQw4w9WgXcQ"
        assert note1.timestamp_seconds == 90.0
        assert note1.timestamp_formatted == "01:30"
        assert "Never Gonna Give You Up" in note1.video_title
        assert "hqdefault.jpg" in note1.thumbnail_url

        # 2. Create another note on same video earlier
        note2 = service.create_note(
            NoteCreate(
                url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                timestamp="00:15",
                content="Intro sequence note",
                title="Rick Astley - Never Gonna Give You Up",
            )
        )
        assert note2.timestamp_seconds == 15.0

        # 3. Create a note on a second video
        note3 = service.create_note(
            NoteCreate(
                url="https://www.youtube.com/watch?v=kqtD5dpn9C8",
                timestamp=120,
                content="Python basics tutorial point",
                title="Python Tutorial",
            )
        )
        assert note3.video_id == "kqtD5dpn9C8"

        # 4. Query notes for video 1 (should be sorted by timestamp_seconds ASC)
        v1_notes = service.get_notes(video_id="dQw4w9WgXcQ")
        assert len(v1_notes) == 2
        assert v1_notes[0].timestamp_seconds == 15.0
        assert v1_notes[1].timestamp_seconds == 90.0

        # 5. Query video grouped notes
        groups = service.get_video_grouped_notes()
        assert len(groups) == 2
        group_v1 = next(g for g in groups if g.video_id == "dQw4w9WgXcQ")
        assert group_v1.notes_count == 2
        assert len(group_v1.notes) == 2
        assert group_v1.notes[0].id == note2.id

        # 6. Delete a single note
        deleted = service.delete_note(note1.id)
        assert deleted is True
        assert service.get_note_by_id(note1.id) is None
        assert len(service.get_notes(video_id="dQw4w9WgXcQ")) == 1

        # 7. Delete all notes for video 2
        deleted_count = service.delete_notes_for_video("kqtD5dpn9C8")
        assert deleted_count == 1
        assert len(service.get_notes(video_id="kqtD5dpn9C8")) == 0


def test_api_create_and_fetch_notes():
    """Test API endpoints for creating, retrieving, and grouping notes."""
    payload = {
        "url": "https://www.youtube.com/watch?v=testvid1234",
        "timestamp": "02:15",
        "content": "Test note via API",
        "title": "API Test Video Lecture",
    }
    # Create note
    resp = client.post("/api/v1/notes", json=payload)
    assert resp.status_code == 201
    created = resp.json()
    note_id = created["id"]
    assert created["video_id"] == "testvid1234"
    assert created["timestamp_seconds"] == 135.0
    assert created["timestamp_formatted"] == "02:15"
    assert created["video_title"] == "API Test Video Lecture"

    # Fetch notes for this video
    resp_list = client.get("/api/v1/notes", params={"video_id": "testvid1234"})
    assert resp_list.status_code == 200
    notes = resp_list.json()
    assert any(n["id"] == note_id for n in notes)

    # Fetch video-grouped notes
    resp_groups = client.get("/api/v1/notes/videos")
    assert resp_groups.status_code == 200
    groups = resp_groups.json()
    test_group = next((g for g in groups if g["video_id"] == "testvid1234"), None)
    assert test_group is not None
    assert test_group["notes_count"] >= 1

    # Fetch single note
    resp_single = client.get(f"/api/v1/notes/{note_id}")
    assert resp_single.status_code == 200
    assert resp_single.json()["id"] == note_id

    # Delete note
    resp_delete = client.delete(f"/api/v1/notes/{note_id}")
    assert resp_delete.status_code == 200
    assert resp_delete.json()["success"] is True

    # Confirm 404 after deletion
    resp_check = client.get(f"/api/v1/notes/{note_id}")
    assert resp_check.status_code == 404


def test_api_validation_errors():
    """Test validation errors for empty content or missing fields."""
    # Blank content
    resp = client.post("/api/v1/notes", json={"url": "https://youtube.com/watch?v=123", "timestamp": 10, "content": "   "})
    assert resp.status_code == 422

    # Blank URL
    resp = client.post("/api/v1/notes", json={"url": "", "timestamp": 10, "content": "Valid content"})
    assert resp.status_code == 422
