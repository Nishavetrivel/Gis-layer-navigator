"""
GET /api/download/{level}/{code}
────────────────────────────────
Path-addressed alias of /api/export.

Bound to the ``/api/download/{proxy+}`` resource because the code segment may
itself contain slashes (a survey number such as ``12/1B``), which a
single-segment path parameter cannot carry.
"""

from urllib.parse import unquote
from typing import Any, Dict

from core.http import Request, HttpError, binary_response
from handlers.export._export_core import build_export


def handle(request: Request) -> Dict[str, Any]:
    segments = request.proxy_segments()
    if len(segments) < 2:
        raise HttpError(400, "Expected /api/download/{level}/{code}")

    level = unquote(segments[0])
    code = unquote("/".join(segments[1:]))

    payload, content_type, filename = build_export(
        level=level,
        code=code,
        district_code=request.q("district_code"),
        taluk_code=request.q("taluk_code"),
        village_code=request.q("village_code"),
        # This route spells the layer type "type" rather than "file_type".
        file_type=request.q("type", default="vector") or "vector",
        export_format=request.q("format", default="shp") or "shp",
        base_survey=request.q("base_survey"),
    )
    return binary_response(payload, content_type, filename)
