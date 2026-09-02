"""
GET /api/auto-zoom-layer
────────────────────────
Background layer for zoom-driven display switching.

The statewide village layer is ~40 MB — past what API Gateway will return — so
when it lives in S3 the client is redirected to a pre-signed URL and fetches it
directly. Locally the file is served inline, preserving dev behaviour.
"""

from typing import Any, Dict

from core import config, gisfs
from core.asyncutil import run_sync
from core.http import (
    HttpError,
    Request,
    cache_headers,
    json_response,
    raw_json_response,
    redirect,
    response,
)
from services.geojson_builder import build_merged_geojson

_IMMUTABLE = cache_headers(31536000, immutable=True)
_EMPTY = {"type": "FeatureCollection", "features": []}


def handle(request: Request) -> Dict[str, Any]:
    level = (request.q_required("level")).lower().strip()

    if level == "village":
        for uri in (config.FAST_VILLAGE_URI, config.MERGED_VILLAGE_URI):
            if uri and gisfs.exists(uri):
                return _serve_file(uri)
        return _build("village")

    if level in ("district", "taluk"):
        prebuilt = (
            config.STARTUP_DISTRICT_URI if level == "district" else config.STARTUP_TALUK_URI
        )
        if gisfs.exists(prebuilt):
            # The startup payload wraps the collection; unwrap to match the contract.
            import json as _json

            payload = _json.loads(gisfs.read_bytes(prebuilt).decode("utf-8", errors="replace"))
            return json_response(payload.get("geojson", _EMPTY), headers=_IMMUTABLE)
        return _build(level)

    raise HttpError(400, "Invalid level for auto-zoom display layer.")


def _serve_file(uri: str) -> Dict[str, Any]:
    """Hand back a stored GeoJSON, by redirect when it is too big to proxy."""
    if config.is_s3(uri):
        if gisfs.getsize(uri) > config.MAX_INLINE_RESPONSE_BYTES:
            # The statewide village layer is ~40 MB — past what API Gateway can
            # return. Send the client to the object instead of proxying it.
            return redirect(gisfs.presign(uri))
        return raw_json_response(gisfs.read_bytes(uri), headers=_IMMUTABLE)

    # Local development: no gateway in the path, so size is not a constraint
    # and there is nothing to offload to.
    return response(
        200,
        gisfs.read_bytes(uri).decode("utf-8", errors="replace"),
        _IMMUTABLE,
        "application/json",
    )


def _build(level: str) -> Dict[str, Any]:
    res = run_sync(build_merged_geojson(level=level, code="all")) or {}
    return json_response(res.get("geojson", _EMPTY), headers=_IMMUTABLE)
