"""Tests for SQLite caching of video URL, views, and classification,
view-based LFU eviction policy, and LLM prompt isolation (only title & instructions).
"""

import asyncio
import os
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.schemas.video import ClassificationRequest, ClassificationResponse
from app.services.cache import SQLiteVideoCache, canonicalize_youtube_url
from app.services.classifier import GeminiClassifier, OpenAIClassifier


def test_canonicalize_youtube_url():
    """Verify URL normalization strips tracking parameters and handles various YouTube formats."""
    # Watch URL with tracking query params
    url1 = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&feature=shared&ab_channel=RickAstley"
    assert canonicalize_youtube_url(url1) == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

    # Shorts URL
    url2 = "https://www.youtube.com/shorts/abc123xyz?feature=share"
    assert canonicalize_youtube_url(url2) == "https://www.youtube.com/shorts/abc123xyz"

    # youtu.be shortlink
    url3 = "https://youtu.be/dQw4w9WgXcQ?si=abcdef"
    assert canonicalize_youtube_url(url3) == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

    # Fallback from video_id
    assert canonicalize_youtube_url(None, video_id="xyz999") == "https://www.youtube.com/watch?v=xyz999"


def test_sqlite_cache_store_and_retrieve():
    """Verify video_url, views, and class are stored and retrieved from SQLite."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_cache.db")
        cache = SQLiteVideoCache(db_path=db_path, max_size_bytes=10 * 1024 * 1024)

        cache.set(
            url="https://www.youtube.com/watch?v=learn_py",
            video_id="learn_py",
            classification="programming_technology",
            views=250000,
            confidence=0.98,
        )

        assert cache.count() == 1

        # Retrieve by URL
        hit = cache.get(url="https://www.youtube.com/watch?v=learn_py", views=250000)
        assert hit is not None
        assert hit.video_id == "learn_py"
        assert hit.category == "programming_technology"
        assert hit.confidence == 0.98
        assert hit.classifier == "sqlite_cache"

        # Retrieve by video_id
        hit_by_id = cache.get(video_id="learn_py")
        assert hit_by_id is not None
        assert hit_by_id.category == "programming_technology"


def test_sqlite_cache_views_update():
    """Verify that cached views are updated when a request with higher views arrives."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_cache.db")
        cache = SQLiteVideoCache(db_path=db_path)

        cache.set(
            url="https://www.youtube.com/watch?v=popular_vid",
            video_id="popular_vid",
            classification="education_academics",
            views=1000,
        )

        # Query with higher views (50,000)
        hit = cache.get(
            url="https://www.youtube.com/watch?v=popular_vid",
            views=50000,
        )
        assert hit is not None

        # Verify underlying SQLite row views was updated
        with cache._connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT views FROM video_cache WHERE video_id = 'popular_vid'")
            row = cursor.fetchone()
            assert row["views"] == 50000


