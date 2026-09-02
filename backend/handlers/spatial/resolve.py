"""
GET /api/spatial/resolve
────────────────────────
Point-in-polygon resolution of a lat/lng into district / taluk / village, plus
the display level appropriate to the current zoom.
"""

from typing import Any, Dict

from core.http import Request, json_response
from services.hierarchy_resolver import spatial_resolver


def handle(request: Request) -> Dict[str, Any]:
    lat = request.q_float("lat", required=True)
    lng = request.q_float("lng", required=True)
    zoom = request.q_float("zoom", default=7.0)
    return json_response(spatial_resolver.resolve(lat, lng, zoom))
