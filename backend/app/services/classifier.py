"""Classifier services and abstraction layer for StudyTube.

Provides BaseClassifier interface, PlaceholderClassifier, GeminiClassifier,
and OpenAI/OpenAI-compatible classifiers with in-memory caching, deduplication,
and robust failure fallbacks per specification.
"""

import asyncio
from collections import OrderedDict
import json
import logging
import random
import re
from abc import ABC, abstractmethod
from typing import Dict, Optional

import httpx

from app.config import settings
from app.schemas.video import (
    ALLOWED_CATEGORIES,
    FALLBACK_CATEGORIES,
    ClassificationRequest,
    ClassificationResponse,
)
from app.services.cache import get_sqlite_cache

logger = logging.getLogger("studytube-classifier")

SYSTEM_PROMPT = f"""You are an expert YouTube video classifier for the StudyTube focus application.
Analyze the provided YouTube video title according to these instructions, and classify it into EXACTLY ONE category from this list:
{", ".join(ALLOWED_CATEGORIES)}

Category Definitions:
- "education_academics": Math, physics, chemistry, biology, history, academic lectures, formal science research, university lectures (e.g. MIT OCW, Khan Academy, 3Blue1Brown).
- "programming_technology": Software engineering, coding tutorials (Python, JS, C++, Rust), AI/ML, web dev, cybersecurity, computer hardware, robotics, tech gadget reviews.
- "career_business": Investing, stock market, crypto, entrepreneurship, startups, ecommerce, marketing, career advice, resumes, business analysis.
- "productivity_self_improvement": Study habits, time management, deep work, atomic habits, journaling, mental models, personal growth, book summaries.
- "health_fitness": Gym workouts, weight lifting, calisthenics, running, nutrition, physiotherapy, medical advice, sleep optimization.
- "documentaries_explainers": Video essays, investigative deep dives, historical mini-documentaries, science explainers (e.g. Veritasium, Kurzgesagt, Wendover, Lemmino).
- "news_current_affairs": Geopolitics, world news, investigative journalism, election coverage, economic breaking news.
- "gaming": Video game gameplay, walkthroughs, speedruns, esports, Let's Plays, gaming commentary (e.g. GTA, Minecraft, Elden Ring, Valorant).
- "entertainment_comedy": Stand-up comedy, sketches, memes, comedic commentary, pranks, movie reactions, anime clips, funny challenges.
- "music": Songs, music videos, albums, live concerts, instrument covers, soundtrack playlists, lofi study beats.
- "lifestyle_vlogs": Day-in-the-life vlogs, travel vlogs, makeup/beauty, fashion hauls, unboxing toys/clothes, celebrity drama.
- "hobbies_creative_arts": Cooking recipes, woodworking, drawing, painting, photography, DIY crafts, pottery, gardening.
- "unknown": Only if insufficient title/metadata exists to determine the content.

Disambiguation Priority Rules:
1. Programming/Tech Priority: Any video demonstrating coding, software, algorithms, or computer architecture MUST be classified as "programming_technology", even if titled as a "Course" or "Lecture".
2. Gaming vs Tech/Edu: Any video showing video gameplay or in-game footage MUST be classified as "gaming", even if titled "Tutorial", "Guide", or "Physics in GTA".
3. Business vs Productivity: Monetization, earning money, freelancing, and ecommerce belong in "career_business". Personal routines, time management, and study focus belong in "productivity_self_improvement".
4. Documentaries vs Comedy: Educational or analytical video essays belong in "documentaries_explainers", while lighthearted sketch comedy belongs in "entertainment_comedy".
5. Music vs Study: Background study beats (lofi, ambient) MUST be classified as "music".

Examples:
- Title: "Python Tutorial for Beginners - Full Course [2024]" -> {{"category": "programming_technology", "confidence": 0.98, "reasoning": "Comprehensive software programming course"}}
- Title: "Elden Ring: Shadow of the Erdtree - Final Boss Fight Gameplay" -> {{"category": "gaming", "confidence": 1.0, "reasoning": "Video game gameplay walkthrough"}}
- Title: "The Essence of Calculus, Chapter 1 | 3Blue1Brown" -> {{"category": "education_academics", "confidence": 0.98, "reasoning": "Academic mathematics lecture"}}
- Title: "How I Built a $10,000/mo Micro-SaaS Solo" -> {{"category": "career_business", "confidence": 0.95, "reasoning": "Software business and entrepreneurship revenue"}}
- Title: "20 Minute Full Body Workout at Home (No Equipment)" -> {{"category": "health_fitness", "confidence": 0.98, "reasoning": "Physical fitness exercise routine"}}
- Title: "How the Concorde Actually Worked | Wendover Productions" -> {{"category": "documentaries_explainers", "confidence": 0.95, "reasoning": "Engineering explainer video essay"}}
- Title: "I Spent 24 Hours in an Abandoned Water Park" -> {{"category": "entertainment_comedy", "confidence": 0.92, "reasoning": "Entertainment stunt video"}}
- Title: "How to Build a Second Brain in Notion (Productivity Guide)" -> {{"category": "productivity_self_improvement", "confidence": 0.94, "reasoning": "Personal knowledge management and productivity"}}
- Title: "Authentic Italian Carbonara Recipe from Scratch" -> {{"category": "hobbies_creative_arts", "confidence": 0.96, "reasoning": "Culinary recipe and cooking tutorial"}}
- Title: "lofi hip hop radio - beats to relax/study to" -> {{"category": "music", "confidence": 0.97, "reasoning": "Instrumental music stream"}}

Respond ONLY with a valid JSON object matching this schema:
{{
  "category": "<one_of_the_categories_above>",
  "confidence": <float between 0.0 and 1.0>,
  "reasoning": "<brief one-sentence explanation>"
}}
Do NOT include markdown formatting or explanations outside the JSON object.
"""


