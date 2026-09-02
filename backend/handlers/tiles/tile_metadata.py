"""
GET /api/tiles/{layer_id}/metadata
──────────────────────────────────
TileJSON-shaped metadata (bounds, feature count) for a cart layer.
"""

from typing import Any, Dict

from core.http import Request, HttpError, json_response, cache_headers
from mvt_service import vector_tile_manager
from services.cart_layer_service import find_cart_layer_file


def handle(request: Request) -> Dict[str, Any]:
    segments = request.proxy_segments()
    # Everything before the trailing "metadata" segment is the layer id.
    layer_id = "/".join(segments[:-1]) if segments else ""
    if not layer_id:
        raise HttpError(400, "Expected /api/tiles/{layer_id}/metadata")

    source_uri = find_cart_layer_file(layer_id)
    vector_tile_manager.ensure_spatial_index(layer_id, source_uri)
    meta = vector_tile_manager.layer_metadata.get(layer_id, {})

    return json_response({
        "id": layer_id,
        "tilejson": "2.2.0",
        "tiles": ["/api/tiles/%s/{z}/{x}/{y}.pbf" % layer_id],
        "minzoom": 0,
        "maxzoom": 22,
        **meta,
    }, headers=cache_headers(3600))
