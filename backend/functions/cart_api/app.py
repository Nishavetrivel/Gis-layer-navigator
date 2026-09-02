"""
backend/functions/cart_api/app.py
─────────────────────────────────
Cart overlay layers API.

Thematic overlay registry and layer payloads.
"""

from core.router import Router
from handlers.cart import get_layer
from handlers.cart import list_definitions
from handlers.cart import list_paths

router = Router("cart_api")
(
    router
    .get("/api/cart-layers", list_definitions.handle)
    .get("/api/cart-layers/list", list_paths.handle)
    .get("/api/cart-layer/{layer_id}", get_layer.handle)
)

lambda_handler = router.as_lambda_handler()