def _create_fallback_response(video_id: str, provider: str, error_reason: str) -> ClassificationResponse:
    """Generate safe fallback response when LLM is unavailable or fails.

    Per configuration, defaults to 'gaming' (settings.LLM_FALLBACK_DEFAULT).
    """
    selected_category = getattr(settings, "LLM_FALLBACK_DEFAULT", "gaming") or "gaming"
    if selected_category not in FALLBACK_CATEGORIES:
        selected_category = "gaming"

    logger.warning(
        "LLM classification failure for video_id='%s' (%s). Returning fallback category: '%s'",
        video_id,
        error_reason,
        selected_category,
    )
    return ClassificationResponse(
        video_id=video_id,
        category=selected_category,
        confidence=0.1,
        suggested_mode="grayscale",
        classifier=f"{provider}:fallback",
        is_fallback=True,
    )


class BaseClassifier(ABC):
    """Abstract base classifier interface with caching and deduplication."""

    provider_name = "base"

    def __init__(self, cache_size: int = 1000):
        self._cache: OrderedDict[str, ClassificationResponse] = OrderedDict()
        self._in_flight: Dict[str, asyncio.Future] = {}
        self._cache_size = cache_size
        self._lock = asyncio.Lock()
        self._sqlite_cache = get_sqlite_cache()

    def get_cached(self, video_id: str) -> Optional[ClassificationResponse]:
        """Retrieve a genuine in-memory LRU cached response if present."""
        if video_id in self._cache:
            self._cache.move_to_end(video_id)
            return self._cache[video_id]
        return None

    def put_cache(
        self,
        video_id: str,
        response: ClassificationResponse,
        url: Optional[str] = None,
        views: int = 0,
    ) -> None:
        """Store valid response in memory and SQLite cache, strictly omitting fallback responses."""
        if response.is_fallback:
            return
        if len(self._cache) >= self._cache_size:
            self._cache.popitem(last=False)
        self._cache[video_id] = response
        try:
            self._sqlite_cache.set(
                url=url,
                video_id=video_id,
                classification=response.category,
                views=views,
                confidence=response.confidence,
                classifier=response.classifier,
                suggested_mode=response.suggested_mode,
            )
        except Exception as exc:
            logger.warning("Failed to save to SQLite cache: %s", exc)

    async def classify(self, request: ClassificationRequest) -> ClassificationResponse:
        """Classify video metadata with deduplication and persistent SQLite caching."""
        # 1. Check in-memory LRU cache
        if request.video_id in self._cache:
            self._cache.move_to_end(request.video_id)
            return self._cache[request.video_id]

        # 2. Check persistent SQLite cache (updating views if newer count is higher)
        sqlite_cached = self._sqlite_cache.get(
            url=request.url,
            video_id=request.video_id,
            views=request.views,
        )
        if sqlite_cached:
            if len(self._cache) >= self._cache_size:
                self._cache.popitem(last=False)
            self._cache[request.video_id] = sqlite_cached
            return sqlite_cached

        # 3. Deduplicate concurrent requests for identical video_id
        async with self._lock:
            if request.video_id in self._cache:
                self._cache.move_to_end(request.video_id)
                return self._cache[request.video_id]

            sqlite_cached = self._sqlite_cache.get(
                url=request.url,
                video_id=request.video_id,
                views=request.views,
            )
            if sqlite_cached:
                if len(self._cache) >= self._cache_size:
                    self._cache.popitem(last=False)
                self._cache[request.video_id] = sqlite_cached
                return sqlite_cached

            if request.video_id in self._in_flight:
                future = self._in_flight[request.video_id]
            else:
                loop = asyncio.get_running_loop()
                future = loop.create_future()
                self._in_flight[request.video_id] = future
                asyncio.create_task(self._execute_and_resolve(request, future))

        return await future

    async def _execute_and_resolve(self, request: ClassificationRequest, future: asyncio.Future) -> None:
        """Run provider classification and resolve pending future."""
        try:
            response = await self._classify_impl(request)
            if not response.is_fallback:
                self.put_cache(
                    video_id=request.video_id,
                    response=response,
                    url=request.url,
                    views=request.views or 0,
                )
            if not future.done():
                future.set_result(response)
        except Exception as exc:
            logger.exception("Unexpected error in classifier: %s", exc)
            fallback = _create_fallback_response(request.video_id, getattr(self, "provider_name", "unknown"), str(exc))
            if not future.done():
                future.set_result(fallback)
        finally:
            async with self._lock:
                self._in_flight.pop(request.video_id, None)

    async def _classify_impl(self, request: ClassificationRequest) -> ClassificationResponse:
        """Subclasses implement concrete classification logic."""
        raise NotImplementedError("Subclasses must implement _classify_impl or classify")


