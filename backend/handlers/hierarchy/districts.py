"""
GET /api/districts
──────────────────
Districts with their code and official Tamil Nadu name.
"""

from typing import Any, Dict

from core.http import Request, json_response, cache_headers
from db import get_all_districts


def handle(request: Request) -> Dict[str, Any]:
    districts = get_all_districts()
    # The district roster is effectively static; let the browser and API
    # Gateway hold it rather than re-deriving it on every navigation.
    return json_response(districts, headers=cache_headers(3600))
