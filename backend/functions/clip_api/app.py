"""
backend/functions/clip_api/app.py
─────────────────────────────────
Spatial clipping API.

Polygon clipping preview and multi-layer export. Memory- and time-hungry, so
it is provisioned separately from the light read endpoints.
"""

from core.router import Router
from handlers.spatial import clip_download
from handlers.spatial import clip_preview

router = Router("clip_api")
(
    router
    .post("/api/spatial/clip/preview", clip_preview.handle)
    .post("/api/spatial/clip/download", clip_download.handle)
)

lambda_handler = router.as_lambda_handler()
