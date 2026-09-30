"""
backend/functions/spatial_api/app.py
────────────────────────────────────
Spatial resolver API.

Point and viewport resolution against the boundary hierarchy.
"""

from core.router import Router
from handlers.spatial import resolve
from handlers.spatial import viewport
from handlers.spatial import convert_gpkg

router = Router("spatial_api")
(
    router
    .get("/api/spatial/resolve", resolve.handle)
    .get("/api/spatial/viewport", viewport.handle)
    .post("/api/spatial/convert-gpkg", convert_gpkg.handle)
)

lambda_handler = router.as_lambda_handler()
