"""
GET /api/export
───────────────
Export a boundary scope in any supported format (shp, geojson, kml, kmz, dxf).
"""

from typing import Any, Dict

from core.http import Request, binary_response
from handlers.export._export_core import build_export


def handle(request: Request) -> Dict[str, Any]:
    payload, content_type, filename = build_export(
        level=request.q("level", default="village") or "village",
        code=request.q("code", default="") or "",
        district_code=request.q("district_code"),
        taluk_code=request.q("taluk_code"),
        village_code=request.q("village_code"),
        file_type=request.q("file_type", default="vector") or "vector",
        export_format=request.q("format", default="shp") or "shp",
        base_survey=request.q("base_survey"),
    )
    return binary_response(payload, content_type, filename)
