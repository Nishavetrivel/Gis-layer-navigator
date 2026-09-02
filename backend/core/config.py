"""
backend/core/config.py
──────────────────────
Environment-driven configuration for the serverless backend.

Every path the backend touches is expressed as a URI so the same code runs
against S3 in Lambda and against a local folder during development:

    GIS_DATA_URI=s3://my-gis-bucket/gis      (deployed)
    GIS_DATA_URI=./data                      (local dev)
"""

import os
from typing import List


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name) or default)
    except (TypeError, ValueError):
        return default


def _env_bool(name: str, default: bool = False) -> bool:
    raw = (os.environ.get(name) or "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


# ─── ROOT DATA LOCATION ───────────────────────────────────────────────────────

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

#: Root of all GIS data. ``s3://bucket/prefix`` in Lambda, a folder locally.
GIS_DATA_URI: str = _env("GIS_DATA_URI") or os.path.join(_REPO_ROOT, "data")

#: Bucket that stores generated artefacts (tile cache, offloaded exports).
ARTIFACT_BUCKET: str = _env("ARTIFACT_BUCKET")


def child_uri(uri: str, *parts: str) -> str:
    """Join a child path onto a URI, preserving the ``s3://`` scheme."""
    if uri.startswith("s3://"):
        base = uri.rstrip("/")
        for p in parts:
            base = base + "/" + str(p).strip("/")
        return base
    return os.path.join(uri, *parts)


_child = child_uri


# ─── DATA SUB-PREFIXES ────────────────────────────────────────────────────────
# Each may be overridden individually; otherwise they hang off GIS_DATA_URI.

DISTRICT_URI: str = _env("GIS_DISTRICT_URI") or _child(GIS_DATA_URI, "District 2")
TALUK_URI: str = _env("GIS_TALUK_URI") or _child(GIS_DATA_URI, "Taluk 5")
VECTOR_URI: str = _env("GIS_VECTOR_URI") or _child(GIS_DATA_URI, "vector")
CART_LAYERS_URI: str = _env("GIS_CART_LAYERS_URI") or _child(GIS_DATA_URI, "cart_layers")
CACHE_URI: str = _env("GIS_CACHE_URI") or _child(GIS_DATA_URI, "cache")

#: JSON map of official district / taluk / village names.
OFFICIAL_NAMES_URI: str = _env("GIS_OFFICIAL_NAMES_URI") or _child(
    GIS_DATA_URI, "official_names.json"
)

#: Optional per-layer override map: {"layer_id": "s3://.../file.geojson"}.
CART_LAYERS_CONFIG_URI: str = _env("GIS_CART_LAYERS_CONFIG_URI") or _child(
    GIS_DATA_URI, "cart_layers_config.json"
)

#: Merged Field Measurement Book district-01 boundaries (vector tiles + clipping).
FMB_MERGED_URI: str = _env("GIS_FMB_MERGED_URI") or _child(
    GIS_DATA_URI, "fmb", "district_01_merged_fmb.geojson"
)
FMB_LAYER_ID: str = _env("GIS_FMB_LAYER_ID", "fmb_district_01")

#: Statewide village boundary sources used by the spatial hierarchy resolver.
TN_VILLAGE_BOUNDARY_GEOJSON_URI: str = _env("GIS_TN_VILLAGE_GEOJSON_URI") or _child(
    GIS_DATA_URI, "tn_village_boundary", "geojson.geojson"
)
TN_VILLAGE_BOUNDARY_SHP_URI: str = _env("GIS_TN_VILLAGE_SHP_URI") or _child(
    GIS_DATA_URI, "tn_village_boundary", "village.shp"
)
TN_VILLAGE_BOUNDARY_CACHE_URI: str = _env("GIS_TN_VILLAGE_CACHE_URI") or _child(
    GIS_DATA_URI, "tn_village_boundary", "geojson_cache.pkl"
)

#: Pre-simplified statewide village layer served by /api/auto-zoom-layer.
FAST_VILLAGE_URI: str = _env("GIS_FAST_VILLAGE_URI") or _child(
    CACHE_URI, "merged_village_fast.geojson"
)
MERGED_VILLAGE_URI: str = _env("GIS_MERGED_VILLAGE_URI") or TN_VILLAGE_BOUNDARY_GEOJSON_URI

#: Pre-built startup payloads uploaded by scripts/build_startup_cache.py. These
#: replace the in-process warmup thread the FastAPI server used to run.
STARTUP_DISTRICT_URI: str = _env("GIS_STARTUP_DISTRICT_URI") or _child(
    CACHE_URI, "startup_all_districts.json"
)
STARTUP_TALUK_URI: str = _env("GIS_STARTUP_TALUK_URI") or _child(
    CACHE_URI, "startup_all_taluks.json"
)


# ─── EPHEMERAL (/tmp) CACHE ───────────────────────────────────────────────────

#: Where remote objects are materialised for random-access readers (sqlite, pyshp).
LOCAL_CACHE_DIR: str = _env("GIS_LOCAL_CACHE_DIR", "/tmp/gis-cache")

#: Soft budget for the /tmp mirror, in megabytes. LRU eviction above this.
LOCAL_CACHE_BUDGET_MB: int = _env_int("GIS_LOCAL_CACHE_BUDGET_MB", 3072)

#: Seconds an S3 directory listing is trusted inside a warm container.
LISTING_TTL_SECONDS: int = _env_int("GIS_LISTING_TTL_SECONDS", 900)

#: Max objects pulled into a single cached listing (guards runaway prefixes).
LISTING_MAX_KEYS: int = _env_int("GIS_LISTING_MAX_KEYS", 200000)


# ─── VECTOR TILES ─────────────────────────────────────────────────────────────

#: Where sqlite R-Tree indexes live. Pre-built by scripts/build_tile_indexes.py.
TILE_INDEX_URI: str = _env("GIS_TILE_INDEX_URI") or CACHE_URI

#: S3 prefix for generated .pbf tiles. Empty disables the write-through cache.
TILE_CACHE_URI: str = _env("GIS_TILE_CACHE_URI")

#: Refuse to build a missing index in-request above this source size (MB).
TILE_INDEX_BUILD_LIMIT_MB: int = _env_int("GIS_TILE_INDEX_BUILD_LIMIT_MB", 64)

TILE_MAX_AGE_SECONDS: int = _env_int("GIS_TILE_MAX_AGE_SECONDS", 86400)


# ─── AI ASSISTANT ─────────────────────────────────────────────────────────────

GEMINI_API_KEY_ENV: str = _env("GEMINI_API_KEY")
GEMINI_SECRET_ARN: str = _env("GEMINI_SECRET_ARN")
GEMINI_MODEL: str = _env("GEMINI_MODEL", "gemini-2.5-flash")


# ─── HTTP ─────────────────────────────────────────────────────────────────────

CORS_ALLOW_ORIGIN: str = _env("CORS_ALLOW_ORIGIN", "*")

#: Responses above this many bytes are offloaded to S3 and returned as a 302.
#: API Gateway hard-caps a Lambda proxy response at 6 MB (base64 inflates by ~33%).
MAX_INLINE_RESPONSE_BYTES: int = _env_int("MAX_INLINE_RESPONSE_BYTES", 4_000_000)

#: Lifetime of pre-signed URLs handed out for offloaded large responses.
PRESIGN_TTL_SECONDS: int = _env_int("PRESIGN_TTL_SECONDS", 900)

STAGE: str = _env("STAGE", "dev")
DEBUG: bool = _env_bool("DEBUG", False)


def is_s3(uri: str) -> bool:
    return bool(uri) and uri.startswith("s3://")


def split_s3(uri: str):
    """``s3://bucket/a/b`` -> ``("bucket", "a/b")``."""
    if not is_s3(uri):
        raise ValueError("Not an S3 URI: %r" % (uri,))
    rest = uri[len("s3://"):]
    bucket, _, key = rest.partition("/")
    return bucket, key


def data_roots() -> List[str]:
    """All configured data roots, used for diagnostics and warmup."""
    return [DISTRICT_URI, TALUK_URI, VECTOR_URI, CART_LAYERS_URI, CACHE_URI]


def describe() -> dict:
    """Serialisable snapshot of the active configuration."""
    return {
        "stage": STAGE,
        "data_uri": GIS_DATA_URI,
        "district_uri": DISTRICT_URI,
        "taluk_uri": TALUK_URI,
        "vector_uri": VECTOR_URI,
        "cart_layers_uri": CART_LAYERS_URI,
        "cache_uri": CACHE_URI,
        "tile_index_uri": TILE_INDEX_URI,
        "tile_cache_uri": TILE_CACHE_URI or None,
        "artifact_bucket": ARTIFACT_BUCKET or None,
        "local_cache_dir": LOCAL_CACHE_DIR,
    }
