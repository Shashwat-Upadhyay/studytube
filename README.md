# StudyTube — Focus Mode & Classification Backend

StudyTube is a Chrome Extension (Manifest V3) and companion FastAPI backend designed to eliminate distractions on YouTube, enforce grayscale by default, and provide intelligent content classification for focused learning.

---

## Features

- **Distraction Barrier:** Blackouts recommendation cards on the YouTube Home page and watch page sidebar.
- **Grayscale by Default:** All opened videos start in grayscale automatically, including in-player end-screen recommendations, videowalls, and autoplay countdowns.
- **Intentional Color Toggle:** Allows watching a specific video in color via the `🌈 Watch in color` button; automatically restores grayscale when transitioning to another video.
- **Modular Classification Backend:** FastAPI service accepting video metadata (`video_id`, `title`, `channel_name`, `url`), validating payloads, and serving focus classifications with an extensible architecture prepared for future LLM integration.

---

## Repository Structure

```
studytube/
├── manifest.json              # Chrome Extension Manifest V3 configuration
├── content.js                 # Content script enforcing grayscale & card overlays
├── content.css                # CSS rules for blackout overlays and player grayscale
├── .gitignore                 # Excludes secrets (.env), virtual environments, caches
├── README.md                  # Main setup, running, and testing documentation
└── backend/
    ├── .env.example           # Environment configuration template
    ├── requirements.txt       # FastAPI, Uvicorn, Pydantic, and Pytest dependencies
    ├── README.md              # Detailed backend API reference
    ├── verify_backend.py      # Quick end-to-end verification script
    ├── app/
    │   ├── __init__.py
    │   ├── main.py            # FastAPI entrypoint, CORS, and error handlers
    │   ├── config.py          # Pydantic Settings & CORS parser
    │   ├── api/
    │   │   ├── __init__.py
    │   │   └── v1/
    │   │       ├── router.py  # API v1 router
    │   │       └── endpoints/
    │   │           ├── classify.py # POST /api/v1/classify
    │   │           └── health.py   # GET /api/v1/health
    │   ├── schemas/
    │   │   ├── video.py       # ClassificationRequest & ClassificationResponse
    │   │   └── health.py      # HealthResponse schema
    │   └── services/
    │       └── classifier.py  # BaseClassifier ABC & PlaceholderClassifier
    └── tests/
        ├── test_health.py     # Health endpoint & OpenAPI tests
        └── test_classify.py   # Validation, CORS, and classifier swap tests
```

---

## Chrome Extension Setup

### 1. Install Unpacked Extension in Chrome

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the `d:\My_Projects\studytube` project directory.
5. StudyTube will appear in your extensions list. Note the 32-character **Extension ID** (e.g. `nkbihfbeogaeaoehlefnkodbefgpgknn`).

### 2. Verify in YouTube

1. Open or refresh `https://www.youtube.com`.
2. Press `F12` to open Chrome DevTools and look for `[StudyTube] Focus Mode running.` in the **Console** tab.
3. Home page recommendation cards will display the blacked-out `StudyTube — Reveal & watch in grayscale` cover.
4. Opening any video will automatically start playback in grayscale with the `🌈 Watch in color` toggle button attached.

---

## Backend Setup

### 1. Prerequisites

- **Python 3.10+**
- **pip**

### 2. Create and Activate Virtual Environment

```powershell
# Windows (PowerShell)
cd d:\My_Projects\studytube\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

```bash
# macOS / Linux
cd backend
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install Dependencies

```powershell
pip install -r requirements.txt
```

### 4. Configure Environment Variables

```powershell
# Windows (PowerShell)
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

Review `backend/.env` and configure settings as desired:
- `CORS_ORIGINS`: Comma-separated list or JSON array of allowed origins (e.g. `chrome-extension://<YOUR_EXTENSION_ID>`).
- `CORS_ALLOW_EXTENSION_REGEX`: Set to `true` to allow local unpacked extension IDs during development.
- `PORT` / `HOST`: Server host and port (defaults to `127.0.0.1:8000`).

### 5. Start the Development Server

From within the `backend/` directory:

```powershell
.\.venv\Scripts\uvicorn.exe app.main:app --reload --host 127.0.0.1 --port 8000
```

Or from the workspace root:

```powershell
.\backend\.venv\Scripts\uvicorn.exe --app-dir backend app.main:app --reload --host 127.0.0.1 --port 8000
```

The server will be running at `http://127.0.0.1:8000`.

---

## Testing & Verification

### 1. Run Automated Test Suite (Pytest)

Run all 14 unit and integration tests covering health checks, schema validation boundaries, CORS preflight, and classifier service swapping:

```powershell
# From the backend directory
pytest -v

# Or from the repository root
.\backend\.venv\Scripts\pytest.exe backend\tests -v
```

