# StudyTube — Intelligent Focus Mode, Category Whitelisting & LLM Classifier

**StudyTube** is an open-source, AI-powered productivity system engineered to transform YouTube from an algorithmic distraction loop into a focused learning environment. Built as a Manifest V3 Chrome extension, reactive glassmorphism web dashboard, and high-performance FastAPI backend, StudyTube enforces video grayscale by default, blocks addictive Shorts feeds, shields comments and live chats, and intelligently classifies recommendation thumbnails using state-of-the-art Local and Cloud Large Language Models (LLMs).

---

## 📑 Table of Contents

- [Executive Overview](#-executive-overview)
- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Technical Working & Inner Mechanics](#-technical-working--inner-mechanics)
  - [1. DOM Discovery & Recommendation Processing](#1-dom-discovery--recommendation-processing)
  - [2. Sequential Classification Queue (Anti-Overload)](#2-sequential-classification-queue-anti-overload)
  - [3. LLM Provider Tier & Classification Taxonomy](#3-llm-provider-tier--classification-taxonomy)
  - [4. In-Player Grayscale & Native Color Overrides](#4-in-player-grayscale--native-color-overrides)
  - [5. YouTube Shorts Shield (Wiz Component Architecture)](#5-youtube-shorts-shield-wiz-component-architecture)
  - [6. Direct PostMessage Bridge (Bi-Directional Sync)](#6-direct-postmessage-bridge-bi-directional-sync)
- [12 Content Categories](#-12-content-categories)
- [Project Directory Structure](#-project-directory-structure)
- [Installation & Quickstart Guide](#-installation--quickstart-guide)
  - [1. Chrome Extension Installation](#1-chrome-extension-installation)
  - [2. Backend API Setup](#2-backend-api-setup)
  - [3. LLM Provider Configuration](#3-llm-provider-configuration)
  - [4. Web Dashboard Usage](#4-web-dashboard-usage)
- [Automated Testing & Verification](#-automated-testing--verification)
- [License & Contributing](#-license--contributing)

---

## 🎯 Executive Overview

Modern video platforms rely on hyper-stimulating thumbnails, vibrant saturated colors, endless vertical shorts, and engaging comment sections designed to maximize session length. 

StudyTube breaks this behavioral capture loop by:
1. **Removing Visual Stimulation**: Playing all videos (both Watch and Shorts) in high-contrast **grayscale** by default.
2. **Filtering Algorithmic Recommendations**: Hiding entertainment and gaming thumbnails while whitelisting educational, technical, and career-focused videos.
3. **Throttling Rapid Consumption**: Queuing video classifications sequentially to prevent system overload during fast scrolling.
4. **Eliminating Compulsive Behaviors**: Disabling infinite vertical scrolling on Shorts, hiding scroll navigation arrows, and shielding comment sections until deliberately revealed.

---

## ✨ Key Features

| Feature | Description |
| :--- | :--- |
| **🧠 Real LLM Classification** | Evaluates video titles, channel names, and metadata against 12 granular categories using **Ollama** (Local GPU/CPU), **Google Gemini**, or **OpenAI**. |
| **🚦 Sequential Classification Queue** | FIFO processing queue that sends one video at a time to local LLMs, preventing request spikes when fast-scrolling. |
| **🏷️ Thumbnail Whitelist Badges** | Renders a semi-transparent category badge (e.g. `💻 Programming Technology`) on the top-right corner of whitelisted videos. |
| **⏳ "Classification Pending" State** | Displays an unobtrusive pending indicator instead of premature blackouts while titles are awaiting LLM evaluation. |
| **🩶 Native In-Player Grayscale** | Enforces CSS grayscale filters strictly on `<video>` elements, leaving subtitles, player controls, and scrub bars clean. |
| **🎨 "View in Color" Action Buttons** | Seamless native buttons matching YouTube design specs: a pill button on Watch pages (beside Share) and a circular button on Shorts (above Like). |
| **🚫 Complete Shorts Distraction Shield** | Disables continuous wheel/key scrolling, freezes playback, removes navigation scroll arrows, and cleanly shields comments with zero layout shift. |
| **💬 Comments Section Shield** | Collapses comments on Watch and Shorts with an interactive, reversible **"Show comments"** button to restore focus on demand. |
| **💬 Live Chat Shield** | Automatically removes live stream chat streams to eliminate fast-scrolling conversational distractions. |
| **🔄 Direct Web Dashboard Bridge** | Real-time bi-directional synchronization between the deployed glassmorphism Web Dashboard (`frontend/`) and the Chrome extension via `bridge.js`. |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 GOOGLE CHROME                                   │
│                                                                                 │
│   ┌───────────────────────────────┐           ┌─────────────────────────────┐   │
│   │         YouTube Tab           │           │     StudyTube Dashboard     │   │
│   │     (https://youtube.com)     │           │      (frontend/index.html)  │   │
│   │                               │           │                             │   │
│   │  ┌─────────────────────────┐  │           │  ┌───────────────────────┐  │   │
│   │  │   content.js (DOM Hook) │  │           │  │   app.js (Reactive)   │  │   │
│   │  │   • MutationObserver    │  │           │  │   • Category Toggles  │  │   │
│   │  │   • Grayscale Enforcer  │  │           │  │   • Master Shields    │  │   │
│   │  │   • Thumbnail Badges    │  │           │  │   • AI Test Sandbox   │  │   │
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
│   │  • chrome.storage.local Cache │  Events   │   • Quick Presets           │   │
│   └───────────────┬───────────────┘           └─────────────────────────────┘   │
└───────────────────┼─────────────────────────────────────────────────────────────┘
                    │ HTTP POST /api/v1/classify
                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         FASTAPI BACKEND SERVICE (PORT 8000)                     │
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  API Layer (app/main.py & app/api/v1/)                                  │   │
│   │  • CORS Headers (allows Chrome extensions & Web dashboards)             │   │
│   │  • Schema Validation (Pydantic models, title & video_id sanitization)   │   │
│   │  • Settings Persistence (app/settings.json)                             │   │
│   └────────────────────────────────────┬────────────────────────────────────┘   │
│                                        │                                        │
│   ┌────────────────────────────────────▼────────────────────────────────────┐   │
│   │  Classification Service (app/services/classifier.py)                    │   │
│   │  • In-Memory Thread-Safe LRU Cache (video_id keyed)                     │   │
│   │  • In-Flight Request Deduplication                                      │   │
│   │  • Strict Single-Word Category Prompt & Sanitizer                       │   │
│   │  • Deterministic Fallback Policy (is_fallback: true, never cached)      │   │
│   └────────────────────────────────────┬────────────────────────────────────┘   │
└────────────────────────────────────────┼────────────────────────────────────────┘
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
   ┌─────────────────────────────────┐       ┌─────────────────────────────────┐
   │        LOCAL LLM (OLLAMA)       │       │        CLOUD LLM PROVIDERS      │
   │  • http://localhost:11434/v1    │       │  • Google Gemini API            │
   │  • llama3.2:3b / qwen2.5        │       │    (gemini-1.5-flash)           │
   │  • 100% Free & Private          │       │  • OpenAI (gpt-4o-mini)         │
   │  • GPU Accelerated (RTX / CUDA) │       │  • Offline Rule Mock            │
   └─────────────────────────────────┘       └─────────────────────────────────┘
```

---

## ⚙️ Technical Working & Inner Mechanics

### 1. DOM Discovery & Recommendation Processing

YouTube is a dynamic Single Page Application (SPA) driven by Polymer and Wiz custom elements. Video cards are continuously mounted, unmounted, and recycled during navigation:

- **Debounced MutationObserver**: Observes `document.documentElement` for subtree modifications, throttling layout evaluations through `requestAnimationFrame`.
- **Card Target Recognition**: Accurately targets standard videos (`ytd-rich-item-renderer`, `ytd-video-renderer`, `ytd-compact-video-renderer`), notification items, search results, and grid lockups (`yt-lockup-view-model`).
- **Data Extraction**: Extracts `video_id`, title text, channel name, and href without triggering premature DOM reflows.

### 2. Sequential Classification Queue (Anti-Overload)

Local LLMs (e.g., Ollama running `llama3.2:3b` on consumer GPUs) can become bottlenecked when users scroll quickly past 30+ recommendation cards at once.

StudyTube prevents server congestion using a client-side **FIFO Classification Queue**:
```javascript
// extension/content.js
class VideoClassificationQueue {
  enqueue(videoData, onComplete) {
    this.queue.push({ videoData, onComplete });
    this.processNext();
  }
  async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    const { videoData, onComplete } = this.queue.shift();
    try {
      const result = await requestClassification(videoData);
      onComplete(result);
    } finally {
      this.isProcessing = false;
      this.processNext(); // Send next item only after previous completes
    }
  }
}
```
- **Classification Pending State**: While queued, thumbnails display a minimal, modern overlay labeled `⏳ Classification pending...` instead of an abrupt blackout.
- **Whitelist Badge Placement**: Once classified, approved videos receive a lightweight category pill badge (`.studytube-category-pill`) in the top-right corner of their thumbnail.

### 3. LLM Provider Tier & Classification Taxonomy

The backend accepts classification requests at `POST /api/v1/classify`, validated against strict Pydantic models.

```json
// POST /api/v1/classify
{
  "video_id": "M576WGiDBdQ",
  "title": "Introduction to Algorithms and Data Structures",
  "channel_name": "MIT OpenCourseWare",
  "url": "https://www.youtube.com/watch?v=M576WGiDBdQ"
}
```

#### Prompt Engineering & Output Sanitization
The classifier formats instructions with strict few-shot examples and schema bounds:
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

### 4. In-Player Grayscale & Native Color Overrides

Grayscale is enforced selectively on active video surfaces (`video`, `.html5-main-video`, `.ytp-ce-element`) while keeping YouTube's timeline, scrub bar, captions, and playback controls in full color.

#### Scoped Color Toggle (Watch Pages)
- StudyTube injects a native-style pill button beside the **Share** button in `#top-level-buttons-computed`.
- Uses YouTube's exact pill typography (`Roboto`, 14px, 500 weight), 36px height, 18px radius, and adaptive dark/light mode tokens (`var(--yt-spec-badge-chip-background)`).
- Clicking toggles grayscale on/off for the active video. The override automatically resets to grayscale as soon as the user navigates to another video.

### 5. YouTube Shorts Shield (Wiz Component Architecture)

Modern YouTube Shorts uses custom elements (`<reel-action-bar-view-model class="ytwReelActionBarViewModelHost ytwReelActionBarViewModelHostDesktop">`) rather than legacy Polymer IDs.

- **Idempotent Injection**: Locates `<reel-action-bar-view-model>` and injects a 48x48px circular **Color** toggle button directly above the native Like button.
- **Ancestor Overflow Handling**: Sets `overflow: visible !important;` across 4 parent overlay hierarchy levels (`ytwReelsPlayerOverlayLayoutViewModelHostActionBar`, `ytd-reel-player-overlay-renderer`), guaranteeing the top toggle button is never clipped.
- **Comments & Orphan Count Shield**: Targets both the comment button and sibling count elements (`#comments-button + *`, `:has([aria-label*="comment" i])`), eliminating orphaned numbers like `79` from floating in the action bar.
- **Scroll Lock & Navigation Arrow Removal**: Strips navigation up/down buttons (`#navigation-button-down`, `#navigation-button-up`) and intercepts wheel events when Shorts scrolling is blocked.

### 6. Direct PostMessage Bridge (Bi-Directional Sync)

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
├── README.md                      # Complete system documentation & architecture
├── .gitignore                     # Git ignore rules for secrets, virtual environments, caches
├── extension/                     # Manifest V3 Chrome Extension
│   ├── manifest.json              # Extension metadata, permissions & content script declarations
│   ├── background.js              # Service worker handling API requests, deduplication & caching
│   ├── content.js                 # Content script for grayscale, DOM shields, queue, and badges
│   ├── content.css                # CSS rules for shields, badges, overlays, and color buttons
│   ├── bridge.js                  # PostMessage bridge for zero-backend web dashboard synchronization
│   ├── popup.html                 # Native Chrome popup interface
│   ├── popup.css                  # Modern dark-mode popup stylesheet
│   ├── popup.js                   # Popup state manager with presets and whitelist toggles
│   └── icons/                     # Extension branding icons (16x16, 48x48, 128x128)
├── frontend/                      # Web Dashboard Command Center
│   ├── index.html                 # Dark-mode dashboard with master controls, category grid & sandbox
│   ├── style.css                  # Responsive glassmorphism styling
│   └── app.js                     # Two-way sync engine and live AI classifier testing sandbox
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
    │   │       └── settings.py    # GET & POST /api/v1/settings synchronization endpoint
    │   ├── schemas/
    │   │   ├── video.py           # Pydantic models for classification requests and responses
    │   │   ├── settings.py        # Settings validation schemas
    │   │   └── health.py          # Health status models
    │   └── services/
    │       └── classifier.py      # Classifier implementations: Ollama, Gemini, OpenAI, Placeholder
    └── tests/
        ├── conftest.py            # TestClient fixtures and Starlette compatibility shims
        ├── test_classify.py       # Validation tests, CORS checks, and classifier hot-swapping
        ├── test_filtering_policy.py # Whitelist matching, Shorts extraction, and chat shield tests
        ├── test_health.py         # Health endpoint & OpenAPI documentation tests
        ├── test_llm_and_categories.py # Mocks for Gemini, OpenAI, Ollama, caching, and fallback
        └── test_settings.py       # Settings persistence and synchronization tests
```

---

## 🚀 Installation & Quickstart Guide

### 1. Chrome Extension Installation

1. Open Google Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode** in the upper-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the `extension/` folder in this repository (`d:\Projects\studytube\extension`).
5. The **StudyTube** icon will now appear in your browser toolbar.

---

### 2. Backend API Setup

#### Prerequisites
- **Python 3.10+**
- **pip**

#### Setup Steps

1. Open a terminal in the `backend/` folder:
   ```powershell
   cd d:\Projects\studytube\backend
   ```
2. Install Python dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
3. Initialize your `.env` configuration file:
   ```powershell
   # Windows PowerShell
   Copy-Item .env.example .env

   # Linux / macOS
   cp .env.example .env
   ```
4. Start the FastAPI development server:
   ```powershell
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```
5. Confirm the server is running by opening `http://127.0.0.1:8000/docs` in your browser.

---

### 3. LLM Provider Configuration

Configure your chosen AI model in `backend/.env`:

#### Option A: Local Ollama (Recommended — 100% Free & Private)
Run any local model with GPU or CPU acceleration without API keys:
1. Download and start [Ollama](https://ollama.com).
2. Pull your desired model:
   ```bash
   ollama run llama3.2:3b
   ```
3. Update `backend/.env`:
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

### 4. Web Dashboard Usage

The interactive glassmorphism Web Dashboard is located in `frontend/`.

- Open `frontend/index.html` directly in Chrome, or navigate to `http://127.0.0.1:8000/dashboard` when the backend is running.
- **Controls Available**:
  - **Master Switch**: Enable or disable StudyTube globally.
  - **Distraction Shields**: Toggle Shorts scroll lock, Shorts playback, comments shield, and live chat shield.
  - **Presets**: 1-click presets including **🎓 Study Focus**, **Strict Tech**, **Allow All**, and **Block All**.
  - **AI Sandbox**: Paste any YouTube title or URL to inspect the LLM's classification result, confidence score, and latency in real time.

---

## 🧪 Automated Testing & Verification

StudyTube features an automated test suite with **34 comprehensive unit and integration tests** verifying backend health, schema validation, CORS headers, LLM error handling, fallback properties, in-memory caching, request deduplication, and filtering policies.

### Run the Test Suite

From the repository root:
```powershell
pytest backend/tests -v
```

**Test Suite Coverage Summary:**
- `test_classify.py`: Valid payload processing, required fields validation, title/video ID boundary checks, CORS preflight headers, and dynamic classifier swapping.
- `test_filtering_policy.py`: Educational category whitelisting, fallback resilience for failed classifications, Shorts URL regex matching, video ID extraction, and manual color override lifecycle.
- `test_health.py`: Root `/health`, `/api/v1/health`, and OpenAPI documentation availability.
- `test_llm_and_categories.py`: Category definitions, structured response parsing, Gemini/OpenAI mocked error handling, fallback score invariants, and concurrent request deduplication.
- `test_settings.py`: Settings read/write endpoints and schema validation.

### Run Backend Verification Script
```powershell
python backend/verify_backend.py
```
Expected output:
```
[SUCCESS] ALL VERIFICATION CHECKS PASSED!
```

### Validate Frontend & Extension Scripts
```powershell
node -c extension/content.js extension/popup.js extension/background.js extension/bridge.js frontend/app.js
```

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.
