"""
GET /api/auto-zoom-layer
────────────────────────
Background layer for zoom-driven display switching.

The statewide village layer is ~40 MB — past what API Gateway will return — so
when it lives in S3 the client is redirected to a pre-signed URL and fetches it
directly. Locally the file is served inline, preserving dev behaviour.
"""

import os
import boto3
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


def _presign_s3(uri: str) -> str:
    bucket, key = uri.replace("s3://", "").split("/", 1)
    s3 = boto3.client("s3", region_name=os.getenv("AWS_REGION", "ap-south-1"))
    return s3.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=3600)


def handle(request: Request) -> Dict[str, Any]:
    level = (request.q_required("level")).lower().strip()

    if level == "village":
        local_fast = os.path.abspath(os.path.join(config._REPO_ROOT, "data", "cache", "merged_village_fast.geojson"))
        if os.path.exists(local_fast):
            return _serve_file(local_fast)
        for uri in (config.FAST_VILLAGE_URI, config.MERGED_VILLAGE_URI):
            if uri and gisfs.exists(uri):
                return _serve_file(uri)
        return _build("village")

    if level in ("district", "taluk"):
        if level == "district":
            fast_cache = os.path.abspath(os.path.join(config._REPO_ROOT, "data", "cache", "district_geojson_fast.geojson"))
            if os.path.exists(fast_cache):
                return _serve_file(fast_cache)
        cache_name = "district_geojson.geojson" if level == "district" else "taluk_geojson.geojson"
        local_cache = os.path.abspath(os.path.join(config._REPO_ROOT, "data", "cache", cache_name))
        if os.path.exists(local_cache):
            return _serve_file(local_cache)

        prebuilt = (
            config.STARTUP_DISTRICT_URI if level == "district" else config.STARTUP_TALUK_URI
        )
        if gisfs.exists(prebuilt):
            import json as _json

            payload = _json.loads(gisfs.read_bytes(prebuilt).decode("utf-8", errors="replace"))
            return json_response(payload.get("geojson", _EMPTY), headers=_IMMUTABLE)

        direct_uri = (
            f"{config.GIS_DATA_URI}/District 2/District/district geojson.geojson"
            if level == "district"
            else f"{config.GIS_DATA_URI}/Taluk 5/Taluk/taluk geojson.geojson"
        )
        if gisfs.exists(direct_uri):
            return _serve_file(direct_uri)

        return _build(level)

    raise HttpError(400, "Invalid level for auto-zoom display layer.")


def _serve_file(uri: str) -> Dict[str, Any]:
    """Hand back a stored GeoJSON, by redirect when it is too big to proxy."""
    if config.is_s3(uri):
        if gisfs.getsize(uri) > config.MAX_INLINE_RESPONSE_BYTES:
            return redirect(_presign_s3(uri))
        return raw_json_response(gisfs.read_bytes(uri), headers=_IMMUTABLE)

    # Local development
    return response(
        200,
        gisfs.read_bytes(uri).decode("utf-8", errors="replace"),
        _IMMUTABLE,
        "application/json",
    )


def _build(level: str) -> Dict[str, Any]:
    res = run_sync(build_merged_geojson(level=level, code="all")) or {}
    return json_response(res.get("geojson", _EMPTY), headers=_IMMUTABLE)

