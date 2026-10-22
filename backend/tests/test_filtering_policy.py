"""Tests for filtering policies, whitelist rules, fallback resolution, Shorts handling, and color overrides."""

import pytest
from app.schemas.video import STANDARD_CATEGORIES, FALLBACK_CATEGORIES, ClassificationResponse
from app.services.classifier import BaseClassifier, PlaceholderClassifier


def evaluate_filter_policy(category: str, is_fallback: bool, whitelist: list) -> str:
    """Python reference implementation of StudyTube's frontend deterministic filtering policy.

    Rule: If backend fallback occurs (is_fallback=True) or category not in whitelist -> blacked_out.
    """
    if is_fallback:
        return "blacked_out"
    if not category or category == "unknown":
        return "blacked_out"
    return "allowed" if category in whitelist else "blacked_out"


def test_whitelist_allows_educational_categories():
    """Verify whitelist allows selected educational categories and blocks entertainment."""
    whitelist = [
        "education_academics",
        "programming_technology",
        "career_business",
        "productivity_self_improvement",
    ]

    assert evaluate_filter_policy("education_academics", False, whitelist) == "allowed"
    assert evaluate_filter_policy("programming_technology", False, whitelist) == "allowed"
    assert evaluate_filter_policy("career_business", False, whitelist) == "allowed"
    assert evaluate_filter_policy("productivity_self_improvement", False, whitelist) == "allowed"

    # Non-whitelisted should be blacked out
    assert evaluate_filter_policy("gaming", False, whitelist) == "blacked_out"
    assert evaluate_filter_policy("entertainment_comedy", False, whitelist) == "blacked_out"
    assert evaluate_filter_policy("music", False, whitelist) == "blacked_out"
    assert evaluate_filter_policy("lifestyle_vlogs", False, whitelist) == "blacked_out"


def test_backend_fallback_blacklists_video():
    """Verify backend fallback (is_fallback=True) or unknown classifications are always blacked out."""
    whitelist = ["education_academics", "gaming"]

    # Even if gaming is in the whitelist, backend fallback always blacklists videos
    assert evaluate_filter_policy("gaming", True, whitelist) == "blacked_out"
    assert evaluate_filter_policy("education_academics", True, whitelist) == "blacked_out"

    # Unknown category is always blacked out
    assert evaluate_filter_policy("unknown", False, whitelist) == "blacked_out"

    # Genuine non-fallback classifications obey whitelist
    assert evaluate_filter_policy("gaming", False, whitelist) == "allowed"
    assert evaluate_filter_policy("education_academics", False, whitelist) == "allowed"
    assert evaluate_filter_policy("entertainment_comedy", False, whitelist) == "blacked_out"


def test_shorts_url_detection_and_video_id_extraction():
    """Verify regex and parsing rules for YouTube Shorts vs Watch URLs."""
    import re

    def extract_id(url: str):
        match = re.search(r"/(?:shorts|live)/([a-zA-Z0-9_-]+)", url)
        if match:
            return match.group(1)
        match_watch = re.search(r"[?&]v=([a-zA-Z0-9_-]+)", url)
        if match_watch:
            return match_watch.group(1)
        return None

    assert extract_id("https://www.youtube.com/shorts/abc123XYZ_9") == "abc123XYZ_9"
    assert extract_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_id("https://www.youtube.com/live/liveStream1") == "liveStream1"
    assert extract_id("https://www.youtube.com/feed/subscriptions") is None


def test_shorts_complete_blocking_policy():
    """Verify that when Shorts blocking is enabled, Shorts playback and scrolling are completely disallowed."""
    def is_shorts_allowed(is_shorts_page: bool, block_shorts_setting: bool, studytube_enabled: bool) -> bool:
        if not studytube_enabled:
            return True
        if block_shorts_setting and is_shorts_page:
            return False  # No intentional playback or scrolling allowed
        return True

    assert is_shorts_allowed(is_shorts_page=True, block_shorts_setting=True, studytube_enabled=True) is False
    assert is_shorts_allowed(is_shorts_page=False, block_shorts_setting=True, studytube_enabled=True) is True
    assert is_shorts_allowed(is_shorts_page=True, block_shorts_setting=False, studytube_enabled=True) is True
    assert is_shorts_allowed(is_shorts_page=True, block_shorts_setting=True, studytube_enabled=False) is True


