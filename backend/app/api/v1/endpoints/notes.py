"""API endpoints for managing timestamped notes in StudyTube."""

import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.notes import NoteCreate, NoteResponse, VideoGroupResponse
from app.services.notes_service import notes_service

logger = logging.getLogger("studytube-notes-endpoint")

router = APIRouter(prefix="/notes", tags=["notes"])


@router.post(
    "",
    response_model=NoteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Timestamped Note",
    description="Save a note at a video timestamp. Automatically resolves title and thumbnail.",
)
async def create_note(payload: NoteCreate) -> NoteResponse:
    """Create a new timestamped note."""
    try:
        note = notes_service.create_note(payload)
        logger.info("Created note %d for video %s at %s", note.id, note.video_id, note.timestamp_formatted)
        return note
    except Exception as exc:
        logger.exception("Failed to create note: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create note: {str(exc)}",
        )


@router.get(
    "",
    response_model=List[NoteResponse],
    summary="List Timestamped Notes",
    description="Get notes, optionally filtered by video_id.",
)
async def list_notes(
    video_id: Optional[str] = Query(default=None, description="Optional YouTube video ID or URL to filter by")
) -> List[NoteResponse]:
    """Retrieve list of notes."""
    try:
        return notes_service.get_notes(video_id=video_id)
    except Exception as exc:
        logger.exception("Failed to list notes: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch notes: {str(exc)}",
        )


@router.get(
    "/videos",
    response_model=List[VideoGroupResponse],
    summary="List Video-Grouped Notes",
    description="Retrieve all notes grouped by video (showing video title, thumbnail, note count, and notes).",
)
async def list_video_grouped_notes() -> List[VideoGroupResponse]:
    """Retrieve video-grouped notes for the frontend notebook window."""
    try:
        return notes_service.get_video_grouped_notes()
    except Exception as exc:
        logger.exception("Failed to group notes by video: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch video notes: {str(exc)}",
        )


@router.get(
    "/{note_id}",
    response_model=NoteResponse,
    summary="Get Single Note",
    description="Retrieve a single note by its database ID.",
)
async def get_note(note_id: int) -> NoteResponse:
    """Retrieve a single note."""
    note = notes_service.get_note_by_id(note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Note with ID {note_id} not found")
    return note


@router.delete(
    "/{note_id}",
    summary="Delete Single Note",
    description="Delete a note by its database ID.",
)
async def delete_note(note_id: int):
    """Delete a single note."""
    deleted = notes_service.delete_note(note_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Note with ID {note_id} not found")
    return {"success": True, "id": note_id, "message": "Note deleted successfully"}


@router.delete(
    "/video/{video_id}",
    summary="Delete All Notes for a Video",
    description="Delete all notes associated with a specific video ID.",
)
async def delete_video_notes(video_id: str):
    """Delete all notes for a video."""
    count = notes_service.delete_notes_for_video(video_id)
    return {"success": True, "video_id": video_id, "deleted_count": count}
