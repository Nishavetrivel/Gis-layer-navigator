"""
GET /api/metadata
─────────────────
Descriptive metadata (bbox, area, formats) for a district/taluk/village/parcel.
"""

from typing import Any, Dict

from core.asyncutil import run_sync
from core.http import Request, json_response
from services.geojson_builder import build_merged_geojson

#: Square metres to acres.
_SQM_TO_ACRES = 0.000247105


def handle(request: Request) -> Dict[str, Any]:
    level = request.q("level", default="village") or "village"
    code = request.q("code", default="") or ""

    res = run_sync(build_merged_geojson(
        level=level,
        code=code,
        q_dist=request.q("district_code"),
        q_tal=request.q("taluk_code"),
        q_vil=request.q("village_code"),
        file_type=request.q("type", default="vector") or "vector",
    )) or {}

    total_area = res.get("total_area") or 0
    metadata = {
        "code": code,
        "name": code,
        "level": level,
        "survey_no": code if level == "parcel" else "",
        "land_type": "Cadastral",
        "area_acres": round(total_area * _SQM_TO_ACRES, 2) if total_area else 0,
        "spatial_reference": "EPSG:4326 (WGS 84)",
        "datum": "WGS84",
        "bbox": res.get("bbox", [0, 0, 0, 0]),
        "file_formats": [
            "Shapefile (.shp)", "GeoJSON", "Google Earth (.kml)", "AutoCAD (.dxf)",
        ],
        "file_path": "",
        "geojson_path": "",
        "updated_at": "Active",
    }
    return json_response({"success": True, "metadata": metadata})
