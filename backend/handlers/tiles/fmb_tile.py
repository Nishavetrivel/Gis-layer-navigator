"""
GET /api/fmb-tiles/{z}/{x}/{y}.pbf
──────────────────────────────────
Vector tiles for the merged Field Measurement Book district-01 boundaries.
"""

from typing import Any, Dict

from core import config, gisfs
from core.http import Request, HttpError, binary_response, cache_headers, empty_binary
from mvt_service import vector_tile_manager

PBF_TYPE = "application/x-protobuf"


def handle(request: Request) -> Dict[str, Any]:
    segments = request.proxy_segments()
    if len(segments) < 3:
        raise HttpError(400, "Expected /api/fmb-tiles/{z}/{x}/{y}.pbf")
    try:
        z = int(segments[-3])
        x = int(segments[-2])
        y = int(segments[-1].split(".")[0])
    except (TypeError, ValueError):
        raise HttpError(400, "Tile coordinates must be integers.")

    if not gisfs.exists(config.FMB_MERGED_URI):
        return empty_binary(PBF_TYPE, status=404)

    tile_bytes = vector_tile_manager.get_tile(
        config.FMB_LAYER_ID, z, x, y, config.FMB_MERGED_URI,
    )
    if not tile_bytes:
        return empty_binary(PBF_TYPE, status=204)

    return binary_response(
        tile_bytes,
        PBF_TYPE,
        headers=cache_headers(config.TILE_MAX_AGE_SECONDS),
        inline=True,
    )