class PlaceholderClassifier(BaseClassifier):
    """Offline placeholder classifier."""

    provider_name = "placeholder"

    def __init__(self, cache_size: int = 1000):
        super().__init__(cache_size=cache_size)

    async def _classify_impl(self, request: ClassificationRequest) -> ClassificationResponse:
        """Return structured placeholder response with default unknown category."""
        return ClassificationResponse(
            video_id=request.video_id,
            category="unknown",
            confidence=0.0,
            suggested_mode="grayscale",
            classifier="placeholder",
            is_fallback=False,
        )


class GeminiClassifier(BaseClassifier):
    """Google Gemini LLM classifier using Google Generative Language REST API."""

    provider_name = "gemini"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: Optional[float] = None,
        cache_size: int = 1000,
    ):
        super().__init__(cache_size=cache_size)
        self.api_key = api_key if api_key is not None else settings.LLM_API_KEY
        self.model = model or settings.LLM_MODEL or "gemini-1.5-flash"
        self.timeout = timeout or settings.LLM_TIMEOUT_SECONDS

    async def _classify_impl(self, request: ClassificationRequest) -> ClassificationResponse:
        """Call Google Gemini API to classify video."""
        if not self.api_key:
            return _create_fallback_response(request.video_id, self.provider_name, "API key not configured in .env")

        # Send only title and instructions to LLM (no URL or views per specification)
        user_content = f"Video Title: {request.title}"

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
        payload = {
            "system_instruction": {
                "parts": [{"text": SYSTEM_PROMPT}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user_content}]
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.1,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=payload)

            if response.status_code != 200:
                return _create_fallback_response(
                    request.video_id,
                    self.provider_name,
                    f"HTTP {response.status_code}: {response.text[:200]}",
                )

            data = response.json()
            candidates = data.get("candidates", [])
            if not candidates:
                return _create_fallback_response(request.video_id, self.provider_name, "Empty candidates from Gemini")

            parts = candidates[0].get("content", {}).get("parts", [])
            if not parts:
                return _create_fallback_response(request.video_id, self.provider_name, "No parts in Gemini response")

            text = parts[0].get("text", "")
            parsed = self._extract_json(text)
            if not parsed or "category" not in parsed:
                return _create_fallback_response(request.video_id, self.provider_name, "Invalid JSON structure from Gemini")

            category = str(parsed.get("category", "")).strip().lower()
            if category not in ALLOWED_CATEGORIES:
                category = "unknown"

            raw_confidence = parsed.get("confidence", 0.8)
            try:
                confidence = max(0.0, min(1.0, float(raw_confidence)))
            except (ValueError, TypeError):
                confidence = 0.5

            return ClassificationResponse(
                video_id=request.video_id,
                category=category,
                confidence=confidence,
                suggested_mode="grayscale",
                classifier=f"gemini:{self.model}",
                is_fallback=False,
            )

        except Exception as exc:
            return _create_fallback_response(request.video_id, self.provider_name, str(exc))

    def _extract_json(self, text: str) -> Optional[dict]:
        """Safely parse JSON from LLM text output."""
        try:
            return json.loads(text.strip())
        except Exception:
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(0))
                except Exception:
                    pass
        return None


