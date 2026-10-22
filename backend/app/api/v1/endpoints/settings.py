"""StudyTube Configuration and Settings Endpoints."""

from datetime import datetime, timezone
import json
import logging
import os
from typing import Optional
from fastapi import APIRouter, status
from app.schemas.settings import SettingsPayload

logger = logging.getLogger("studytube-settings")

router = APIRouter()

# Persist settings in a local JSON file in backend root
SETTINGS_FILE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    "settings.json",
)

_cached_settings: Optional[SettingsPayload] = None


def _load_settings_from_disk() -> SettingsPayload:
    """Load settings from JSON file or return defaults."""
    global _cached_settings
    if _cached_settings is not None:
        return _cached_settings

    if os.path.isfile(SETTINGS_FILE_PATH):
        try:
            with open(SETTINGS_FILE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                _cached_settings = SettingsPayload(**data)
                return _cached_settings
        except Exception as exc:
            logger.warning("Could not read settings from disk: %s", exc)

    _cached_settings = SettingsPayload(updated_at=datetime.now(timezone.utc).isoformat())
    return _cached_settings


def _save_settings_to_disk(settings: SettingsPayload) -> None:
    """Save settings payload to disk."""
    global _cached_settings
    _cached_settings = settings
    try:
        with open(SETTINGS_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(settings.model_dump(), f, indent=2)
    except Exception as exc:
        logger.error("Failed to save settings to disk: %s", exc)


@router.get(
    "/settings",
    response_model=SettingsPayload,
    status_code=status.HTTP_200_OK,
    summary="Get StudyTube Settings",
    description="Retrieve current configuration settings shared by extension and frontend dashboard.",
)
async def get_settings() -> SettingsPayload:
    """Return active StudyTube configuration settings."""
    return _load_settings_from_disk()


@router.post(
    "/settings",
    response_model=SettingsPayload,
    status_code=status.HTTP_200_OK,
    summary="Update StudyTube Settings",
    description="Update and persist configuration settings from frontend dashboard or extension.",
)
async def update_settings(payload: SettingsPayload) -> SettingsPayload:
    """Update settings and persist to disk."""
    payload.updated_at = datetime.now(timezone.utc).isoformat()
    _save_settings_to_disk(payload)
    logger.info("Settings updated via API: studytube_enabled=%s, whitelist=%s", payload.studytube_enabled, len(payload.whitelisted_categories))
    return payload


@router.put(
    "/settings",
    response_model=SettingsPayload,
    status_code=status.HTTP_200_OK,
    summary="Update StudyTube Settings (PUT)",
    description="Update and persist configuration settings via PUT.",
)
async def put_settings(payload: SettingsPayload) -> SettingsPayload:
    """Update settings via PUT."""
    return await update_settings(payload)
