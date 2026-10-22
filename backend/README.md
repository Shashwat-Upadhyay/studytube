# StudyTube Backend API Reference

FastAPI backend service providing intelligent content classification and focus recommendations for the StudyTube Chrome extension.

---

## Features & Implementation

- **12 Content Categories:** Validates and assigns YouTube videos into specific academic, tech, career, or entertainment categories (`education_academics`, `programming_technology`, `career_business`, `productivity_self_improvement`, `health_fitness`, `news_current_affairs`, `documentaries_explainers`, `gaming`, `entertainment_comedy`, `music`, `lifestyle_vlogs`, `hobbies_creative_arts`, `unknown`).
- **Real LLM Classifier Integration:**
  - **Ollama (Local & Free):** Direct compatibility with local Ollama instances (`llama3.2:3b`, `qwen2.5`, etc.) via OpenAI-compatible endpoint at `http://localhost:11434/v1`.
  - **Google Gemini:** Direct integration with Gemini models (`gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-2.0-flash`) using Google Generative Language REST API.
  - **OpenAI / Compatible:** Supports `gpt-4o-mini`, `gpt-4o`, and local OpenAI-compatible endpoints (vLLM, Groq).
  - **Offline / Placeholder:** Fast rule-based mock classifier for local development without credentials.
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
CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000,https://www.youtube.com"
CORS_ALLOW_EXTENSION_REGEX=true

# LLM Classifier Configuration
# Options: "placeholder", "ollama", "gemini", "openai"

# Option A: Local Ollama (100% Free, GPU/CPU accelerated)
LLM_PROVIDER="ollama"
LLM_MODEL="llama3.2:3b"
LLM_BASE_URL="http://localhost:11434/v1"

# Option B: Offline / Placeholder
# LLM_PROVIDER="placeholder"

# Option C: Google Gemini
# LLM_PROVIDER="gemini"
# LLM_API_KEY="AIzaSy..."
# LLM_MODEL="gemini-1.5-flash"

# Option D: OpenAI
# LLM_PROVIDER="openai"
# LLM_API_KEY="sk-..."
# LLM_MODEL="gpt-4o-mini"

LLM_TIMEOUT_SECONDS=15.0
CACHE_SIZE=1000
```

---

## API Endpoints

### 1. Health Check (`GET /health` or `GET /api/v1/health`)
Returns API operational status:
```json
{
  "status": "healthy",
  "version": "0.2.0",
  "timestamp": "2026-10-22T10:07:53.160349Z",
  "environment": "development"
}
```

### 2. Video Classification (`POST /api/v1/classify`)

**Request Payload:**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "title": "Never Gonna Give You Up",
  "channel_name": "Rick Astley",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
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

### 3. Settings Synchronization (`GET /api/v1/settings` & `POST /api/v1/settings`)
Synchronizes settings between dashboard and backend storage (`backend/app/settings.json`).

---

## Running the Server

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Interactive OpenAPI Swagger UI is available at `http://127.0.0.1:8000/docs`.

---

## Running Tests

Execute the 34 automated pytest tests:

```powershell
python -m pytest backend/tests -v
```