def test_sqlite_cache_eviction_removes_least_views():
    """Verify that eviction removes the video with the least views first."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_cache.db")
        cache = SQLiteVideoCache(db_path=db_path)

        # Insert 3 videos with different view counts
        # Video Low: 10 views (least views)
        # Video Med: 50,000 views
        # Video High: 10,000,000 views (most views)
        cache.set(
            url="https://www.youtube.com/watch?v=low_views",
            video_id="low_views",
            classification="gaming",
            views=10,
        )
        cache.set(
            url="https://www.youtube.com/watch?v=med_views",
            video_id="med_views",
            classification="career_business",
            views=50000,
        )
        cache.set(
            url="https://www.youtube.com/watch?v=high_views",
            video_id="high_views",
            classification="education_academics",
            views=10000000,
        )

        assert cache.count() == 3

        # Evict 1 item -> least views must be removed
        evicted = cache.evict_least_views(count=1)
        assert evicted == 1
        assert cache.count() == 2

        # The video with the least views (low_views: 10 views) MUST be evicted first!
        low_hit = cache.get(url="https://www.youtube.com/watch?v=low_views")
        assert low_hit is None, "Video with lowest views should have been evicted first"

        # The video with medium views (50k) and high views (10M) MUST still be present!
        med_hit = cache.get(url="https://www.youtube.com/watch?v=med_views")
        assert med_hit is not None
        assert med_hit.category == "career_business"

        high_hit = cache.get(url="https://www.youtube.com/watch?v=high_views")
        assert high_hit is not None, "Video with high views should be preserved"
        assert high_hit.category == "education_academics"


def test_gemini_prompt_only_sends_title_and_instructions():
    """Verify that GeminiClassifier prompt only contains video title and instructions, omitting URL and views."""
    async def _run():
        classifier = GeminiClassifier(api_key="test-gemini-key", model="gemini-1.5-flash")

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": '{"category": "programming_technology", "confidence": 0.95}'}
                        ]
                    }
                }
            ]
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp

            request = ClassificationRequest(
                video_id="secret_vid_42",
                title="Building an Operating System in Rust",
                channel_name="Rustacean Station",
                url="https://www.youtube.com/watch?v=secret_vid_42",
                views=850000,
            )

            response = await classifier.classify(request)
            assert response.category == "programming_technology"

            # Check what was posted to Gemini
            assert mock_post.call_count == 1
            call_kwargs = mock_post.call_args[1]
            json_body = call_kwargs["json"]

            # User content parts
            user_parts = json_body["contents"][0]["parts"][0]["text"]
            assert "Video Title: Building an Operating System in Rust" in user_parts

            # CRITICAL REQUIREMENT: URL, views, and extra metadata must NOT be in the prompt!
            assert "secret_vid_42" not in user_parts
            assert "https://www.youtube.com" not in user_parts
            assert "850000" not in user_parts
            assert "Rustacean Station" not in user_parts

    asyncio.run(_run())


def test_openai_prompt_only_sends_title_and_instructions():
    """Verify that OpenAI/Ollama prompt only contains video title and instructions, omitting URL and views."""
    async def _run():
        classifier = OpenAIClassifier(api_key="sk-test", model="gpt-4o-mini")

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "content": '{"category": "productivity_self_improvement", "confidence": 0.92}'
                    }
                }
            ]
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp

            request = ClassificationRequest(
                video_id="prod_vid_88",
                title="Deep Work & Time Blocking Masterclass",
                channel_name="Productive Mind",
                url="https://www.youtube.com/watch?v=prod_vid_88",
                views=320000,
            )

            response = await classifier.classify(request)
            assert response.category == "productivity_self_improvement"

            # Check what was posted to OpenAI
            assert mock_post.call_count == 1
            call_kwargs = mock_post.call_args[1]
            json_body = call_kwargs["json"]

            messages = json_body["messages"]
            system_msg = next(m["content"] for m in messages if m["role"] == "system")
            user_msg = next(m["content"] for m in messages if m["role"] == "user")

            assert "Video Title: Deep Work & Time Blocking Masterclass" in user_msg

            # CRITICAL REQUIREMENT: URL, views, and extra metadata must NOT be in user prompt!
            assert "prod_vid_88" not in user_msg
            assert "https://www.youtube.com" not in user_msg
            assert "320000" not in user_msg
            assert "Productive Mind" not in user_msg

    asyncio.run(_run())


def test_sqlite_cache_saves_inference_time():
    """Verify that hitting the SQLite cache saves inference time and skips LLM call."""
    async def _run():
        classifier = OpenAIClassifier(api_key="sk-test", model="gpt-4o-mini")

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "content": '{"category": "health_fitness", "confidence": 0.91}'
                    }
                }
            ]
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp

            req = ClassificationRequest(
                video_id="fitness_vid_1",
                title="How to Perfect Your Deadlift Technique",
                url="https://www.youtube.com/watch?v=fitness_vid_1",
                views=150000,
            )

            # First call: cache miss -> calls LLM
            first_res = await classifier.classify(req)
            assert first_res.category == "health_fitness"
            assert mock_post.call_count == 1

            # Simulate fresh classifier instance (in-memory LRU empty) to prove SQLite cache works
            fresh_classifier = OpenAIClassifier(api_key="sk-test", model="gpt-4o-mini")
            fresh_classifier._cache.clear()  # Clear in-memory LRU cache

            # Second call: SQLite cache hit -> NO LLM CALL, saves inference time!
            second_res = await fresh_classifier.classify(req)
            assert second_res.category == "health_fitness"
            assert second_res.video_id == "fitness_vid_1"
            assert mock_post.call_count == 1  # Still 1! No additional LLM call!

    asyncio.run(_run())
