"""StudyTube FastAPI application entrypoint."""

import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.config import settings
from app.schemas.health import HealthResponse

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("studytube-backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager for startup and shutdown."""
    logger.info("Starting %s v%s in %s mode", settings.PROJECT_NAME, settings.VERSION, settings.ENVIRONMENT)
    logger.info("CORS allowed origins: %s", settings.CORS_ORIGINS)
    if settings.CORS_ALLOW_EXTENSION_REGEX:
        logger.info("CORS extension regex enabled for chrome-extension://[id]")
    yield
    logger.info("Shutting down %s", settings.PROJECT_NAME)


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=(
        "Backend API for StudyTube Chrome extension. "
        "Provides video classification and focus mode recommendation services."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# CORS setup
# 1. Configured origins from settings (e.g. localhost, specific chrome-extension IDs)
cors_kwargs = {
    "allow_origins": settings.CORS_ORIGINS,
    "allow_credentials": True,
    "allow_methods": ["GET", "POST", "OPTIONS"],
    "allow_headers": ["*"],
}

# 2. Allow unpacked chrome-extension:// origins during development via regex
if settings.CORS_ALLOW_EXTENSION_REGEX:
    cors_kwargs["allow_origin_regex"] = r"^chrome-extension://[a-z0-9]+$"

app.add_middleware(CORSMiddleware, **cors_kwargs)


# Custom validation error handler for friendly, structured responses
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return clean error details when request validation fails."""
    errors = []
    for err in exc.errors():
        field = ".".join(str(loc) for loc in err.get("loc", []) if loc != "body")
        errors.append({
            "field": field or "body",
            "message": err.get("msg", "Invalid value"),
            "type": err.get("type", "validation_error"),
        })

    logger.warning("Validation failed for %s: %s", request.url.path, errors)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT if hasattr(status, "HTTP_422_UNPROCESSABLE_CONTENT") else 422,
        content={
            "detail": "Request validation failed",
            "errors": errors,
        },
    )


# Root level index route
@app.get(
    "/",
    tags=["system"],
    summary="Root API Index",
    description="Welcome route directing users to documentation and health check.",
)
async def root_index():
    """Return API metadata and documentation links."""
    return {
        "message": f"Welcome to {settings.PROJECT_NAME}",
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "dashboard_url": "/dashboard",
        "docs_url": "/docs",
        "health_url": "/health",
        "classify_url": f"{settings.API_V1_PREFIX}/classify",
        "settings_url": f"{settings.API_V1_PREFIX}/settings",
    }


# Root level /health endpoint as required by specifications
@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["system"],
    summary="Root Health Check",
    description="Verify the API is running and operational.",
)
async def root_health_check() -> HealthResponse:
    """Return application operational status."""
    return HealthResponse(
        status="healthy",
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        llm_provider=settings.LLM_PROVIDER,
        llm_model=settings.LLM_MODEL,
    )


# Mount versioned API routes
app.include_router(api_router, prefix=settings.API_V1_PREFIX)

# Mount frontend web dashboard if frontend folder exists
FRONTEND_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend"
)
if os.path.isdir(FRONTEND_DIR):
    app.mount("/dashboard", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

