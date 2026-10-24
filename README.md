# StudyTube — Intelligent Focus Mode, Category Whitelisting & LLM Classifier

**StudyTube** is an open-source, AI-powered productivity system engineered to transform YouTube from an algorithmic distraction loop into a focused learning environment. Built as a Manifest V3 Chrome extension, reactive glassmorphism web dashboard, and high-performance FastAPI backend, StudyTube enforces video grayscale by default, blocks addictive Shorts feeds, shields comments and live chats, captures timestamped study notes in an in-player drawer, and intelligently classifies recommendation thumbnails using state-of-the-art Local and Cloud Large Language Models (LLMs).

---

## 🚀 Hackathon & Submission Quick Links

- 📖 **[Comprehensive Setup & Installation Guide (SETUP.md)](SETUP.md)**: 5-minute zero-setup quickstart, step-by-step backend guide, LLM provider setup, and troubleshooting.
- 🏗️ **[System Architecture & Design (ARCHITECTURE.md)](ARCHITECTURE.md)**: Full architecture diagram, sequence flows, SQLite caching mechanics, and zero-client-secret security model.
- 🔌 **[Backend API Reference (backend/README.md)](backend/README.md)**: FastAPI endpoints, Pydantic schemas, and cURL examples.

---

## 📑 Table of Contents

