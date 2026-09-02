"""
backend/functions/export_api/app.py
───────────────────────────────────
Export & download API.

Format conversion and bundle downloads (shp, geojson, kml, kmz, dxf).
"""

from core.router import Router
from handlers.export import download_direct
from handlers.export import download_zip
from handlers.export import export
from handlers.export import export_polygon

router = Router("export_api")
(
    router
    .get("/api/export", export.handle)
    .get("/api/download-zip", download_zip.handle)
    .get("/api/download/{proxy+}", download_direct.handle)
    .post("/api/export-polygon", export_polygon.handle)
)

lambda_handler = router.as_lambda_handler()
