"""
POST /api/spatial/clip/preview
──────────────────────────────
Clip every selected layer against a drawn polygon and return per-layer counts
plus a capped feature sample for rendering.
"""

from typing import Any, Dict, List

from core import config, gisfs
from core.http import Request, json_response
from mvt_service import vector_tile_manager
from services.cart_layer_service import (
    CART_LAYER_DEFINITIONS,
    cart_layer_cache,
    find_cart_layer_file,
)
from services.geometry_service import load_geojson_file
from services.spatial_clip_service import (
    SpatialClipRequest,
    _clip_feature_list,
    _collect_village_features_for_clip,
    _parse_clip_geometry,
)

#: Preview caps — enough to draw, small enough to return inline.
VILLAGE_SAMPLE = 50
PARCEL_SAMPLE = 100
CART_SAMPLE = 100
TOTAL_SAMPLE = 5000


def handle(request: Request) -> Dict[str, Any]:
    req = SpatialClipRequest.from_dict(request.json())

    clip_geom = _parse_clip_geometry(req.clip_polygon)
    minx, miny, maxx, maxy = clip_geom.bounds if clip_geom else (None, None, None, None)

    layer_counts: Dict[str, int] = {}
    preview_features: List[Dict[str, Any]] = []
    layer_map = {d["id"]: d for d in CART_LAYER_DEFINITIONS}

    def collect(features, layer_id, color, geom_type, cap):
        clipped = _clip_feature_list(features, clip_geom, geom_type, minx, miny, maxx, maxy)
        layer_counts[layer_id] = len(clipped)
        for cf in clipped[:cap]:
            props = dict(cf.get("properties") or {})
            props["_clip_layer_id"] = layer_id
            props["_clip_layer_color"] = color
            props["_clip_geom_type"] = geom_type
            preview_features.append({
                "type": "Feature", "properties": props, "geometry": cf["geometry"],
            })
        return clipped

    # 1. Village boundaries (vector).
    v_vector = _collect_village_features_for_clip(
        req, "vector", config.FMB_MERGED_URI, config.FMB_LAYER_ID, vector_tile_manager,
    )
    if v_vector:
        clipped = collect(v_vector, "village_vector", "#10b981", "polygon", VILLAGE_SAMPLE)
        layer_counts["village_boundary"] = len(clipped)

    # 2. FMB subdivisions and survey parcels.
    v_fmb = _collect_village_features_for_clip(
        req, "fmb", config.FMB_MERGED_URI, config.FMB_LAYER_ID, vector_tile_manager,
    )
    if v_fmb:
        clipped = collect(v_fmb, "village_fmb", "#06b6d4", "polygon", PARCEL_SAMPLE)
        layer_counts["fmb_parcels"] = len(clipped)

    # 3. Thematic cart layers.
    selected_ids = (
        [lid for lid in req.layer_ids if lid in layer_map]
        if req.layer_ids else list(layer_map.keys())
    )
    for lid in selected_ids:
        defn = layer_map.get(lid)
        if not defn:
            continue
        uri = find_cart_layer_file(lid)
        if not uri or not gisfs.exists(uri):
            continue
        try:
            feats = _layer_features(lid, uri)
            if feats is None:
                continue
            collect(feats, lid, defn.get("color", "#38bdf8"),
                    defn.get("geom_type", "point"), CART_SAMPLE)
        except Exception as e:
            print("[spatial/clip_preview] Error clipping %s: %s" % (lid, e))

    return json_response({
        "success": True,
        "counts": layer_counts,
        "total_features": len(preview_features),
        "geojson": {
            "type": "FeatureCollection",
            "features": preview_features[:TOTAL_SAMPLE],
        },
    })


def _layer_features(layer_id: str, uri: str):
    """Cached feature list for a cart layer, or None when it cannot be read."""
    cached = cart_layer_cache.get(layer_id)
    if cached and "geojson" in cached:
        return cached["geojson"].get("features", [])
    raw = load_geojson_file(uri)
    if not raw:
        return None
    feats = raw.get("features", []) if raw.get("type") == "FeatureCollection" else [raw]
    cart_layer_cache[layer_id] = {"geojson": {"type": "FeatureCollection", "features": feats}}
    return feats
