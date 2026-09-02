"""
GET /api/cart-layers
────────────────────
The thematic overlay registry, annotated with whether each layer's data is
actually present in storage.
"""

from typing import Any, Dict

from core import gisfs
from core.http import Request, json_response, cache_headers
from services.cart_layer_service import CART_LAYER_DEFINITIONS, find_cart_layer_file


def handle(request: Request) -> Dict[str, Any]:
    layers = []
    for defn in CART_LAYER_DEFINITIONS:
        uri = find_cart_layer_file(defn["id"])
        available = bool(uri and gisfs.exists(uri))
        layers.append({
            **defn,
            "available": available,
            "file_path": uri if available else None,
        })
    return json_response({"success": True, "layers": layers}, headers=cache_headers(900))