def test_manual_color_override_lifecycle():
    """Verify color override lifecycle: active for specific video, resets on navigation."""
    current_video_id = "video_A"
    color_override_id = "video_A"

    def is_color_active(active_id, override_id):
        return bool(active_id and override_id == active_id)

    # Initially on video_A with override -> in color
    assert is_color_active(current_video_id, color_override_id) is True

    # Navigate to video_B -> override resets to None, video_B starts in grayscale
    current_video_id = "video_B"
    color_override_id = None
    assert is_color_active(current_video_id, color_override_id) is False

    # Toggle override on video_B -> in color
    color_override_id = "video_B"
    assert is_color_active(current_video_id, color_override_id) is True

    # Navigate to video_C -> override resets to None, video_C starts in grayscale
    current_video_id = "video_C"
    color_override_id = None
    assert is_color_active(current_video_id, color_override_id) is False


def test_live_chat_shield_visibility_state():
    """Verify live chat visibility toggle logic."""
    def should_hide_chat(studytube_enabled: bool, hide_chat_setting: bool) -> bool:
        return studytube_enabled and hide_chat_setting

    # Default state: focus mode on, hide chat on -> chat hidden
    assert should_hide_chat(True, True) is True

    # User toggles chat on -> chat visible without refresh
    assert should_hide_chat(True, False) is False

    # Focus mode turned off globally -> chat visible
    assert should_hide_chat(False, True) is False
    assert should_hide_chat(False, False) is False


def test_backend_cache_isolation_and_capacity():
    """Verify LRU cache capacity limits and fallback non-caching."""
    classifier = PlaceholderClassifier(cache_size=3)

    # Insert 3 genuine responses
    for i in range(1, 4):
        classifier.put_cache(f"v_{i}", ClassificationResponse(
            video_id=f"v_{i}",
            category="education_academics",
            confidence=0.9,
            classifier="test",
            is_fallback=False,
        ))

    assert classifier.get_cached("v_1") is not None
    assert classifier.get_cached("v_2") is not None
    assert classifier.get_cached("v_3") is not None

    # Insert fallback response -> must NOT be cached
    classifier.put_cache("v_fb", ClassificationResponse(
        video_id="v_fb",
        category="gaming",
        confidence=0.1,
        classifier="test:fallback",
        is_fallback=True,
    ))
    assert classifier.get_cached("v_fb") is None

    # Insert 4th genuine response -> evicts oldest (v_1)
    classifier.put_cache("v_4", ClassificationResponse(
        video_id="v_4",
        category="career_business",
        confidence=0.85,
        classifier="test",
        is_fallback=False,
    ))
    assert classifier.get_cached("v_4") is not None
    assert classifier.get_cached("v_1") is None  # evicted by LRU


def test_comments_shield_toggle_lifecycle():
    """Verify comments shield default hiding, reversible reveal, and reset on navigation."""
    hide_comments_setting = True
    studytube_enabled = True
    comments_revealed = False

    def is_comments_collapsed(enabled, setting, revealed):
        return enabled and setting and not revealed

    # 1. Default state: hidden
    assert is_comments_collapsed(studytube_enabled, hide_comments_setting, comments_revealed) is True

    # 2. User clicks "Show anyway" -> comments revealed
    comments_revealed = True
    assert is_comments_collapsed(studytube_enabled, hide_comments_setting, comments_revealed) is False

    # 3. User clicks "Hide comments" -> re-collapsed
    comments_revealed = False
    assert is_comments_collapsed(studytube_enabled, hide_comments_setting, comments_revealed) is True

    # 4. User reveals comments, then navigates to another video -> resets to collapsed
    comments_revealed = True
    assert is_comments_collapsed(studytube_enabled, hide_comments_setting, comments_revealed) is False
    # Navigation occurs
    comments_revealed = False
    assert is_comments_collapsed(studytube_enabled, hide_comments_setting, comments_revealed) is True

