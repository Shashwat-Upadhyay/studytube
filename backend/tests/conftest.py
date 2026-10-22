"""Pytest configuration and test client compatibility fixtures."""

import asyncio
import httpx
import pytest
import starlette.testclient
import fastapi.testclient

from app.main import app
from app.services.classifier import set_classifier, PlaceholderClassifier


class CustomTestClient:
    """Synchronous test client compatible across Starlette and HTTPX 0.28+ versions."""

    __test__ = False

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

    def get(self, url: str, **kwargs):
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs):
        return self.request("POST", url, **kwargs)

    def options(self, url: str, **kwargs):
        return self.request("OPTIONS", url, **kwargs)


# Apply compatibility patch
starlette.testclient.TestClient = CustomTestClient
fastapi.testclient.TestClient = CustomTestClient


@pytest.fixture(autouse=True)
def reset_classifier_state():
    """Reset the classifier singleton state before each test to guarantee test isolation."""
    set_classifier(PlaceholderClassifier())
    yield
    set_classifier(None)