**Expected output:**
```
backend/tests/test_classify.py::test_classify_valid_full_payload PASSED
backend/tests/test_classify.py::test_classify_valid_required_fields_only PASSED
backend/tests/test_classify.py::test_classify_missing_title_rejected PASSED
backend/tests/test_classify.py::test_classify_blank_whitespace_title_rejected PASSED
backend/tests/test_classify.py::test_classify_missing_video_id_rejected PASSED
backend/tests/test_classify.py::test_classify_blank_whitespace_video_id_rejected PASSED
backend/tests/test_classify.py::test_classify_title_exceeding_max_length_rejected PASSED
backend/tests/test_classify.py::test_classify_video_id_exceeding_max_length_rejected PASSED
backend/tests/test_classify.py::test_classify_malformed_json_body PASSED
backend/tests/test_classify.py::test_cors_preflight_for_chrome_extension PASSED
backend/tests/test_classify.py::test_classifier_service_replacement PASSED
backend/tests/test_health.py::test_root_health_endpoint PASSED
backend/tests/test_health.py::test_api_v1_health_endpoint PASSED
backend/tests/test_health.py::test_openapi_docs_endpoint PASSED

======================== 14 passed in 0.63s ========================
```

### 2. Run End-to-End Verification Script

Run the verification script to test live client responses and validation error structures:

```powershell
.\backend\.venv\Scripts\python.exe backend\verify_backend.py
```

### 3. Test Endpoints Interactively (Swagger UI)

Open `http://127.0.0.1:8000/docs` in your browser to inspect and trigger endpoints interactively through Swagger UI.

### 4. Test Endpoints via CLI

#### A. Health Check (`GET /health`)
```powershell
# PowerShell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -Method Get
```
```bash
# cURL
curl -X GET "http://127.0.0.1:8000/health"
```
**Response (200 OK):**
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "timestamp": "2026-10-21T11:18:48.350083Z",
  "environment": "development"
}
```

#### B. Video Classification (`POST /api/v1/classify`)
```powershell
# PowerShell
$body = @{
    video_id = "example123"
    title = "Introduction to Machine Learning"
    channel_name = "Example Learning"
    url = "https://www.youtube.com/watch?v=example123"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/v1/classify" -Method Post -Body $body -ContentType "application/json"
```
```bash
# cURL
curl -X POST "http://127.0.0.1:8000/api/v1/classify" \
  -H "Content-Type: application/json" \
  -d '{
    "video_id": "example123",
    "title": "Introduction to Machine Learning",
    "channel_name": "Example Learning",
    "url": "https://www.youtube.com/watch?v=example123"
  }'
```
**Response (200 OK):**
```json
{
  "video_id": "example123",
  "category": "unknown",
  "confidence": 0.0,
  "suggested_mode": "grayscale",
  "classifier": "placeholder"
}
```

#### C. Validation Failure Check (Blank Title)
```powershell
# PowerShell
$badBody = @{
    video_id = "example123"
    title = "    "
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/v1/classify" -Method Post -Body $badBody -ContentType "application/json"
```
**Response (422 Unprocessable Content):**
```json
{
  "detail": "Request validation failed",
  "errors": [
    {
      "field": "title",
      "message": "Value error, title cannot be empty or blank whitespace",
      "type": "value_error"
    }
  ]
}
```

---

## Extension & Backend Integration (CORS)

When integrating the Chrome extension with the backend:

1. **Origin Header:** Requests originating from the Chrome extension send an origin header in the format `chrome-extension://<EXTENSION_ID>`.
2. **Configuration:** Add your unpacked Extension ID to `backend/.env`:
   ```env
   CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:8000,chrome-extension://your-extension-id-here"
   ```
3. **Local Dev Regex:** `CORS_ALLOW_EXTENSION_REGEX=true` is enabled by default to automatically allow any local unpacked extension ID without wildcarding access to arbitrary websites.
4. **Asynchronous Non-Blocking Pattern:** All client requests from the extension should be asynchronous (`fetch` with `async/await`) to ensure YouTube playback and navigation remain smooth.

---

## Future LLM Integration

The backend is architected with an abstract base class (`BaseClassifier`) in `backend/app/services/classifier.py`:

```
BaseClassifier (ABC)
   ├── PlaceholderClassifier (current default)
   └── LLMClassifier (future Gemini / OpenAI / Anthropic integration)
```

- When implementing an LLM provider:
  1. Add provider credentials to `backend/.env` (e.g. `LLM_PROVIDER="gemini"`, `LLM_API_KEY="AIza..."`).
  2. Implement `LLMClassifier(BaseClassifier)` in `backend/app/services/classifier.py`.
  3. Return it in `get_classifier()` when `settings.LLM_PROVIDER != "placeholder"`.
- **Security:** API keys and prompt engineering remain strictly on the backend and are never exposed inside the Chrome extension.
