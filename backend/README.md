# StudyTube Backend API Reference

FastAPI backend microservice providing intelligent video classification, SQLite persistent caching, and timestamped study notes management for the StudyTube Chrome extension and Web Dashboard.

---

## 📑 Quick Links
- **[Complete Setup Guide (SETUP.md)](../SETUP.md)**
- **[System Architecture (ARCHITECTURE.md)](../ARCHITECTURE.md)**
- **[Root Repository README (README.md)](../README.md)**

---

## Features & Implementation

- **12 Content Categories:** Validates and assigns YouTube videos into specific academic, tech, career, or entertainment categories (`education_academics`, `programming_technology`, `career_business`, `productivity_self_improvement`, `health_fitness`, `news_current_affairs`, `documentaries_explainers`, `gaming`, `entertainment_comedy`, `music`, `lifestyle_vlogs`, `hobbies_creative_arts`, `unknown`).
- **Real LLM Classifier Integration:**
  - **Ollama (Local & Free):** Direct compatibility with local Ollama instances (`llama3.2:3b`, `qwen2.5`, etc.) via OpenAI-compatible endpoint at `http://localhost:11434/v1`.
  - **Google Gemini:** Direct integration with Gemini models (`gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-2.0-flash`) using Google Generative Language REST API.
  - **OpenAI / Compatible:** Supports `gpt-4o-mini`, `gpt-4o`, and local OpenAI-compatible endpoints (vLLM, Groq).
  - **Offline / Placeholder:** Fast rule-based mock classifier for local development without credentials.
- **SQLite Classification Cache (1GB Capacity & LFU Eviction):**
  - Persistent SQLite storage (`data/classification_cache.db`) indexing canonical YouTube URLs.
  - View-weighted LFU (Least Frequently Used) eviction policy discarding lowest-viewed videos when disk usage reaches the 1GB threshold.
  - PRAGMA WAL mode and thread-safe connection pooling for zero-lag concurrent reads.
- **Timestamped Video Notes Service:**
  - Full CRUD API managing video notes (`data/notes.db`).
  - Automatic title and thumbnail resolution via YouTube's public oEmbed API (no YouTube API keys required).
  - Video-grouped aggregation and Markdown notebook export.
- **Resilient Fallback Policy:**
  - If the LLM call fails, times out, or returns invalid schema, selects a random category from defined categories (strictly excluding `unknown`).
  - Sets `is_fallback: true` and a low confidence score (`0.1`).
  - Never caches fallback responses as valid classifications.
- **In-Memory Caching & Deduplication:**
  - Thread/async-safe LRU caching keyed by `video_id`.
  - In-flight request deduplication so concurrent requests for identical videos make only one LLM call.

---

## Configuration (`backend/.env`)

All credentials and options are configured in `.env` (excluded from git):

```env
# Application Settings
PROJECT_NAME="StudyTube API"
VERSION="0.2.0"
ENVIRONMENT="development"
DEBUG=true
PORT=8000
HOST="127.0.0.1"

# CORS Configuration
CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000,https://www.youtube.com,https://youtube.com"
CORS_ALLOW_EXTENSION_REGEX=true

# LLM Classifier Configuration
# Options: "placeholder", "ollama", "gemini", "openai"

# Option A: Local Ollama (100% Free, GPU/CPU accelerated)
LLM_PROVIDER="ollama"
LLM_MODEL="llama3.2:3b"
LLM_BASE_URL="http://localhost:11434/v1"

# Option B: Offline / Placeholder (Zero Setup)
# LLM_PROVIDER="placeholder"

# Option C: Google Gemini
# LLM_PROVIDER="gemini"
# LLM_API_KEY="AIzaSy..."
# LLM_MODEL="gemini-1.5-flash"

# Option D: OpenAI / Compatible
# LLM_PROVIDER="openai"
# LLM_API_KEY="sk-..."
# LLM_MODEL="gpt-4o-mini"

LLM_TIMEOUT_SECONDS=15.0
CACHE_SIZE=1000

# SQLite Databases
SQLITE_CACHE_DB_PATH="data/classification_cache.db"
SQLITE_CACHE_MAX_BYTES=1073741824
SQLITE_NOTES_DB_PATH="data/notes.db"
```

---

## API Endpoints

### 1. Health Check (`GET /health` or `GET /api/v1/health`)
Returns API operational status:
```json
{
  "status": "healthy",
  "version": "0.2.0",
  "environment": "development",
  "llm_provider": "ollama",
  "llm_model": "llama3.2:3b"
}
```

### 2. Video Classification (`POST /api/v1/classify`)

**Request Payload:**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "title": "Never Gonna Give You Up",
  "channel_name": "Rick Astley",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "views": 1500000000
}
```

**Response Payload (200 OK):**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "category": "music",
  "confidence": 0.95,
  "suggested_mode": "grayscale",
  "classifier": "ollama:llama3.2:3b",
  "is_fallback": false
}
```

### 3. Video Timestamped Notes API (`/api/v1/notes`)

- **`POST /api/v1/notes`**: Create a timestamped note. Automatically resolves title and thumbnail via YouTube oEmbed.
  ```json
  // Request
  {
    "video_id": "kqtD5dpn9C8",
    "timestamp_seconds": 85,
    "timestamp_formatted": "01:25",
    "note_text": "Important definition of algorithm time complexity."
  }
  ```
- **`GET /api/v1/notes`**: List all notes, optionally filtered with `?video_id=...`.
- **`GET /api/v1/notes/videos`**: Group all notes by video for the frontend Notebook cards.
- **`GET /api/v1/notes/{id}`**: Retrieve a single note by ID.
- **`DELETE /api/v1/notes/{id}`**: Delete a single note.
- **`DELETE /api/v1/notes/video/{video_id}`**: Delete all notes for a specific video.

### 4. Settings Synchronization (`GET /api/v1/settings` & `POST /api/v1/settings`)
Synchronizes settings between dashboard and backend storage (`backend/app/settings.json`).

---

## Running the Server

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Interactive OpenAPI Swagger UI is available at `http://127.0.0.1:8000/docs`.

---

## Running Tests

Execute the 46 automated unit and integration tests:

```powershell
pytest backend/tests -v
```
