"""SQLite-based classification cache for StudyTube.

Stores video URL, view count, and classification results persistently.
Implements a 1GB max cache size eviction policy removing the video(s)
with the least views when the threshold is exceeded.
"""

from contextlib import contextmanager
import logging
import os
from pathlib import Path
import sqlite3
import threading
from typing import Generator, Optional
from urllib.parse import parse_qs, urlparse

from app.config import settings
from app.schemas.video import ClassificationResponse

logger = logging.getLogger("studytube-cache")


def canonicalize_youtube_url(url: Optional[str], video_id: Optional[str] = None) -> str:
    """Produce a canonical YouTube URL for consistent cache indexing."""
    if url:
        stripped = url.strip()
        try:
            parsed = urlparse(stripped)
            # If standard /watch?v=...
            if parsed.path in ("/watch", "/watch/"):
                query = parse_qs(parsed.query)
                vid = query.get("v", [None])[0]
                if vid:
                    return f"https://www.youtube.com/watch?v={vid.strip()}"
            # If /shorts/... or /live/... or /embed/...
            parts = [p for p in parsed.path.split("/") if p]
            if len(parts) >= 2 and parts[0] in ("shorts", "live", "embed"):
                return f"https://www.youtube.com/{parts[0]}/{parts[1]}"
            # If short link: youtu.be/...
            if "youtu.be" in parsed.netloc and parts:
                return f"https://www.youtube.com/watch?v={parts[0]}"
        except Exception:
            pass
        if stripped:
            return stripped

    # Fallback using video_id
    if video_id and video_id.strip():
        return f"https://www.youtube.com/watch?v={video_id.strip()}"

    return "unknown"