class OpenAIClassifier(BaseClassifier):
    """OpenAI and OpenAI-compatible (Ollama, vLLM, Groq, OpenRouter) classifier."""

    provider_name = "openai"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
        cache_size: int = 1000,
    ):
        super().__init__(cache_size=cache_size)
        self.api_key = api_key if api_key is not None else settings.LLM_API_KEY
        self.base_url = (base_url or settings.LLM_BASE_URL or "https://api.openai.com/v1").rstrip("/")
        self.model = model or settings.LLM_MODEL or "gpt-4o-mini"
        self.timeout = timeout or settings.LLM_TIMEOUT_SECONDS

        # Auto-resolve Ollama model tag if model does not have an explicit tag
        if ("localhost:11434" in self.base_url or "127.0.0.1:11434" in self.base_url) and ":" not in self.model:
            self.model = self._auto_resolve_ollama_model(self.base_url, self.model)

    @staticmethod
    def _auto_resolve_ollama_model(base_url: str, requested_model: str) -> str:
        """Auto-resolve Ollama model tags (e.g. 'llama3.2' -> 'llama3.2:3b')."""
        try:
            import urllib.request
            root_url = base_url.replace("/v1", "").rstrip("/")
            req = urllib.request.Request(f"{root_url}/api/tags")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                data = json.loads(resp.read().decode())
                available = [m["name"] for m in data.get("models", [])]
                if requested_model in available:
                    return requested_model
                for m in available:
                    if m.startswith(f"{requested_model}:") or m.split(":")[0] == requested_model:
                        logger.info("Auto-resolved Ollama model '%s' to installed model '%s'", requested_model, m)
                        return m
                if available:
                    return available[0]
        except Exception:
            pass
        return requested_model

    async def _classify_impl(self, request: ClassificationRequest) -> ClassificationResponse:
        """Call OpenAI-compatible chat completions endpoint."""
        if not self.api_key and "localhost" not in self.base_url and "127.0.0.1" not in self.base_url:
            return _create_fallback_response(request.video_id, self.provider_name, "API key not configured in .env")

        # Send only title and instructions to LLM (no URL or views per specification)
        user_content = f"Video Title: {request.title}"

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        }

        url = f"{self.base_url}/chat/completions"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, headers=headers, json=payload)

            if response.status_code != 200:
                return _create_fallback_response(
                    request.video_id,
                    self.provider_name,
                    f"HTTP {response.status_code}: {response.text[:200]}",
                )

            data = response.json()
            choices = data.get("choices", [])
            if not choices:
                return _create_fallback_response(request.video_id, self.provider_name, "Empty choices from OpenAI")

            content = choices[0].get("message", {}).get("content", "")
            parsed = self._extract_json(content)
            if not parsed or "category" not in parsed:
                return _create_fallback_response(request.video_id, self.provider_name, "Invalid JSON structure from OpenAI")

            category = str(parsed.get("category", "")).strip().lower()
            if category not in ALLOWED_CATEGORIES:
                category = "unknown"

            raw_confidence = parsed.get("confidence", 0.8)
            try:
                confidence = max(0.0, min(1.0, float(raw_confidence)))
            except (ValueError, TypeError):
                confidence = 0.5

            return ClassificationResponse(
                video_id=request.video_id,
                category=category,
                confidence=confidence,
                suggested_mode="grayscale",
                classifier=f"openai:{self.model}",
                is_fallback=False,
            )

        except Exception as exc:
            return _create_fallback_response(request.video_id, self.provider_name, str(exc))

    def _extract_json(self, text: str) -> Optional[dict]:
        """Safely parse JSON from text."""
        try:
            return json.loads(text.strip())
        except Exception:
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(0))
                except Exception:
                    pass
        return None


# Global classifier singleton
_active_classifier: Optional[BaseClassifier] = None
_custom_override: bool = False


def get_classifier() -> BaseClassifier:
    """Dependency injection factory for video classifiers.

    Instantiates and returns the configured classifier based on settings.LLM_PROVIDER.
    """
    global _active_classifier, _custom_override
    if _active_classifier is not None and _custom_override:
        return _active_classifier

    provider = (settings.LLM_PROVIDER or "placeholder").lower().strip()

    # Re-instantiate if provider changed
    if _active_classifier is not None:
        expected_provider = "openai" if provider in ("openai", "ollama") else provider
        if _active_classifier.provider_name == expected_provider:
            return _active_classifier

    if provider == "gemini":
        _active_classifier = GeminiClassifier()
    elif provider == "ollama":
        base_url = settings.LLM_BASE_URL or "http://localhost:11434/v1"
        model = settings.LLM_MODEL if settings.LLM_MODEL and settings.LLM_MODEL not in ("placeholder", "gemini-1.5-flash") else "llama3.2:3b"
        api_key = settings.LLM_API_KEY or "ollama"
        _active_classifier = OpenAIClassifier(api_key=api_key, model=model, base_url=base_url)
    elif provider == "openai":
        _active_classifier = OpenAIClassifier()
    else:
        _active_classifier = PlaceholderClassifier()
    _custom_override = False
    return _active_classifier


def set_classifier(classifier: Optional[BaseClassifier]) -> None:
    """Reset or override active classifier instance (useful for tests)."""
    global _active_classifier, _custom_override
    _active_classifier = classifier
    _custom_override = classifier is not None
