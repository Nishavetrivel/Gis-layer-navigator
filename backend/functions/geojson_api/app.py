"""
backend/functions/geojson_api/app.py
────────────────────────────────────
GeoJSON delivery API.

Merged boundary GeoJSON and the zoom-driven background layer.
"""

from core.router import Router
from handlers.geo import auto_zoom_layer
from handlers.geo import geojson

router = Router("geojson_api")
(
    router
    .get("/api/geojson", geojson.handle)
    .get("/api/auto-zoom-layer", auto_zoom_layer.handle)
)

lambda_handler = router.as_lambda_handler()
