"""
GET /api/search
───────────────
Global search over the district / taluk / village / survey index.
"""

from typing import Any, Dict

from core.http import Request, json_response
from db import search_gis_index


def handle(request: Request) -> Dict[str, Any]:
    query = request.q("q", default="") or ""
    limit = request.q_int("limit", default=50) or 50
    results = search_gis_index(query, limit=limit, level_filter=request.q("level"))
    return json_response({"success": True, "data": results, "count": len(results)})
