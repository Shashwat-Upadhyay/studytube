# 🛠️ StudyTube Setup & Installation Guide

A comprehensive, step-by-step installation and configuration guide for **StudyTube** — designed for hackathon judges, developers, and power users.

---

## ⚡ 5-Minute Hackathon Quickstart (Zero-Setup Mode)

If you are a hackathon judge or evaluator and want to see StudyTube running immediately **without downloading local AI models or entering API keys**, follow this 3-step quickstart:

### Step 1: Start Backend (Offline Rule-Based Classifier)
```powershell
# Open terminal in backend/
cd d:\Projects\studytube\backend

# Install dependencies (or activate existing virtualenv)
pip install -r requirements.txt

# Copy example environment configuration
Copy-Item .env.example .env

# Run FastAPI backend with live reload
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
> The backend defaults to `LLM_PROVIDER="placeholder"`, providing instant rule-based classification out of the box with zero external dependencies or API keys!

### Step 2: Load Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle **Developer mode** (switch in the top-right corner).
3. Click **Load unpacked** (top-left button).
4. Select the `extension/` directory from this repository (`d:\Projects\studytube\extension`).
5. Pin **StudyTube** to your browser toolbar.

### Step 3: Open YouTube & Dashboard
1. Open [https://www.youtube.com](https://www.youtube.com) in Chrome.
2. Watch videos render in focus **grayscale**, distractions shielded, and recommendation badges tagged!
3. Open the **Web Dashboard** at `http://127.0.0.1:8000/dashboard` or by opening `frontend/index.html` in your browser.

---

## 📋 System Requirements & Prerequisites

| Requirement | Minimum Version | Notes |
| :--- | :--- | :--- |
| **Operating System** | Windows 10/11, macOS 12+, or Ubuntu 20.04+ | Cross-platform compatibility |
| **Python** | 3.10 or higher | Required for FastAPI backend & SQLite support |
| **Browser** | Google Chrome 109+ | Chromium browsers (Brave, Edge, Opera) supported |
| **Node.js** | 16+ *(Optional)* | Only needed if running static servers or syntax checks |
| **Ollama** | 0.3.0+ *(Optional)* | Required only if running local offline LLMs |

---

## 🔧 Detailed Step-by-Step Backend Setup

### 1. Virtual Environment Setup

It is strongly recommended to install Python dependencies inside an isolated virtual environment.

#### Windows (PowerShell):
```powershell
# Navigate to repository root
cd d:\Projects\studytube

# Create virtual environment
python -m venv backend\.venv

# Activate virtual environment
.\backend\.venv\Scripts\Activate.ps1
```

*Note:* If PowerShell displays a script execution policy error, run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### macOS / Linux (Bash/Zsh):
```bash
# Create virtual environment
python3 -m venv backend/.venv

# Activate virtual environment
source backend/.venv/bin/activate
```

---

### 2. Install Python Dependencies

With your virtual environment activated:

```powershell
pip install --upgrade pip
pip install -r backend/requirements.txt
```

#### Core Dependencies Installed:
- **FastAPI** (`>=0.110.0`): Asynchronous, high-performance web framework.
- **Uvicorn** (`>=0.28.0`): Lightning-fast ASGI web server.
- **Pydantic & Pydantic-Settings** (`>=2.0`): Data validation and environment variable parsing.
- **HTTPX** (`>=0.27.0`): Asynchronous HTTP client for LLM and oEmbed requests.
- **Pytest** (`>=8.0.0`): Automated unit and integration testing suite.

---

### 3. Environment Configuration (`backend/.env`)

Initialize your local environment file:

```powershell
# Windows PowerShell
Copy-Item backend\.env.example backend\.env

# macOS / Linux
cp backend/.env.example backend/.env
```

Open `backend/.env` in any code editor. By default, it looks like:

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

# LLM Configuration (See options below)
LLM_PROVIDER="placeholder"
LLM_TIMEOUT_SECONDS=15.0
CACHE_SIZE=1000

