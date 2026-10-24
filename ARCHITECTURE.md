# 🏗️ StudyTube — Technical Architecture & System Design

This document details the concrete technical architecture, implemented module boundaries, runtime sequence flows, data lifecycle, caching mechanisms, and security model of **StudyTube**.

---

## 📑 Table of Contents

- [1. Executive System Overview](#1-executive-system-overview)
- [2. System Architecture Diagram](#2-system-architecture-diagram)
- [3. Subsystem Breakdown](#3-subsystem-breakdown)
  - [3.1 Chrome Extension (Manifest V3)](#31-chrome-extension-manifest-v3)
  - [3.2 FastAPI Backend Microservice](#32-fastapi-backend-microservice)
  - [3.3 AI Classification Tier (Local Ollama)](#33-ai-classification-tier-local-ollama)
  - [3.4 Persistent Storage Tier (SQLite)](#34-persistent-storage-tier-sqlite)
  - [3.5 Reactive Web Dashboard](#35-reactive-web-dashboard)
- [4. Core Workflows & Sequence Diagrams](#4-core-workflows--sequence-diagrams)
  - [4.1 Video Card Discovery & Classification Flow](#41-video-card-discovery--classification-flow)
  - [4.2 Timestamped Video Notes Taking & Metadata Resolution](#42-timestamped-video-notes-taking--metadata-resolution)
  - [4.3 YouTube Shorts Distraction Shielding & Wiz Injection](#43-youtube-shorts-distraction-shielding--wiz-injection)
  - [4.4 Cross-Context Settings Synchronization](#44-cross-context-settings-synchronization)
- [5. Cache Architecture & LFU Eviction Mechanics](#5-cache-architecture--lfu-eviction-mechanics)
- [6. Security & Privacy Model](#6-security--privacy-model)
- [7. Implemented Technology Stack](#7-implemented-technology-stack)

---

## 1. Executive System Overview

StudyTube is an end-to-end focus and productivity system for YouTube. It decouples in-browser user interface interception from backend computation (Large Language Model inference, semantic classification, persistent caching, and note storage).

### Key Architectural Pillars:
1. **Zero-Overhead DOM Interception**: Employs debounced MutationObservers and CSS-first filtering on YouTube's dynamic Single Page Application (Polymer/Wiz custom elements).
2. **Client-Side Anti-Overload Queuing**: Enforces a strict FIFO classification queue in the Chrome extension so rapid scrolling does not swamp the local Ollama LLM.
3. **Multi-Tier Caching Hierarchy**: Three-level cache (Extension In-Memory -> Service Worker Map -> Persistent SQLite 1GB LFU Cache) minimizes redundant LLM inferences to near-zero for repeating videos.
4. **Data Minimization & Privacy-First Prompts**: The local LLM receives strictly isolated video titles and sanitized taxonomy instructions; raw URLs, channel metadata, user tokens, and browsing histories are stripped before inference.
5. **Zero Client Secrets**: All credentials and backend settings are confined strictly to `backend/.env` and are never loaded, transmitted, or accessible to the browser client or extension scripts.

---

## 2. System Architecture Diagram

```mermaid
flowchart TB
    subgraph Browser [" Google Chrome Client "]
        subgraph YT [" YouTube Tab (https://www.youtube.com) "]
            DOM[" YouTube DOM <br/>(Polymer / Wiz Custom Elements) "]
            CS[" content.js <br/>• Debounced MutationObserver<br/>• Scoped Grayscale Filter<br/>• Shorts Shield & Wiz Injector<br/>• In-Page Notes Drawer "]
            DOM <-->|Observe & Mutate| CS
        end

        subgraph Dashboard [" StudyTube Web Dashboard "]
            UI[" app.js & index.html <br/>• Focus & Shield Controls<br/>• Category Whitelist Matrix<br/>• Video Notes Notebook<br/>• Realtime AI Sandbox "]
        end

        subgraph ExtCore [" Chrome Manifest V3 Core "]
            BR[" bridge.js <br/>(PostMessage Bridge) "]
            SW[" background.js (Service Worker) <br/>• FIFO Classification Queue<br/>• In-Flight Deduplication Map<br/>• Session Memory Cache<br/>• Dual-Host Fallback (127.0.0.1 / localhost) "]
            POP[" popup.html / popup.js <br/>(Toolbar Quick Controls) "]
            STORE[(" chrome.storage.local <br/>(Settings & State) ")]

            CS <-->|"chrome.runtime.sendMessage"| SW
            UI <-->|"window.postMessage"| BR
            BR <-->|"chrome.storage.local"| STORE
            POP <-->|"chrome.storage.local"| STORE
            SW <-->|"chrome.storage.local"| STORE
        end
    end

    subgraph Backend [" FastAPI Backend Service (Port 8000) "]
        API[" API Routing Layer (FastAPI) <br/>• CORS Regex Middleware<br/>• Pydantic Schema Validation "]
        
        subgraph Endpoints [" Endpoints (v1) "]
            EP_C[" POST /api/v1/classify "]
            EP_N[" /api/v1/notes (*CRUD) "]
            EP_S[" GET/POST /api/v1/settings "]
            EP_H[" GET /health "]
        end

        subgraph Services [" Business Logic Services "]
            CLASS_SVC[" Classifier Service <br/>(app/services/classifier.py) "]
            NOTE_SVC[" Notes Service <br/>(app/services/notes_service.py) "]
            OEMBED[" Public YouTube oEmbed <br/>(No API Key Required) "]
        end

        subgraph StorageTier [" Persistent Storage Tier "]
            SQLITE_CACHE[(" SQLite Classification Cache <br/>• 1GB Max Size<br/>• View-based LFU Eviction<br/>• WAL Journal Mode ")]
            SQLITE_NOTES[(" SQLite Notes Database <br/>• Video Grouped Index<br/>• Millisecond Timestamps<br/>• Markdown Exporter ")]
            SETTINGS_FILE[" settings.json <br/>(Synced User Preferences) "]
        end

        API --> EP_C & EP_N & EP_S & EP_H
        EP_C --> CLASS_SVC
        EP_N --> NOTE_SVC
        EP_S --> SETTINGS_FILE
        NOTE_SVC --> OEMBED
        CLASS_SVC <--> SQLITE_CACHE
        NOTE_SVC <--> SQLITE_NOTES
    end

    subgraph LLM_Tier [" LLM Classification Engine "]
        OLLAMA[" Local Ollama Instance <br/>• Endpoint: http://localhost:11434/v1<br/>• Model: llama3.2:3b<br/>• 100% Free, Offline & Private "]
        FALLBACK[" Deterministic Fallback Handler <br/>• Automatic fallback on timeout or connection drop "]

        CLASS_SVC --> OLLAMA
        CLASS_SVC -.->|On Timeout / Connection Error| FALLBACK
    end

    SW -->|"HTTP POST /api/v1/classify"| API
    UI -->|"HTTP REST API (CRUD)"| API
```

---

## 3. Subsystem Breakdown

### 3.1 Chrome Extension (Manifest V3)

The Chrome extension acts as the client-side orchestrator. It intercepts YouTube's layout, enforces focus rules, provides the in-page notes drawer, and proxies requests to the backend.

- **`content.js`**:
  - Injected directly into all `*://*.youtube.com/*` frames at `document_idle`.
  - Attaches a debounced `MutationObserver` to `document.documentElement` to detect newly mounted recommendation cards (`ytd-rich-item-renderer`, `ytd-video-renderer`, `ytd-compact-video-renderer`, and `yt-lockup-view-model`).
  - Manages the **FIFO VideoClassificationQueue**: ensures only 1 card is being classified at any instant to avoid overloading the local Ollama LLM.
  - Injects native-looking YouTube UI elements:
    - **Watch Color Toggle**: A pill button inserted dynamically next to YouTube's native Share button.
    - **Shorts Color Toggle**: A 48x48px circular button injected into `<reel-action-bar-view-model>`.
    - **In-Page Notes Drawer**: Collapsible sidebar notes panel embedded in the Watch sidebar.
  - Enforces DOM shields:
    - Shorts infinite scroll interceptor (`wheel`, `touchmove`, `keydown` navigation lock).
    - Shorts playback freeze & distraction screen.
    - Comments section collapsible shield (`ytd-comments`, `ytd-reel-player-overlay-renderer #comments-button`).
    - Live chat iframe removal.

- **`background.js` (Service Worker)**:
  - Event coordinator for background tasks.
  - Maintains `memoryCache` (session Map) and `inFlightRequests` Map to prevent duplicate simultaneous classifications for the same video ID.
  - Handles **Dual-Host Network Resilience**: Automatically checks `http://127.0.0.1:8000` and `http://localhost:8000`.
  - Implements safe fallback: Returns deterministic fallback categories with `is_fallback: true` on offline or timeout events.

- **`bridge.js`**:
  - Injected at `document_start` on dashboard origins and local files.
  - Bridges the web dashboard window (`window.postMessage`) and Chrome storage (`chrome.storage.local`).

- **`popup.html` / `popup.js`**:
  - Lightweight browser toolbar UI for instant toggles, quick whitelist presets (**Study Focus**, **Strict Tech**, **Allow All**, **Block All**), and backend connectivity status.

---

### 3.2 FastAPI Backend Microservice

The backend is built with **FastAPI** (`backend/app/main.py`), utilizing asynchronous event loops for non-blocking I/O.

- **Routing & Endpoints**:
  - `POST /api/v1/classify`: Accepts `video_id`, `title`, `channel_name`, `url`, `views`. Validates inputs with Pydantic and returns category classifications.
  - `GET /api/v1/notes`: Fetches notes, optionally filtered by `video_id`.
  - `POST /api/v1/notes`: Stores a new note with automatic YouTube oEmbed title/thumbnail resolution.
  - `GET /api/v1/notes/videos`: Returns all notes grouped by video for notebook cards.
  - `DELETE /api/v1/notes/{id}` & `DELETE /api/v1/notes/video/{video_id}`: Granular deletion routes.
  - `GET /api/v1/settings` & `POST /api/v1/settings`: Settings read/write synchronization with `backend/app/settings.json`.
  - `GET /health` & `GET /api/v1/health`: Operational health check reporting version, provider, and active model.
- **CORS Architecture**:
  - Uses `CORSMiddleware` with `allow_origin_regex=r"^chrome-extension://.*$"`.
  - Allows unpacked developer extensions to communicate without requiring fixed Chrome Web Store IDs.

---

### 3.3 AI Classification Tier (Local Ollama)

The classification pipeline is powered by a local **Ollama** instance running `llama3.2:3b`:

- **Host Endpoint**: `http://localhost:11434/v1` (OpenAI-compatible REST interface).
- **Active Model**: `llama3.2:3b`.
- **Classification Engine (`backend/app/services/classifier.py`)**:
  - Communicates directly with the local Ollama instance using HTTPX asynchronous calls.
  - Strips video URLs, channel names, and user identifiers, sending only the sanitized video title.
  - Uses few-shot prompt instructions demanding exactly one category slug.
- **Deterministic Fallback Handler**:
  - If Ollama is not started, is busy, or exceeds the timeout threshold (`15.0s`), the system resolves to a default safe category with `is_fallback: true` and `confidence: 0.1`.
  - Fallback responses are strictly excluded from the persistent SQLite cache so videos are properly re-classified once the LLM is available.

#### Taxonomy & Categories:
Videos are classified into one of **12 granular categories**:
`education_academics`, `programming_technology`, `career_business`, `productivity_self_improvement`, `health_fitness`, `documentaries_explainers`, `news_current_affairs`, `hobbies_creative_arts`, `gaming`, `entertainment_comedy`, `music`, `lifestyle_vlogs`.

#### Prompt Isolation & Privacy Shield:
```text
System: You are an expert YouTube video content classifier.
Classify the video into EXACTLY ONE of the allowed categories:
[education_academics, programming_technology, career_business, ...]
Respond ONLY with the exact category slug.

User:
Title: "Introduction to Dynamic Programming - Tutorial"
Category:
```

---

### 3.4 Persistent Storage Tier (SQLite)

The data tier uses two dedicated SQLite databases with WAL (Write-Ahead Logging) enabled for concurrency:

1. **SQLite Classification Cache (`data/classification_cache.db`)**:
   - Stores: `video_id`, `canonical_url`, `category`, `confidence`, `suggested_mode`, `classifier_provider`, `views_count`, `inference_time_ms`, `created_at`, `last_accessed_at`.
   - **Capacity Cap**: Hard-capped at 1GB (`1073741824 bytes`).
   - **Eviction Policy**: LFU (Least Frequently Used) based on YouTube view counts. Videos with the fewest views are evicted first when cache size approaches the 1GB threshold.
   - **URL Canonicalizer**: Canonicalizes `youtu.be`, `/watch?v=`, `/shorts/`, and `/embed/` URLs so different variants index the same cache entry.

2. **SQLite Notes Database (`data/notes.db`)**:
   - Stores: `id`, `video_id`, `video_title`, `video_url`, `thumbnail_url`, `timestamp_seconds`, `timestamp_formatted`, `note_text`, `created_at`, `updated_at`.
   - Uses YouTube oEmbed (`https://www.youtube.com/oembed?url=...&format=json`) to automatically fetch official video title and thumbnail without requiring a YouTube Data API v3 key.

---

### 3.5 Reactive Web Dashboard

Built with glassmorphism styling (`frontend/`):
- Pure Vanilla JavaScript (`app.js`) and modern CSS tokens (`style.css`).
- Zero build tools or external node_modules needed to run.
- Automatically served by FastAPI at `http://127.0.0.1:8000/dashboard` or directly executable from local disk via `file:///`.
- Two Primary Views:
  1. **Focus & Distraction Shields View**: Master switch, shorts scroll blockers, comment shield toggles, 12-category interactive whitelist matrix, and interactive AI Testing Sandbox.
  2. **Video Notes Notebook View**: Cards grouped by video with thumbnail previews, live search filtering, timestamp click-to-jump, note editing, and one-click Markdown notebook export.

---

## 4. Core Workflows & Sequence Diagrams

### 4.1 Video Card Discovery & Classification Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant YT as YouTube SPA DOM
    participant CS as content.js (Queue)
    participant BG as background.js (Worker)
    participant API as FastAPI Backend
    participant DB as SQLite Cache
    participant LLM as Local Ollama (llama3.2:3b)

    User->>YT: Scrolls YouTube Home / Watch Recommendations
    YT->>CS: MutationObserver detects new video card
    CS->>CS: Extract video_id, title, channel, views
    CS->>CS: Enqueue into FIFO VideoClassificationQueue
    CS->>YT: Inject "⏳ Classification pending..." badge

    CS->>BG: chrome.runtime.sendMessage(CLASSIFY_VIDEO)
    
    alt In-Memory Worker Cache Hit
        BG-->>CS: Return cached category & confidence
    else In-Flight Request Exists
        BG->>BG: Attach to existing Promise (Deduplication)
        BG-->>CS: Return resolved result
    else Cache Miss
        BG->>API: HTTP POST /api/v1/classify
        API->>DB: Check SQLite Cache (canonical URL / video_id)
        
        alt SQLite Cache Hit
            DB-->>API: Return cached classification
            API->>DB: Increment view count & last_accessed_at
            API-->>BG: Return 200 OK (Cache Hit)
        else SQLite Cache Miss
            API->>LLM: Isolated Title Prompt Inference
            LLM-->>API: Return Category Slug (e.g. "programming_technology")
            API->>DB: Persist new entry in SQLite Cache (Check 1GB limit)
            API-->>BG: Return 200 OK (Fresh Inference)
        end
        
        BG->>BG: Store in Worker Memory Cache
        BG-->>CS: Return Classification Result
    end

    alt Category is Whitelisted
        CS->>YT: Remove pending overlay, inject Category Pill Badge
    else Category is Non-Whitelisted
        CS->>YT: Apply Distraction Blackout Cover with "View Anyway"
    end
```

---

### 4.2 Timestamped Video Notes Taking & Metadata Resolution

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant Player as YouTube HTML5 Player
    participant Drawer as In-Page Notes Drawer (content.js)
    participant API as FastAPI Backend (/notes)
    participant OEMBED as YouTube oEmbed API
    participant DB as SQLite Notes DB

    User->>Drawer: Types note at current video playback position
    Drawer->>Player: Read player.currentTime (e.g. 135s -> "02:15")
    Drawer->>API: POST /api/v1/notes (video_id, timestamp, note_text)
    
    API->>OEMBED: GET https://www.youtube.com/oembed?url=...
    OEMBED-->>API: Return video title & thumbnail URL
    API->>DB: INSERT into notes table
    DB-->>API: Return saved Note record with ID
    API-->>Drawer: 201 Created (NoteResponse)
    Drawer->>Drawer: Render note pill with clickable [02:15] timestamp badge

    User->>Drawer: Clicks [02:15] timestamp badge
    Drawer->>Player: Set player.currentTime = 135
    Player->>Player: Video seeks immediately to 02:15
```

---

### 4.3 YouTube Shorts Distraction Shielding & Wiz Injection

```mermaid
sequenceDiagram
    autonumber
    participant Page as Shorts Page (/shorts/...)
    participant Shield as content.js (Shorts Shield)
    participant Audio as Video Player Element

    Page->>Shield: Navigation to /shorts/ detected
    Shield->>Shield: Lock event listeners on window (wheel, keydown, touchmove)
    Shield->>Page: Remove #navigation-button-up & #navigation-button-down
    
    alt Block Shorts Playback is ON
        Shield->>Audio: pause() and mute() video stream
        Shield->>Page: Inject Distraction Shield Overlay ("Shorts Blocked")
    end

    alt Comments Shield is ON
        Shield->>Page: Hide reel comment button & orphan counters
    end

    Shield->>Page: Inject circular Color Toggle above Like button
    Shield->>Page: Force overflow: visible on 4 parent overlay containers
```

---

### 4.4 Cross-Context Settings Synchronization

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant Dash as Web Dashboard (app.js)
    participant Bridge as bridge.js
    participant Storage as chrome.storage.local
    participant Ext as Extension Popup / Content
    participant API as FastAPI Backend (/settings)

    User->>Dash: Toggles Preset (e.g. "Strict Tech")
    Dash->>Dash: Update local DOM state
    Dash->>Bridge: window.postMessage(STUDYTUBE_SET_SETTINGS)
    Bridge->>Storage: chrome.storage.local.set(newSettings)
    Storage-->>Ext: chrome.storage.onChanged event fires
    Ext->>Ext: Instantly re-evaluates active YouTube tab DOM

    Dash->>API: POST /api/v1/settings (persists to settings.json)
    API-->>Dash: 200 OK Saved
```

---

## 5. Cache Architecture & LFU Eviction Mechanics

The SQLite classification cache (`backend/app/services/cache.py`) is engineered to support millions of video entries while strictly honoring the **1GB storage boundary**:

```
┌────────────────────────────────────────────────────────┐
│             SQLite Video Classification Cache          │
│                                                        │
│  PRAGMA journal_mode = WAL;                            │
│  PRAGMA synchronous = NORMAL;                          │
│  PRAGMA auto_vacuum = FULL;                            │
└──────────────────────────┬─────────────────────────────┘
                           │
             On Every Classification Save
                           │
                           ▼
          Is Database Size >= SQLITE_CACHE_MAX_BYTES (1GB)?
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
           YES                           NO
            │                             │
    SELECT video_id FROM videos           Persist new record
    ORDER BY views ASC,                   Commit transaction
             last_accessed_at ASC         
    LIMIT N (Batched eviction)
            │
    DELETE FROM videos WHERE id IN (...)
            │
    PRAGMA incremental_vacuum
            │
            ▼
    Persist new record
```

### Eviction Rule Rationale:
- **View-Weighted LFU**: Videos with tens of millions of views (viral/popular educational videos) are far more likely to appear repeatedly in recommendations than obscure videos with 10 views. Evicting lowest-view videos first maximizes the global cache hit ratio.
- **Auto-Vacuum Full**: Ensures SQLite frees allocated disk blocks back to the operating system after deletes.

---

## 6. Security & Privacy Model

| Threat Vector | Mitigation Strategy |
| :--- | :--- |
| **API Keys & Credentials Security** | **Zero Client Secrets**: All credentials and backend settings reside exclusively in server `.env` files. Extension and Dashboard client code contain zero credentials. |
| **Browsing History Leaks** | **Prompt Sanitization**: Only the video title and category enum are transmitted to the LLM. User cookies, session tokens, channel handles, and watch histories are never sent. |
| **CORS Exploitation** | **Scoped Regex Matching**: The FastAPI server allows requests originating from `chrome-extension://*` and specified local origins (`localhost:3000`, `127.0.0.1:8000`), blocking arbitrary third-party websites. |
| **DDoS on Local LLM** | **FIFO Request Queue**: The client-side queue throttles requests to one concurrent LLM call, shielding the local Ollama instance from crash-inducing request surges during rapid scrolling. |
| **External Service Dependency** | **100% Offline Capability**: StudyTube functions completely offline using local Ollama (`llama3.2:3b`) with zero cloud data transmission. |

---

## 7. Implemented Technology Stack

- **Browser Extension**: Manifest V3, Vanilla JavaScript, CSS3, Chrome Storage & Message Passing APIs.
- **Backend Microservice**: Python 3.10+, FastAPI, Uvicorn (ASGI), Pydantic v2.
- **Persistent Storage**: SQLite 3 with Write-Ahead Logging (WAL) and Full Auto-Vacuum (`classification_cache.db`, `notes.db`).
- **Active LLM Engine**: Local Ollama (`llama3.2:3b`) via local OpenAI-compatible REST endpoint at `http://localhost:11434/v1` with automated fallback handler.
- **Frontend Dashboard**: Glassmorphism CSS design system, Inter & Outfit typography, PostMessage bi-directional synchronization.
- **Testing**: Pytest with Mock, Starlette TestClient, and custom fixtures (46 automated tests).