class SQLiteVideoCache:
    """Persistent SQLite cache for video classification results with view-based LFU eviction."""

    def __init__(
        self,
        db_path: Optional[str] = None,
        max_size_bytes: Optional[int] = None,
    ):
        raw_path = db_path or settings.SQLITE_CACHE_DB_PATH
        self.db_path = str(Path(raw_path).resolve())
        self.max_size_bytes = (
            max_size_bytes
            if max_size_bytes is not None
            else getattr(settings, "SQLITE_CACHE_MAX_BYTES", 1024 * 1024 * 1024)
        )
        self._lock = threading.Lock()

        # Ensure parent directory exists
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def _connection(self) -> Generator[sqlite3.Connection, None, None]:
        """Create a managed connection that guarantees commit and close on exit."""
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
        """Initialize database tables, pragmas, and indexes."""
        with self._lock:
            is_new = not os.path.exists(self.db_path) or os.path.getsize(self.db_path) == 0

            with self._connection() as conn:
                # auto_vacuum MUST be set before tables are created in a new database
                if is_new:
                    conn.execute("PRAGMA auto_vacuum = FULL")

                conn.execute("PRAGMA journal_mode = WAL")
                conn.execute("PRAGMA synchronous = NORMAL")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS video_cache (
                        video_url TEXT PRIMARY KEY,
                        video_id TEXT,
                        views INTEGER NOT NULL DEFAULT 0,
                        classification TEXT NOT NULL,
                        confidence REAL NOT NULL DEFAULT 1.0,
                        classifier TEXT NOT NULL DEFAULT 'sqlite_cache',
                        suggested_mode TEXT NOT NULL DEFAULT 'grayscale',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_video_cache_views ON video_cache(views ASC, updated_at ASC)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_video_cache_video_id ON video_cache(video_id)"
                )

    def get_size_bytes(self) -> int:
        """Calculate total physical SQLite database size including WAL/SHM files on disk."""
        total = 0
        if os.path.exists(self.db_path):
            total += os.path.getsize(self.db_path)
        for ext in ("-wal", "-shm"):
            extra = f"{self.db_path}{ext}"
            if os.path.exists(extra):
                total += os.path.getsize(extra)
        return total

    def get(
        self,
        url: Optional[str] = None,
        video_id: Optional[str] = None,
        views: Optional[int] = None,
    ) -> Optional[ClassificationResponse]:
        """Retrieve classification from SQLite cache by video URL or video ID.

        If cached entry exists and the incoming request has higher view count,
        updates the stored views.
        """
        canonical_url = canonicalize_youtube_url(url, video_id)
        clean_vid = video_id.strip() if video_id else None

        with self._lock:
            with self._connection() as conn:
                cursor = conn.cursor()
                row = None

                # Primary lookup by canonical URL
                if canonical_url and canonical_url != "unknown":
                    cursor.execute(
                        "SELECT * FROM video_cache WHERE video_url = ?",
                        (canonical_url,),
                    )
                    row = cursor.fetchone()

                # Secondary lookup by video_id if URL lookup misses
                if not row and clean_vid:
                    cursor.execute(
                        "SELECT * FROM video_cache WHERE video_id = ? ORDER BY views DESC LIMIT 1",
                        (clean_vid,),
                    )
                    row = cursor.fetchone()

                if not row:
                    return None

                cached_url = row["video_url"]
                cached_views = int(row["views"])

                # Update views if newer count is higher
                if views is not None and views > cached_views:
                    try:
                        cursor.execute(
                            """
                            UPDATE video_cache
                            SET views = ?, updated_at = CURRENT_TIMESTAMP
                            WHERE video_url = ?
                            """,
                            (views, cached_url),
                        )
                    except Exception as exc:
                        logger.warning("Failed to update cached views: %s", exc)

                return ClassificationResponse(
                    video_id=clean_vid or row["video_id"] or "cached",
                    category=row["classification"],
                    confidence=float(row["confidence"]),
                    suggested_mode=row["suggested_mode"] or "grayscale",
                    classifier=row["classifier"] or "sqlite_cache",
                    is_fallback=False,
                )

    def set(
        self,
        url: Optional[str],
        video_id: str,
        classification: str,
        views: int = 0,
        confidence: float = 1.0,
        classifier: str = "sqlite_cache",
        suggested_mode: str = "grayscale",
    ) -> None:
        """Insert or update classification in SQLite cache, enforcing the max size eviction policy."""
        canonical_url = canonicalize_youtube_url(url, video_id)
        clean_vid = video_id.strip() if video_id else ""
        safe_views = max(0, int(views or 0))

        with self._lock:
            with self._connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO video_cache (
                        video_url,
                        video_id,
                        views,
                        classification,
                        confidence,
                        classifier,
                        suggested_mode,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(video_url) DO UPDATE SET
                        video_id = CASE WHEN excluded.video_id != '' THEN excluded.video_id ELSE video_cache.video_id END,
                        views = CASE WHEN excluded.views > video_cache.views THEN excluded.views ELSE video_cache.views END,
                        classification = excluded.classification,
                        confidence = excluded.confidence,
                        classifier = excluded.classifier,
                        suggested_mode = excluded.suggested_mode,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (
                        canonical_url,
                        clean_vid,
                        safe_views,
                        classification,
                        float(confidence),
                        classifier,
                        suggested_mode,
                    ),
                )

            # Evict records with least views if cache size exceeds max_size_bytes
            self._check_and_evict()

    def evict_least_views(self, count: int = 1) -> int:
        """Evict the N video(s) with the lowest view count."""
        with self._lock:
            with self._connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    DELETE FROM video_cache
                    WHERE video_url IN (
                        SELECT video_url FROM video_cache
                        ORDER BY views ASC, updated_at ASC
                        LIMIT ?
                    )
                    """,
                    (count,),
                )
                deleted = cursor.rowcount
                try:
                    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                except Exception:
                    pass
                return deleted

    def _check_and_evict(self) -> None:
        """Evict records with the least views when cache size exceeds max_size_bytes."""
        current_size = self.get_size_bytes()
        if current_size <= self.max_size_bytes:
            return

        logger.info(
            "Cache size %d bytes exceeds max %d bytes. Evicting videos with least views...",
            current_size,
            self.max_size_bytes,
        )

        with self._connection() as conn:
            cursor = conn.cursor()
            while current_size > self.max_size_bytes:
                # Select entry with the least views
                cursor.execute(
                    """
                    SELECT video_url FROM video_cache
                    ORDER BY views ASC, updated_at ASC
                    LIMIT 1
                    """
                )
                row = cursor.fetchone()
                if not row:
                    break

                cursor.execute("DELETE FROM video_cache WHERE video_url = ?", (row["video_url"],))
                conn.commit()

                # Checkpoint WAL to reclaim disk space immediately
                try:
                    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                except Exception:
                    pass

                new_size = self.get_size_bytes()
                # Stop if physical size cannot shrink further (e.g. at SQLite minimum page allocation)
                if new_size >= current_size:
                    break
                current_size = new_size

            # If still over size, run explicit VACUUM to reclaim free space
            if current_size > self.max_size_bytes:
                try:
                    conn.execute("VACUUM")
                    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                except Exception as exc:
                    logger.warning("VACUUM after eviction failed: %s", exc)

    def count(self) -> int:
        """Count total cached video entries."""
        with self._lock:
            with self._connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) AS total FROM video_cache")
                row = cursor.fetchone()
                return int(row["total"]) if row else 0

    def clear(self) -> None:
        """Purge all cached entries (useful for testing)."""
        with self._lock:
            with self._connection() as conn:
                conn.execute("DELETE FROM video_cache")
                try:
                    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                    conn.execute("VACUUM")
                except Exception:
                    pass

    def delete_by_url(self, url: str) -> None:
        """Delete specific entry by URL."""
        with self._lock:
            with self._connection() as conn:
                conn.execute("DELETE FROM video_cache WHERE video_url = ?", (url,))


# Global SQLite cache singleton
_sqlite_cache: Optional[SQLiteVideoCache] = None


def get_sqlite_cache() -> SQLiteVideoCache:
    """Dependency injection factory for SQLiteVideoCache."""
    global _sqlite_cache
    if _sqlite_cache is None:
        _sqlite_cache = SQLiteVideoCache()
    return _sqlite_cache


def set_sqlite_cache(cache: Optional[SQLiteVideoCache]) -> None:
    """Override or reset SQLite cache singleton (useful for testing)."""
    global _sqlite_cache
    _sqlite_cache = cache
