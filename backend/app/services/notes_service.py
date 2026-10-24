"""SQLite-based storage and retrieval service for video timestamped notes."""

from contextlib import contextmanager
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import sqlite3
import threading
from typing import Generator, List, Optional
from urllib.parse import parse_qs, urlparse
import urllib.request
import urllib.error

from app.config import settings
from app.schemas.notes import (
    NoteCreate,
    NoteResponse,
    VideoGroupResponse,
    format_timestamp,
    parse_timestamp_to_seconds,
)

logger = logging.getLogger("studytube-notes-service")


def extract_video_id(url_or_id: str) -> str:
    """Extract standard YouTube 11-char video ID from any YouTube URL or raw ID."""
    if not url_or_id:
        return "unknown"

    raw = url_or_id.strip()

    # If it is already a video ID (alphanumeric, -, _, length 11)
    if len(raw) == 11 and all(c.isalnum() or c in ("-", "_") for c in raw):
        return raw

    try:
        parsed = urlparse(raw)
        # Standard watch URL: /watch?v=...
        if parsed.path in ("/watch", "/watch/"):
            qs = parse_qs(parsed.query)
            v_list = qs.get("v")
            if v_list and v_list[0]:
                return v_list[0].strip()

        # Shorts / live / embed: /shorts/{id}, /live/{id}, /embed/{id}
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) >= 2 and parts[0] in ("shorts", "live", "embed"):
            return parts[1].strip()

        # youtu.be/{id}
        if "youtu.be" in parsed.netloc and parts:
            return parts[0].strip()
    except Exception:
        pass

    # Fallback to alphanumeric token extraction if possible
    import re
    match = re.search(r"[?&]v=([a-zA-Z0-9_-]{11})", raw)
    if match:
        return match.group(1)

    match_short = re.search(r"youtu\.be/([a-zA-Z0-9_-]{11})", raw)
    if match_short:
        return match_short.group(1)

    return raw[:64]


def fetch_youtube_metadata(video_id: str, candidate_title: Optional[str] = None) -> tuple[str, str]:
    """Fetch video title and thumbnail URL.

    Uses YouTube oEmbed endpoint (free, public, no API key required) to fetch
    the official title. Defaults to high-quality thumbnail URL.
    """
    thumbnail_url = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
    fallback_title = (candidate_title or "").strip() or f"YouTube Video {video_id}"

    # If caller already provided a clean custom title other than default placeholder
    if candidate_title and candidate_title.strip() and not candidate_title.strip().startswith("YouTube Video"):
        fallback_title = candidate_title.strip()

    # Attempt oEmbed lookup if valid 11-character video ID
    if len(video_id) == 11:
        oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        try:
            req = urllib.request.Request(
                oembed_url,
                headers={"User-Agent": "StudyTube/1.0 (+https://github.com/swapnilnaik29/studytube)"},
            )
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    fetched_title = data.get("title")
                    if fetched_title and fetched_title.strip():
                        fallback_title = fetched_title.strip()
                    if data.get("thumbnail_url"):
                        thumbnail_url = data.get("thumbnail_url")
        except Exception as err:
            logger.debug("oEmbed title lookup skipped or timed out for %s: %s", video_id, err)

    return fallback_title, thumbnail_url


