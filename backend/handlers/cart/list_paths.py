"""
GET /api/cart-layers/list
─────────────────────────
Layer ids with their configured storage path and availability. Diagnostic
counterpart to /api/cart-layers.
"""

from typing import Any, Dict

from core import gisfs
from core.http import Request, json_response, cache_headers
from services.cart_layer_service import CART_LAYER_PATHS, cart_layer_uri


def handle(request: Request) -> Dict[str, Any]:
    result = []
    for layer_id, rel_path in CART_LAYER_PATHS.items():
        uri = cart_layer_uri(layer_id)
        result.append({
            "id": layer_id,
            "path": rel_path,
            "uri": uri,
            "available": gisfs.exists(uri),
        })
    return json_response({"layers": result}, headers=cache_headers(900))
