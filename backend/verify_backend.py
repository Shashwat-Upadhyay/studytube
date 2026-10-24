"""Quick verification script for StudyTube backend."""

import sys
import asyncio
import httpx
from app.main import app

class TestClient:
    """Synchronous test client compatible across Starlette and HTTPX 0.28+."""
    def __init__(self, app, base_url="http://testserver", raise_server_exceptions=True):
        self.app = app
        self.base_url = base_url
        self.raise_server_exceptions = raise_server_exceptions

    def request(self, method: str, url: str, **kwargs):
        async def _call():
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(
                    app=self.app,
                    raise_app_exceptions=self.raise_server_exceptions,
                ),
                base_url=self.base_url,
            ) as client:
                return await client.request(method, url, **kwargs)
        return asyncio.run(_call())

    def get(self, url: str, **kwargs): return self.request("GET", url, **kwargs)
    def post(self, url: str, **kwargs): return self.request("POST", url, **kwargs)
    def options(self, url: str, **kwargs): return self.request("OPTIONS", url, **kwargs)

def verify():
    print("Initializing TestClient...")
    client = TestClient(app)

    # 1. Test /health
    print("\n1. Testing GET /health...")
    resp = client.get("/health")
    assert resp.status_code == 200, f"Health check failed: {resp.status_code}"
    print("   Response:", resp.json())

    # 2. Test /docs
    print("\n2. Testing GET /docs...")
    resp = client.get("/docs")
    assert resp.status_code == 200, f"Docs check failed: {resp.status_code}"
    print("   OpenAPI Docs loaded successfully (HTTP 200).")

    # 3. Test POST /api/v1/classify valid
    print("\n3. Testing POST /api/v1/classify (valid)...")
    payload = {
        "video_id": "dQw4w9WgXcQ",
        "title": "Never Gonna Give You Up",
        "channel_name": "Rick Astley",
        "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "views": 1400000000,
    }
    resp = client.post("/api/v1/classify", json=payload)
    assert resp.status_code == 200, f"Classify failed: {resp.status_code}"
    print("   Response:", resp.json())

    # 4. Test POST /api/v1/classify with blank title (should fail with 422)
    print("\n4. Testing POST /api/v1/classify with blank title (validation failure)...")
    bad_payload = {
        "video_id": "test1234",
        "title": "   "
    }
    resp = client.post("/api/v1/classify", json=bad_payload)
    assert resp.status_code == 422, f"Expected 422, got: {resp.status_code}"
    print("   Handled gracefully with 422:", resp.json())

    # 5. Test CORS preflight for Chrome extension
    print("\n5. Testing CORS preflight for chrome-extension origin...")
    resp = client.options(
        "/api/v1/classify",
        headers={
            "Origin": "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        }
    )
    assert resp.status_code == 200, f"CORS preflight failed: {resp.status_code}"
    print("   CORS preflight allowed origin:", resp.headers.get("access-control-allow-origin"))

    print("\n[SUCCESS] ALL VERIFICATION CHECKS PASSED!")

if __name__ == "__main__":
    verify()