- [Executive Overview](#-executive-overview)
- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Technical Working & Inner Mechanics](#-technical-working--inner-mechanics)
  - [1. DOM Discovery & Recommendation Processing](#1-dom-discovery--recommendation-processing)
  - [2. Sequential Classification Queue (Anti-Overload)](#2-sequential-classification-queue-anti-overload)
  - [3. LLM Provider Tier & Classification Taxonomy](#3-llm-provider-tier--classification-taxonomy)
  - [4. SQLite Classification Cache (1GB LFU Eviction)](#4-sqlite-classification-cache-1gb-lfu-eviction)
  - [5. Timestamped Study Notes (In-Player Drawer & Dashboard)](#5-timestamped-study-notes-in-player-drawer--dashboard)
  - [6. In-Player Grayscale & Native Color Overrides](#6-in-player-grayscale--native-color-overrides)
  - [7. YouTube Shorts Shield (Wiz Component Architecture)](#7-youtube-shorts-shield-wiz-component-architecture)
  - [8. Direct PostMessage Bridge (Bi-Directional Sync)](#8-direct-postmessage-bridge-bi-directional-sync)
- [12 Content Categories](#-12-content-categories)
- [Project Directory Structure](#-project-directory-structure)
- [Installation & Quickstart Guide](#-installation--quickstart-guide)
  - [1. Chrome Extension Installation](#1-chrome-extension-installation)
  - [2. Backend API Setup](#2-backend-api-setup)
  - [3. LLM Provider Configuration](#3-llm-provider-configuration)
  - [4. Web Dashboard Usage](#4-web-dashboard-usage)
- [Automated Testing & Verification](#-automated-testing--verification)
- [Security & API Key Safety](#-security--api-key-safety)
- [License & Contributing](#-license--contributing)

---

## 🎯 Executive Overview

Modern video platforms rely on hyper-stimulating thumbnails, vibrant saturated colors, endless vertical shorts, and engaging comment sections designed to maximize session length. 

StudyTube breaks this behavioral capture loop by:
1. **Removing Visual Stimulation**: Playing all videos (both Watch and Shorts) in high-contrast **grayscale** by default.
2. **Filtering Algorithmic Recommendations**: Hiding entertainment and gaming thumbnails while whitelisting educational, technical, and career-focused videos.
3. **Throttling Rapid Consumption**: Queuing video classifications sequentially to prevent system overload during fast scrolling.
4. **Eliminating Compulsive Behaviors**: Disabling infinite vertical scrolling on Shorts, hiding scroll navigation arrows, and shielding comment sections until deliberately revealed.
5. **Enabling Active Study**: Providing an integrated, timestamped study notes drawer embedded right beside YouTube watch videos, synchronized with a glassmorphism notebook dashboard.

---

## ✨ Key Features

| Feature | Description |
| :--- | :--- |
| **🧠 Real LLM Classification** | Evaluates video titles and metadata against 12 granular categories using **Ollama** (Local GPU/CPU), **Google Gemini**, or **OpenAI**. |
| **🚦 Sequential Classification Queue** | FIFO processing queue that sends one video at a time to local LLMs, preventing request spikes when fast-scrolling. |
| **💾 1GB SQLite Video Cache** | Persistent SQLite cache with canonical URL indexing and view-weighted LFU eviction discarding least-viewed videos. |
| **📝 In-Player Timestamped Notes** | Collapsible study notes drawer in YouTube Watch sidebar. Saves notes with millisecond timestamps and one-click video seek. |
| **📚 Web Notebook & Markdown Export** | Interactive notebook grouped by video with public oEmbed thumbnail retrieval and one-click Markdown export. |
| **🏷️ Thumbnail Whitelist Badges** | Renders a semi-transparent category badge (e.g. `💻 Programming Technology`) on the top-right corner of whitelisted videos. |
| **⏳ "Classification Pending" State** | Displays an unobtrusive pending indicator instead of premature blackouts while titles are awaiting LLM evaluation. |
| **🩶 Native In-Player Grayscale** | Enforces CSS grayscale filters strictly on `<video>` elements, leaving subtitles, player controls, and scrub bars clean. |
| **🎨 "View in Color" Action Buttons** | Seamless native buttons matching YouTube design specs: a pill button on Watch pages (beside Share) and a circular button on Shorts (above Like). |
| **🚫 Complete Shorts Distraction Shield** | Disables continuous wheel/key scrolling, freezes playback, removes navigation scroll arrows, and cleanly shields comments with zero layout shift. |
| **💬 Comments Section Shield** | Collapses comments on Watch and Shorts with an interactive, reversible **"Show comments"** button to restore focus on demand. |
| **💬 Live Chat Shield** | Automatically removes live stream chat streams to eliminate fast-scrolling conversational distractions. |
| **🔄 Direct Web Dashboard Bridge** | Real-time bi-directional synchronization between the deployed glassmorphism Web Dashboard (`frontend/`) and the Chrome extension via `bridge.js`. |
| **🌐 Dual-Host Network Resilience** | Automatic failover between `127.0.0.1` and `localhost` with diagnostic error handling. |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 GOOGLE CHROME                                   │
│                                                                                 │
│   ┌───────────────────────────────┐           ┌─────────────────────────────┐   │
│   │         YouTube Tab           │           │     StudyTube Dashboard     │   │
│   │     (https://youtube.com)     │           │    (http://127.0.0.1:8000)  │   │
│   │                               │           │                             │   │
│   │  ┌─────────────────────────┐  │           │  ┌───────────────────────┐  │   │
│   │  │   content.js (DOM Hook) │  │           │  │   app.js (Reactive)   │  │   │
│   │  │   • MutationObserver    │  │           │  │   • Category Toggles  │  │   │
│   │  │   • Grayscale Enforcer  │  │           │  │   • Master Shields    │  │   │
│   │  │   • Thumbnail Badges    │  │           │  │   • Notes Notebook    │  │   │
│   │  │   • In-Page Notes Drawer│  │           │  │   • AI Test Sandbox   │  │   │
│   │  │   • Shorts UI Injector  │  │           │  └───────────┬───────────┘  │   │
│   │  └────────────┬────────────┘  │                          │              │   │
│   │               │               │                          │              │   │
│   │  ┌────────────┴────────────┐  │   window.postMessage     │              │   │
│   │  │  bridge.js (Extension)  │◄─┼──────────────────────────┘              │   │
│   │  └────────────┬────────────┘  │                                         │   │
│   └───────────────┼───────────────┘                                         │   │
│                   │ chrome.runtime.sendMessage                              │   │
│                   ▼                                                         │   │
│   ┌───────────────────────────────┐           ┌─────────────────────────────┐   │
│   │  background.js (Worker)       │           │   popup.html / popup.js     │   │
│   │  • FIFO Classification Queue  │◄─────────►│   • Native Toolbar UI       │   │
│   │  • In-Memory Deduplication    │  Storage  │   • Instant Whitelist Sync  │   │
│   │  • Dual-Host Fallback Engine  │  Events   │   • Quick Presets           │   │
│   └───────────────┬───────────────┘           └─────────────────────────────┘   │
└───────────────────┼─────────────────────────────────────────────────────────────┘
                    │ HTTP POST /api/v1/classify & /api/v1/notes
                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         FASTAPI BACKEND SERVICE (PORT 8000)                     │
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  API Layer (app/main.py & app/api/v1/)                                  │   │
│   │  • CORS Regex (allows unpacked chrome-extension:// origins)             │   │
│   │  • Schema Validation (Pydantic models, title & video_id sanitization)   │   │
│   │  • Persistent SQLite Cache & Notes Services (app/services/)             │   │
│   └────────────────────────────────────┬────────────────────────────────────┘   │
│                                        │                                        │
│             ┌──────────────────────────┴──────────────────────────┐             │
│             ▼                                                     ▼             │
│   ┌───────────────────────────────────┐                 ┌───────────────────┐   │
│   │ SQLite Classification Cache       │                 │ SQLite Notes DB   │   │
│   │ • 1GB Max Capacity                │                 │ • Video Grouped   │   │
│   │ • View-based LFU Eviction         │                 │ • oEmbed Metadata │   │
│   │ • Canonical YouTube URLs          │                 │ • Markdown Export │   │
│   └─────────────────┬─────────────────┘                 └───────────────────┘   │
└─────────────────────┼───────────────────────────────────────────────────────────┘
                      │
     ┌────────────────┴────────────────┐
     ▼                                 ▼
┌────────────────────────────────┐   ┌────────────────────────────────┐
│       LOCAL LLM (OLLAMA)       │   │       CLOUD LLM PROVIDERS      │
│ • http://localhost:11434/v1    │   │ • Google Gemini API            │
│ • llama3.2:3b / qwen2.5        │   │   (gemini-1.5-flash)           │
│ • 100% Free, Offline & Private │   │ • OpenAI (gpt-4o-mini)         │
│ • GPU Accelerated (RTX / CUDA) │   │ • Offline Rule Mock Classifier │
└────────────────────────────────┘   └────────────────────────────────┘
```

---

## ⚙️ Technical Working & Inner Mechanics

### 1. DOM Discovery & Recommendation Processing

YouTube is a dynamic Single Page Application (SPA) driven by Polymer and Wiz custom elements. Video cards are continuously mounted, unmounted, and recycled during navigation:

- **Debounced MutationObserver**: Observes `document.documentElement` for subtree modifications, throttling layout evaluations through `requestAnimationFrame`.
- **Card Target Recognition**: Accurately targets standard videos (`ytd-rich-item-renderer`, `ytd-video-renderer`, `ytd-compact-video-renderer`), notification items, search results, and grid lockups (`yt-lockup-view-model`).
- **Data Extraction**: Extracts `video_id`, title text, channel name, views count, and href without triggering premature DOM reflows.

### 2. Sequential Classification Queue (Anti-Overload)

Local LLMs (e.g., Ollama running `llama3.2:3b` on consumer GPUs) can become bottlenecked when users scroll quickly past 30+ recommendation cards at once.

StudyTube prevents server congestion using a client-side **FIFO Classification Queue**:
- **Classification Pending State**: While queued, thumbnails display a minimal, modern overlay labeled `⏳ Classification pending...` instead of an abrupt blackout.
- **Whitelist Badge Placement**: Once classified, approved videos receive a lightweight category pill badge (`.studytube-category-pill`) in the top-right corner of their thumbnail.

### 3. LLM Provider Tier & Classification Taxonomy

The backend accepts classification requests at `POST /api/v1/classify`, validated against strict Pydantic models.

#### Prompt Isolation & Output Sanitization
To preserve user privacy and reduce inference latency, the classifier sends **only the sanitized title** to the LLM (raw URLs, user IDs, and channel details are stripped before inference):
```
You are a video classification assistant. Classify the YouTube video into exactly ONE category.
Allowed categories: education_academics, programming_technology, career_business, productivity_self_improvement, health_fitness, news_current_affairs, documentaries_explainers, gaming, entertainment_comedy, music, lifestyle_vlogs, hobbies_creative_arts.
Respond with ONLY the exact category name. Do not include punctuation, markdown, or explanation.
```

#### Safe Fallback Policy
If an LLM experiences network timeout or returns malformed text:
- The system automatically assigns a random defined category (excluding `unknown`).
- Flags the response with `is_fallback: true` and sets `confidence: 0.1`.
- **Never stores fallback results in the persistent cache**, ensuring subsequent requests retry classification properly.

### 4. SQLite Classification Cache (1GB LFU Eviction)

To prevent redundant LLM invocations and keep disk usage strictly controlled:
- **Canonical URL Indexing**: Normalizes short links (`youtu.be/...`), watch links (`/watch?v=...`), and shorts (`/shorts/...`) into a canonical key.
- **1GB Threshold & View-Weighted LFU Eviction**: If cache disk consumption reaches 1GB, an automated background eviction cleans out entries with the lowest YouTube view counts, preserving high-value popular tutorials.
- **WAL Journaling**: Executes with `PRAGMA journal_mode = WAL` and full auto-vacuum for high-concurrency read performance.

### 5. Timestamped Study Notes (In-Player Drawer & Dashboard)

StudyTube includes an integrated note-taking system for video learners:
- **In-Page Watch Sidebar Drawer**: Collapsible note-taking panel embedded directly into YouTube Watch pages. Reads `player.currentTime` at the click of a button or keypress.
- **Instant Timestamp Seek**: Clicking any timestamp pill (e.g., `04:12`) seeks the YouTube player directly to that second.
- **Zero API-Key Metadata Resolution**: Backend leverages YouTube's public oEmbed service to resolve video titles and high-resolution thumbnail images automatically.
- **Web Notebook**: Full-screen notebook in the glassmorphism dashboard grouping notes video-by-video, with live keyword search and one-click Markdown export.

### 6. In-Player Grayscale & Native Color Overrides

Grayscale is enforced selectively on active video surfaces (`video`, `.html5-main-video`, `.ytp-ce-element`) while keeping YouTube's timeline, scrub bar, captions, and playback controls in full color.

- **Scoped Color Toggle (Watch Pages)**: Injects a native-style pill button beside the **Share** button in `#top-level-buttons-computed`.
- Uses YouTube's exact pill typography (`Roboto`, 14px, 500 weight), 36px height, 18px radius, and adaptive dark/light mode tokens (`var(--yt-spec-badge-chip-background)`).
- Toggles grayscale on/off for the active video. The override automatically resets to grayscale as soon as the user navigates to another video.

### 7. YouTube Shorts Shield (Wiz Component Architecture)

Modern YouTube Shorts uses custom elements (`<reel-action-bar-view-model class="ytwReelActionBarViewModelHost ytwReelActionBarViewModelHostDesktop">`) rather than legacy Polymer IDs.

- **Idempotent Injection**: Locates `<reel-action-bar-view-model>` and injects a 48x48px circular **Color** toggle button directly above the native Like button.
- **Ancestor Overflow Handling**: Sets `overflow: visible !important;` across 4 parent overlay hierarchy levels (`ytwReelsPlayerOverlayLayoutViewModelHostActionBar`, `ytd-reel-player-overlay-renderer`), guaranteeing the top toggle button is never clipped.
- **Comments & Orphan Count Shield**: Targets both the comment button and sibling count elements (`#comments-button + *`, `:has([aria-label*="comment" i])`), eliminating orphaned numbers from floating in the action bar.
- **Scroll Lock & Navigation Arrow Removal**: Strips navigation up/down buttons and intercepts wheel/keydown events when Shorts scrolling is blocked.

### 8. Direct PostMessage Bridge (Bi-Directional Sync)

To ensure the web dashboard can be deployed independently of the backend while remaining synchronized with the extension:
- `extension/bridge.js` runs at `document_start` on the dashboard domain.
- Listens for `window.postMessage` events of type `STUDYTUBE_SET_SETTINGS`.
- Immediately commits updates to Chrome extension storage (`chrome.storage.local.set`).
- When settings change in the Chrome popup, `chrome.storage.onChanged` dispatches a `STUDYTUBE_SETTINGS_UPDATED` message back to the dashboard, providing zero-latency two-way synchronization.

---

## 🗂️ 12 Content Categories

| Category Slug | Display Name | Included Topics |
| :--- | :--- | :--- |
| `education_academics` | 🎓 Education & Academics | Lectures, math, science, history, academic tutorials, university courses |
| `programming_technology` | 💻 Programming & Tech | Software development, AI, hardware, coding tutorials, cybersecurity |
| `career_business` | 💼 Career & Business | Finance, entrepreneurship, investing, resume reviews, marketing |
| `productivity_self_improvement` | ⚡ Productivity & Growth | Time management, study habits, book summaries, mental discipline |
| `health_fitness` | 🏋️ Health & Fitness | Workouts, nutrition, physical therapy, sports science |
| `documentaries_explainers` | 🎥 Documentaries & Deep Dives | Investigative journalism, video essays, deep explainer videos |
| `news_current_affairs` | 📰 News & Current Affairs | Global news, economics, political analysis, journalism |
| `hobbies_creative_arts` | 🎨 Hobbies & Arts | Woodworking, digital art, photography, 3D modeling, cooking |
| `gaming` | 🎮 Gaming | Let's plays, esports, walkthroughs, stream highlights |
| `entertainment_comedy` | 🍿 Entertainment & Comedy | Sketches, memes, movie reviews, reaction videos, drama |
| `music` | 🎵 Music & Audio | Music videos, tracks, covers, live concert recordings |
| `lifestyle_vlogs` | ☕ Lifestyle & Vlogs | Daily routines, travel vlogs, unboxing, celebrity content |

---

## 📂 Project Directory Structure

```
studytube/
├── README.md                      # Complete system documentation & overview
├── SETUP.md                       # 5-minute hackathon setup & developer guide
├── ARCHITECTURE.md                # System architecture, sequence diagrams & design
├── .gitignore                     # Git ignore rules for secrets, virtual environments, caches
├── extension/                     # Manifest V3 Chrome Extension
│   ├── manifest.json              # Extension metadata, permissions & content script declarations
│   ├── background.js              # Service worker handling API requests, deduplication & caching
│   ├── content.js                 # Content script for grayscale, DOM shields, queue, notes & badges
│   ├── content.css                # CSS rules for shields, badges, overlays, notes panel & color buttons
│   ├── bridge.js                  # PostMessage bridge for zero-backend web dashboard synchronization
│   ├── popup.html                 # Native Chrome popup interface
│   ├── popup.css                  # Modern dark-mode popup stylesheet
│   ├── popup.js                   # Popup state manager with presets and whitelist toggles
│   └── icons/                     # Extension branding icons (16x16, 48x48, 128x128)
├── frontend/                      # Web Dashboard & Notebook Command Center
│   ├── index.html                 # Dark-mode dashboard with master controls, category grid & notebook
│   ├── style.css                  # Responsive glassmorphism styling
│   └── app.js                     # Two-way sync engine, live AI classifier sandbox & notes manager
└── backend/                       # FastAPI Classification Microservice
    ├── requirements.txt           # Python dependencies (FastAPI, Uvicorn, Pydantic, HTTPX, Pytest)
    ├── .env.example               # Environment template for LLM configuration
    ├── README.md                  # Backend API specification and endpoint documentation
    ├── verify_backend.py          # Standalone verification script for backend validation
    ├── app/
    │   ├── main.py                # FastAPI application instance, CORS configuration & lifecycle hooks
    │   ├── config.py              # Pydantic Settings reading environment variables
    │   ├── settings.json          # Persistent settings storage for the web dashboard
    │   ├── api/v1/
    │   │   ├── router.py          # Root API router
    │   │   └── endpoints/
    │   │       ├── classify.py    # POST /api/v1/classify video classification endpoint
    │   │       ├── health.py      # GET /health & GET /api/v1/health status checks
    │   │       ├── notes.py       # CRUD endpoints for timestamped video notes
    │   │       └── settings.py    # GET & POST /api/v1/settings synchronization endpoint
    │   ├── schemas/
    │   │   ├── video.py           # Pydantic models for classification requests and responses
    │   │   ├── notes.py           # Note creation, response, and video grouping models
    │   │   ├── settings.py        # Settings validation schemas
    │   │   └── health.py          # Health status models
    │   └── services/
    │       ├── cache.py           # 1GB SQLite classification cache with view-weighted LFU eviction
    │       ├── classifier.py      # Classifier implementations: Ollama, Gemini, OpenAI, Placeholder
    │       └── notes_service.py   # SQLite notes management & YouTube oEmbed metadata resolution
    └── tests/
        ├── conftest.py            # TestClient fixtures and Starlette compatibility shims
        ├── test_classify.py       # Validation tests, CORS checks, and classifier hot-swapping
        ├── test_filtering_policy.py # Whitelist matching, Shorts extraction, and chat shield tests
        ├── test_health.py         # Health endpoint & OpenAPI documentation tests
        ├── test_llm_and_categories.py # Mocks for Gemini, OpenAI, Ollama, caching, and fallback
        ├── test_notes.py          # Timestamp parser, oEmbed extraction, SQLite CRUD tests
        ├── test_settings.py       # Settings persistence and synchronization tests
        └── test_sqlite_cache.py   # SQLite cache eviction, view counts, and prompt isolation tests
```

---

## 🚀 Installation & Quickstart Guide

For a detailed installation walkthrough, see **[SETUP.md](SETUP.md)**.

### 1. Chrome Extension Installation

1. Open Google Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode** in the upper-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the `extension/` folder in this repository (`d:\Projects\studytube\extension`).
5. The **StudyTube** icon will now appear in your browser toolbar.

---

### 2. Backend API Setup

```powershell
# Navigate to backend directory
cd d:\Projects\studytube\backend

# Install dependencies
pip install -r requirements.txt

# Initialize environment configuration
Copy-Item .env.example .env

# Start FastAPI development server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
Confirm the server is running by opening `http://127.0.0.1:8000/docs` in your browser.

---

### 3. LLM Provider Configuration

Configure your chosen AI model in `backend/.env`:

#### Option A: Local Ollama (Recommended — 100% Free & Private)
```bash
ollama run llama3.2:3b
```
In `backend/.env`:
```env
LLM_PROVIDER="ollama"
LLM_MODEL="llama3.2:3b"
LLM_BASE_URL="http://localhost:11434/v1"
LLM_TIMEOUT_SECONDS=15.0
```

#### Option B: Google Gemini
```env
LLM_PROVIDER="gemini"
LLM_API_KEY="AIzaSyYourGeminiApiKeyHere"
LLM_MODEL="gemini-1.5-flash"
```

#### Option C: OpenAI / Compatible
```env
LLM_PROVIDER="openai"
LLM_API_KEY="sk-YourOpenAIApiKeyHere"
LLM_MODEL="gpt-4o-mini"
```

#### Option D: Offline / Placeholder (Zero Setup)
```env
LLM_PROVIDER="placeholder"
```

---

### 4. Web Dashboard & Notebook Usage

- Open `frontend/index.html` directly in Chrome, or navigate to `http://127.0.0.1:8000/dashboard` when the backend is running.
- **Controls Available**:
  - **Master Switch**: Enable or disable StudyTube globally.
  - **Distraction Shields**: Toggle Shorts scroll lock, Shorts playback, comments shield, and live chat shield.
  - **Presets**: 1-click presets including **🎓 Study Focus**, **Strict Tech**, **Allow All**, and **Block All**.
  - **Video Notes Notebook**: View all video notes organized by video, jump to timestamps, and export to Markdown.
  - **AI Sandbox**: Paste any YouTube title or URL to inspect the LLM's classification result, confidence score, and latency in real time.

---

## 🧪 Automated Testing & Verification

StudyTube features an automated test suite with **46 comprehensive unit and integration tests** verifying backend health, schema validation, CORS headers, LLM error handling, fallback properties, in-memory caching, request deduplication, filtering policies, SQLite LFU eviction, and video timestamped notes taking.

### Run the Test Suite

From the repository root:
```powershell
pytest backend/tests -v
```

**Expected Output:**
```text
============================= 46 passed in 18.97s =============================
```

**Test Suite Coverage Summary:**
- `test_classify.py`: Valid payload processing, required fields validation, title/video ID boundary checks, CORS preflight headers, and dynamic classifier swapping.
- `test_filtering_policy.py`: Educational category whitelisting, fallback resilience for failed classifications, Shorts URL regex matching, video ID extraction, and manual color override lifecycle.
- `test_health.py`: Root `/health`, `/api/v1/health`, and OpenAPI documentation availability.
- `test_llm_and_categories.py`: Category definitions, structured response parsing, Gemini/OpenAI mocked error handling, fallback score invariants, and concurrent request deduplication.
- `test_notes.py`: Timestamp parser and formatter, video ID extraction, SQLite notes isolated service, API CRUD routes, and validation errors.
- `test_settings.py`: Settings read/write endpoints and schema validation.
- `test_sqlite_cache.py`: Canonical YouTube URL parsing, SQLite cache store/retrieve, view counts updates, 1GB LFU eviction policy, prompt isolation verification, and inference time persistence.

### Run Backend Verification Script
```powershell
python backend/verify_backend.py
```
Expected output:
```text
[SUCCESS] ALL VERIFICATION CHECKS PASSED!
```

### Validate Frontend & Extension Scripts
```powershell
node -c extension/content.js extension/popup.js extension/background.js extension/bridge.js frontend/app.js
```

---

## 🔒 Security & API Key Safety

StudyTube strictly adheres to the principle of **Zero Client Secrets**:
- **No API Keys in Client Code**: Cloud LLM API keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`) are kept exclusively on the server in `backend/.env`. The Chrome extension and Web Dashboard never see or store API keys.
- **No API Keys Committed in Git**: `.gitignore` strictly ignores `.env`, `*.env`, `data/`, and database files. All examples and tests use non-functional placeholder strings (e.g., `AIzaSy...`, `sk-...`, `test-api-key`).
- **Data Minimization in Prompts**: The backend only passes the video title and category enum to the LLM. Personal user information, browsing cookies, and watch histories are never collected or transmitted.
- **YouTube Public oEmbed**: Video titles and thumbnails for notes are fetched via YouTube's public oEmbed service, requiring zero YouTube Data API keys.

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.
