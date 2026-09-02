"""
GET /api/cart-layer/{layer_id}
──────────────────────────────
Full GeoJSON for one thematic overlay.

Some overlays (water bodies, roads) are hundreds of megabytes — far past what a
Lambda should parse or API Gateway can return. Those are answered with a
pre-signed URL to the source object plus a pointer at the tile endpoint, so the
client can stream it directly instead of the function buffering it.
"""

import os
from typing import Any, Dict

from core import config, gisfs
from core.http import Request, json_response, cache_headers
from services.cart_layer_service import cart_layer_cache, find_cart_layer_file
from services.geometry_service import compute_geojson_bounds_and_features, load_geojson_file

#: Above this source size the layer is handed over by URL rather than parsed.
INLINE_LIMIT_BYTES = int(os.environ.get("CART_LAYER_INLINE_LIMIT_MB") or 24) * 1024 * 1024

_EMPTY = {"type": "FeatureCollection", "features": []}


def handle(request: Request) -> Dict[str, Any]:
    layer_id = request.p("layer_id")
    if not layer_id:
        return json_response(
            {"success": False, "error": "Missing layer id.", "geojson": _EMPTY}, status=400,
        )

    if layer_id in cart_layer_cache:
        return json_response({"success": True, "layer_id": layer_id, **cart_layer_cache[layer_id]})

    uri = find_cart_layer_file(layer_id)
    if not uri or not gisfs.exists(uri):
        return json_response({
            "success": False,
            "error": (
                "Layer file for '%s' not found. Upload '%s.geojson' under %s or map it "
                "in cart_layers_config.json." % (layer_id, layer_id, config.CART_LAYERS_URI)
            ),
            "layer_id": layer_id,
            "geojson": _EMPTY,
        }, status=404)

    size = gisfs.getsize(uri)
    if size > INLINE_LIMIT_BYTES and config.is_s3(uri):
        return json_response({
            "success": True,
            "layer_id": layer_id,
            "oversized": True,
            "size_bytes": size,
            "geojson": _EMPTY,
            "geojson_url": gisfs.presign(uri),
            "tiles": ["/api/tiles/%s/{z}/{x}/{y}.pbf" % layer_id],
            "note": (
                "Layer is %.0f MB; fetch geojson_url directly or render from the "
                "vector tile endpoint." % (size / 1048576.0)
            ),
            "file_path": uri,
        }, headers=cache_headers(300))

    try:
        raw = load_geojson_file(uri)
        if not raw:
            return json_response({
                "success": False,
                "error": "Failed to load GeoJSON from %s" % uri,
                "layer_id": layer_id,
                "geojson": _EMPTY,
            }, status=502)

        feats = raw.get("features", []) if raw.get("type") == "FeatureCollection" else [raw]
        bbox, _ = compute_geojson_bounds_and_features(feats)

        data = {
            "geojson": {"type": "FeatureCollection", "features": feats},
            "bbox": bbox,
            "feature_count": len(feats),
            "file_path": uri,
        }
        cart_layer_cache[layer_id] = data
        return json_response({"success": True, "layer_id": layer_id, **data})
    except Exception as e:
        print("[cart/get_layer] Error loading %s: %s" % (layer_id, e))
        return json_response(
            {"success": False, "error": str(e), "layer_id": layer_id, "geojson": _EMPTY},
            status=500,
        )
