"""
GET /api/tiles/{layer_id}/{z}/{x}/{y}.pbf
─────────────────────────────────────────
Mapbox Vector Tile for a thematic overlay.

Routed through the ``/api/tiles/{proxy+}`` resource: API Gateway path
parameters must occupy a whole segment, so ``{y}.pbf`` cannot be a template of
its own. The handler parses the trailing segments itself.
"""

from typing import Any, Dict, Optional, Tuple

from core import config
from core.http import Request, HttpError, binary_response, cache_headers, empty_binary
from mvt_service import vector_tile_manager
from services.cart_layer_service import find_cart_layer_file

PBF_TYPE = "application/x-protobuf"


def parse_tile_path(segments) -> Optional[Tuple[str, int, int, int]]:
    """``["schools", "12", "3021", "1489.pbf"]`` -> ``("schools", 12, 3021, 1489)``."""
    if len(segments) < 4:
        return None
    layer_id = "/".join(segments[:-3])
    try:
        z = int(segments[-3])
        x = int(segments[-2])
        y = int(segments[-1].split(".")[0])
    except (TypeError, ValueError):
        return None
    return layer_id, z, x, y


def handle(request: Request) -> Dict[str, Any]:
    parsed = parse_tile_path(request.proxy_segments())
    if not parsed:
        raise HttpError(400, "Expected /api/tiles/{layer_id}/{z}/{x}/{y}.pbf")

    layer_id, z, x, y = parsed
    if not (0 <= z <= 24):
        raise HttpError(400, "Zoom %d is out of range." % z)

    source_uri = find_cart_layer_file(layer_id)
    tile_bytes = vector_tile_manager.get_tile(layer_id, z, x, y, source_uri)
    if not tile_bytes:
        # An empty tile is a valid, cacheable answer — the area holds no features.
        return empty_binary(PBF_TYPE, status=204)

    return binary_response(
        tile_bytes,
        PBF_TYPE,
        headers=cache_headers(config.TILE_MAX_AGE_SECONDS),
        inline=True,
    )