# SQLite Persistent Cache & Notes Databases
SQLITE_CACHE_DB_PATH="data/classification_cache.db"
SQLITE_CACHE_MAX_BYTES=1073741824
SQLITE_NOTES_DB_PATH="data/notes.db"
```

---

## 🤖 Configuring LLM Providers

StudyTube supports four modular LLM classification backends. Select the one that fits your setup:

### Option A: Local Ollama (Recommended — 100% Free & Private)
Run local open-weights LLMs directly on your GPU or CPU without third-party API keys or recurring costs.

1. Download and install [Ollama](https://ollama.com).
2. Open a terminal and pull your preferred model (e.g. Meta LLaMA 3.2 3B):
   ```bash
   ollama run llama3.2:3b
   ```
3. Test that Ollama is responding:
   ```bash
   curl http://localhost:11434/api/tags
   ```
4. Update `backend/.env`:
   ```env
   LLM_PROVIDER="ollama"
   LLM_MODEL="llama3.2:3b"
   LLM_BASE_URL="http://localhost:11434/v1"
   LLM_TIMEOUT_SECONDS=15.0
   ```

### Option B: Google Gemini (Cloud Inference)
Fast cloud classification using Google's Generative AI API.

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/).
2. Update `backend/.env`:
   ```env
   LLM_PROVIDER="gemini"
   LLM_API_KEY="AIzaSyYourGeminiApiKeyHere"
   LLM_MODEL="gemini-1.5-flash"
   ```

### Option C: OpenAI / OpenAI-Compatible (Groq, vLLM, OpenRouter)
1. Obtain an API key from OpenAI, Groq, or OpenRouter.
2. Update `backend/.env`:
   ```env
   LLM_PROVIDER="openai"
   LLM_API_KEY="sk-YourOpenAIApiKeyHere"
   LLM_MODEL="gpt-4o-mini"
   LLM_BASE_URL="https://api.openai.com/v1"
   ```
   *(For Groq, set `LLM_BASE_URL="https://api.groq.com/openai/v1"` and `LLM_MODEL="llama-3.1-8b-instant"`)*.

### Option D: Placeholder Mode (Zero Setup / Offline Evaluation)
1. Update `backend/.env`:
   ```env
   LLM_PROVIDER="placeholder"
   ```
   *No API keys, download, or internet connection required.*

---

### 4. Start the FastAPI Backend Server

Run the development server from the repository root:

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
*(Or specify the directory if running from `backend/`: `cd backend && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`)*

#### Verify API Health:
Open `http://127.0.0.1:8000/health` in your browser. You should receive:
```json
{
  "status": "healthy",
  "version": "0.2.0",
  "environment": "development",
  "llm_provider": "placeholder",
  "llm_model": "placeholder"
}
```

#### Interactive Swagger Documentation:
Explore and trigger all endpoints interactively at:
👉 **[http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)**

---

## 🧩 Chrome Extension Installation

The StudyTube extension is built as a modern **Chrome Manifest V3** extension.

### Step-by-Step Installation:
1. Open Google Chrome and enter `chrome://extensions/` in the URL bar.
2. In the top-right corner, switch the **Developer mode** toggle to **ON**.
3. In the top-left corner, click the **Load unpacked** button.
4. In the folder picker dialog, select the `extension/` directory inside this repository:
   ```
   d:\Projects\studytube\extension
   ```
5. You should now see the **StudyTube** card with version `0.2.0` active.
6. Click the Extensions puzzle piece icon in Chrome's top toolbar, find **StudyTube**, and click the **Pin** icon.

### Extension Permissions Explained:
- `storage`: Preserves whitelist presets, shield toggles, and offline caches locally.
- `declarativeNetRequest`: Handles clean, flash-free resource suppression.
- `host_permissions: ["*://*.youtube.com/*", "http://127.0.0.1:8000/*", "http://localhost:8000/*"]`: Permits DOM modification on YouTube tabs and local backend communication.

---

## 🖥️ Web Dashboard Access & Usage

The StudyTube Web Dashboard is a glassmorphism control center and notebook.

### Launch Methods:

#### Method 1: Via FastAPI Server (Recommended)
When the backend is running, open:
👉 **[http://127.0.0.1:8000/dashboard](http://127.0.0.1:8000/dashboard)**

#### Method 2: Direct Local File
Double-click `frontend/index.html` or drag it into Google Chrome. The extension's `bridge.js` automatically hooks into local file URLs to provide full bi-directional synchronization with your extension settings!

#### Method 3: Local Node or Python HTTP Server
```bash
# Python
python -m http.server 3000 --directory frontend

# Node npx
npx serve frontend -p 3000
```
Open `http://localhost:3000`.

---

## 🧪 Automated Testing & Code Verification

StudyTube contains **46 automated unit and integration tests** validating classifier fallback behavior, SQLite caching, video timestamp parsing, CORS headers, and settings synchronization.

### 1. Run Complete Pytest Suite
From the repository root:
```powershell
pytest backend/tests -v
```

Expected output:
```text
============================= 46 passed in 18.97s =============================
```

### 2. Run Backend End-to-End Verification Script
Run the automated API verification script:
```powershell
python backend/verify_backend.py
```

Expected output:
```text
[SUCCESS] ALL VERIFICATION CHECKS PASSED!
```

### 3. Syntax Verification for Extension & Frontend Scripts
Validate JavaScript files with Node:
```powershell
node -c extension/content.js extension/popup.js extension/background.js extension/bridge.js frontend/app.js
```

---

## 🎯 End-to-End Testing Walkthrough (What to Try on YouTube)

1. **Watch a Standard Video**:
   - Go to any YouTube video (e.g. a Python tutorial).
   - Notice the video plays in clean **grayscale**, while scrub bars, captions, and UI buttons remain in crisp color.
   - Look next to the native **Share** button: notice the **"View in Color"** pill button. Click it to toggle full color.

2. **Test Video Notes Drawer**:
   - On the Watch page, notice the **Study Notes** drawer on the right sidebar.
   - Type a note (e.g., *"Core concept explained here"*) and click **Save Note**.
   - The note is saved with the current timestamp. Click the timestamp badge (e.g. `02:15`) to jump the video directly to that time!
   - Open the **Web Dashboard** (`http://127.0.0.1:8000/dashboard`), switch to the **Video Notes Notebook** tab, and view your notes organized by video with YouTube thumbnail and Markdown export.

3. **Check Recommendation Filtering**:
   - Browse the YouTube home or search feed.
   - Non-whitelisted videos (e.g., gaming, clickbait) are overlaid with a clean blackout shield.
   - Whitelisted educational videos display category badges (e.g. `💻 Programming & Tech`).

4. **Test YouTube Shorts Distraction Shield**:
   - Click into any YouTube Shorts feed (`https://youtube.com/shorts/...`).
   - Notice vertical wheel/arrow scrolling is locked to stop continuous scrolling addiction.
   - Notice the circular **Color** toggle button injected directly above the Like button.
   - Notice comments are shielded.

---

## ❓ Troubleshooting & FAQs

### Q1: The Chrome extension says "Backend Offline" or doesn't classify videos.
- **Check Backend Host**: Confirm FastAPI is running at `http://127.0.0.1:8000`. Test `http://127.0.0.1:8000/health` in your browser.
- **Check Dual-Host Setting**: The extension automatically attempts both `http://127.0.0.1:8000` and `http://localhost:8000`. You can configure the Backend URL in the extension popup or Web Dashboard.
- **Check CORS**: `CORS_ALLOW_EXTENSION_REGEX=true` is enabled by default in `backend/.env`.

### Q2: Ollama classification returns errors or timeouts.
- **Ensure Ollama is Running**: Run `ollama list` in your terminal to verify the service is active and the model (`llama3.2:3b`) is downloaded.
- **Increase Timeout**: In `backend/.env`, set `LLM_TIMEOUT_SECONDS=25.0` if running on CPU without dedicated GPU acceleration.

### Q3: Port 8000 is already in use by another program.
- Start Uvicorn on another port:
  ```powershell
  uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
  ```
- In the extension popup or dashboard, change Backend URL to `http://127.0.0.1:8001`.

### Q4: Are any real API keys exposed in this repository?
- **No.** The repository uses `.env` (strictly ignored by `.gitignore`) for local credentials. All test files use mock clients and dummy strings (`"test-api-key"`, `"sk-test"`). No sensitive keys are committed or exposed.