class SQLiteNotesService:
    """Manages storage, retrieval, and grouping of timestamped notes."""

    def __init__(self, db_path: Optional[str] = None):
        raw_path = db_path or getattr(settings, "SQLITE_NOTES_DB_PATH", "backend/data/notes.db")
        self.db_path = str(Path(raw_path).resolve())
        self._lock = threading.Lock()

        # Ensure parent directory exists
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def _connection(self) -> Generator[sqlite3.Connection, None, None]:
        """Managed SQLite connection with automatic commit and rollback."""
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self) -> None:
        """Create tables and indexes if they do not exist."""
        with self._lock:
            with self._connection() as conn:
                conn.execute("PRAGMA journal_mode = WAL")
                conn.execute("PRAGMA synchronous = NORMAL")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS notes (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        video_id TEXT NOT NULL,
                        video_url TEXT NOT NULL,
                        video_title TEXT NOT NULL,
                        thumbnail_url TEXT NOT NULL,
                        timestamp_seconds REAL NOT NULL,
                        timestamp_formatted TEXT NOT NULL,
                        content TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )
                conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_video_id ON notes (video_id)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_video_time ON notes (video_id, timestamp_seconds)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes (created_at)")

    def create_note(self, payload: NoteCreate) -> NoteResponse:
        """Create and store a new timestamped note."""
        video_id = extract_video_id(payload.url)
        canonical_url = f"https://www.youtube.com/watch?v={video_id}"

        # Fetch / resolve video title and thumbnail
        resolved_title, resolved_thumb = fetch_youtube_metadata(
            video_id=video_id,
            candidate_title=payload.title,
        )
        if payload.thumbnail_url and payload.thumbnail_url.strip():
            resolved_thumb = payload.thumbnail_url.strip()
        if payload.title and payload.title.strip() and not resolved_title:
            resolved_title = payload.title.strip()

        # Compute timestamp values
        seconds = parse_timestamp_to_seconds(payload.timestamp)
        formatted_time = format_timestamp(seconds)

        now_iso = datetime.now(timezone.utc).isoformat()

        with self._lock:
            with self._connection() as conn:
                cursor = conn.execute(
                    """
                    INSERT INTO notes (
                        video_id,
                        video_url,
                        video_title,
                        thumbnail_url,
                        timestamp_seconds,
                        timestamp_formatted,
                        content,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        video_id,
                        canonical_url,
                        resolved_title,
                        resolved_thumb,
                        seconds,
                        formatted_time,
                        payload.content.strip(),
                        now_iso,
                        now_iso,
                    ),
                )
                note_id = cursor.lastrowid

        return NoteResponse(
            id=note_id,
            video_id=video_id,
            video_url=canonical_url,
            video_title=resolved_title,
            thumbnail_url=resolved_thumb,
            timestamp_seconds=seconds,
            timestamp_formatted=formatted_time,
            content=payload.content.strip(),
            created_at=now_iso,
            updated_at=now_iso,
        )

    def get_notes(self, video_id: Optional[str] = None) -> List[NoteResponse]:
        """Retrieve notes, optionally filtered by video_id."""
        with self._connection() as conn:
            if video_id:
                clean_id = extract_video_id(video_id)
                cursor = conn.execute(
                    """
                    SELECT * FROM notes
                    WHERE video_id = ?
                    ORDER BY timestamp_seconds ASC, created_at ASC
                    """,
                    (clean_id,),
                )
            else:
                cursor = conn.execute(
                    """
                    SELECT * FROM notes
                    ORDER BY created_at DESC
                    """
                )
            rows = cursor.fetchall()

        return [
            NoteResponse(
                id=row["id"],
                video_id=row["video_id"],
                video_url=row["video_url"],
                video_title=row["video_title"],
                thumbnail_url=row["thumbnail_url"],
                timestamp_seconds=row["timestamp_seconds"],
                timestamp_formatted=row["timestamp_formatted"],
                content=row["content"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            for row in rows
        ]

    def get_note_by_id(self, note_id: int) -> Optional[NoteResponse]:
        """Retrieve a single note by its ID."""
        with self._connection() as conn:
            cursor = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return NoteResponse(
                id=row["id"],
                video_id=row["video_id"],
                video_url=row["video_url"],
                video_title=row["video_title"],
                thumbnail_url=row["thumbnail_url"],
                timestamp_seconds=row["timestamp_seconds"],
                timestamp_formatted=row["timestamp_formatted"],
                content=row["content"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    def get_video_grouped_notes(self) -> List[VideoGroupResponse]:
        """Retrieve all notes grouped by video for the frontend notebook window."""
        with self._connection() as conn:
            # First, fetch videos with notes count and latest note time
            cursor = conn.execute(
                """
                SELECT
                    video_id,
                    video_url,
                    video_title,
                    thumbnail_url,
                    COUNT(id) AS notes_count,
                    MAX(created_at) AS latest_note_at
                FROM notes
                GROUP BY video_id
                ORDER BY latest_note_at DESC
                """
            )
            video_rows = cursor.fetchall()

            if not video_rows:
                return []

            # Fetch all notes ordered by timestamp
            notes_cursor = conn.execute(
                """
                SELECT * FROM notes
                ORDER BY video_id, timestamp_seconds ASC, created_at ASC
                """
            )
            all_notes_rows = notes_cursor.fetchall()

        # Group notes by video_id
        grouped: dict[str, list[NoteResponse]] = {}
        for row in all_notes_rows:
            vid = row["video_id"]
            if vid not in grouped:
                grouped[vid] = []
            grouped[vid].append(
                NoteResponse(
                    id=row["id"],
                    video_id=row["video_id"],
                    video_url=row["video_url"],
                    video_title=row["video_title"],
                    thumbnail_url=row["thumbnail_url"],
                    timestamp_seconds=row["timestamp_seconds"],
                    timestamp_formatted=row["timestamp_formatted"],
                    content=row["content"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
            )

        results = []
        for v in video_rows:
            vid = v["video_id"]
            results.append(
                VideoGroupResponse(
                    video_id=vid,
                    video_url=v["video_url"],
                    video_title=v["video_title"],
                    thumbnail_url=v["thumbnail_url"],
                    notes_count=v["notes_count"],
                    latest_note_at=v["latest_note_at"],
                    notes=grouped.get(vid, []),
                )
            )
        return results

    def delete_note(self, note_id: int) -> bool:
        """Delete a single note by ID. Returns True if deleted, False if not found."""
        with self._lock:
            with self._connection() as conn:
                cursor = conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
                return cursor.rowcount > 0

    def delete_notes_for_video(self, video_id: str) -> int:
        """Delete all notes belonging to a video ID. Returns deleted count."""
        clean_id = extract_video_id(video_id)
        with self._lock:
            with self._connection() as conn:
                cursor = conn.execute("DELETE FROM notes WHERE video_id = ?", (clean_id,))
                return cursor.rowcount


# Global singleton instance
notes_service = SQLiteNotesService()
