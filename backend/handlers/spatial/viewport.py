"""
GET /api/spatial/viewport
─────────────────────────
Zoom-staged resolution of a map viewport into the layer that should be drawn:
district, taluk, village boundary, or parcel detail.
"""

from typing import Any, Dict

from core.asyncutil import run_sync
from core.http import Request, json_response
from services.hierarchy_resolver import spatial_resolver


def handle(request: Request) -> Dict[str, Any]:
    result = run_sync(spatial_resolver.resolve_viewport(
        request.q_float("min_lng", required=True),
        request.q_float("min_lat", required=True),
        request.q_float("max_lng", required=True),
        request.q_float("max_lat", required=True),
        request.q_float("zoom", default=12.0),
        request.q("file_type", default="fmb") or "fmb",
    ))
    return json_response(result)
