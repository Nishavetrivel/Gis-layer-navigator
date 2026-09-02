"""
GET /api/download-zip
─────────────────────
Native on-disk Shapefile bundle (.shp plus sidecars) for a boundary scope.
"""

from typing import Any, Dict

from core.http import Request, HttpError, binary_response
from zip_bundler import generate_shapefile_zip_bytes


def handle(request: Request) -> Dict[str, Any]:
    zip_bytes, zip_filename, files_count = generate_shapefile_zip_bytes(
        level=request.q("level", default="village") or "village",
        code=request.q("code", default="") or "",
        file_type=request.q("file_type", default="vector") or "vector",
        q_dist=request.q("district_code"),
        q_tal=request.q("taluk_code"),
        q_vil=request.q("village_code"),
    )
    if files_count == 0:
        raise HttpError(404, "No GIS files found for download.")

    return binary_response(zip_bytes, "application/zip", zip_filename)
