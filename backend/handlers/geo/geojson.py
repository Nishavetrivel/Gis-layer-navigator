"""
GET /api/geojson
────────────────
Merged boundary GeoJSON for a district / taluk / village / parcel scope.

The whole-state district and taluk collections are the two hottest requests in
the app. The FastAPI server pre-rendered them into memory on startup; a Lambda
has no startup hook to hang that on, so they are built once by
``scripts/build_startup_cache.py`` and served straight from storage as bytes.
"""

from typing import Any, Dict

from core import config, gisfs
from core.asyncutil import run_sync
from core.http import Request, cache_headers, json_response, raw_json_response
from services.geojson_builder import build_merged_geojson

_ALL_CODES = ("all", "*", "")


def handle(request: Request) -> Dict[str, Any]:
    level = request.q("level", default="village") or "village"
    code = request.q("code", default="") or ""
    district_code = request.q("district_code")
    taluk_code = request.q("taluk_code")
    village_code = request.q("village_code")

    prebuilt = _prebuilt_uri(level, code, district_code, taluk_code)
    if prebuilt and gisfs.exists(prebuilt):
        return raw_json_response(gisfs.read_bytes(prebuilt), headers=cache_headers(3600))

    result = run_sync(build_merged_geojson(
        level=level,
        code=code,
        q_dist=district_code,
        q_tal=taluk_code,
        q_vil=village_code,
        file_type=request.q("file_type", default="vector") or "vector",
        survey_no=request.q("survey_no"),
    ))
    return json_response(result, headers=cache_headers(600))


def _prebuilt_uri(level: str, code: str, district_code, taluk_code) -> str:
    """Storage URI of the pre-rendered payload for a whole-state request."""
    if code not in _ALL_CODES:
        return ""
    if level == "district" and not district_code:
        return config.STARTUP_DISTRICT_URI
    if level == "taluk" and not district_code and not taluk_code:
        return config.STARTUP_TALUK_URI
    return ""
