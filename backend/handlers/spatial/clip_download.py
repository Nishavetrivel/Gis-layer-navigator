"""
POST /api/spatial/clip/download
───────────────────────────────
Clip the selected layers against a polygon and return one ZIP holding every
layer in the requested format, plus a manifest.
"""

import io
import json
import zipfile
from typing import Any, Dict, List, Optional

from core import config, gisfs
from core.http import Request, binary_response, json_response
from format_exporter import geojson_to_dxf, geojson_to_kml
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
    get_cart_layer_features_in_bbox,
)

#: Aliases the client may use for the two built-in base layers.
VILLAGE_VECTOR_ALIASES = ("village_vector", "village_boundary", "village", "vector")
VILLAGE_FMB_ALIASES = ("village_fmb", "fmb_parcels", "parcels", "subdivisions", "fmb")

_CRS84 = {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}}


def handle(request: Request) -> Dict[str, Any]:
    req = SpatialClipRequest.from_dict(request.json())

    clip_geom = _parse_clip_geometry(req.clip_polygon)
    minx, miny, maxx, maxy = clip_geom.bounds if clip_geom else (None, None, None, None)

    layer_map = {d["id"]: d for d in CART_LAYER_DEFINITIONS}
    selected_ids = req.layer_ids or (list(layer_map.keys()) + ["village_vector", "village_fmb"])
    export_format = (req.format or "shp").lower()

    zip_buffer = io.BytesIO()
    exported: Dict[str, int] = {}

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. Village boundaries (vector).
        if any(k in selected_ids for k in VILLAGE_VECTOR_ALIASES):
            feats = _collect_village_features_for_clip(
                req, "vector", config.FMB_MERGED_URI, config.FMB_LAYER_ID, vector_tile_manager,
            )
            clipped = _clip_feature_list(feats, clip_geom, "polygon", minx, miny, maxx, maxy) if feats else []
            if clipped:
                _write_layer(zf, "Village_Boundary_Vector", clipped, "polygon",
                             export_format, "vector")
                exported["Village_Boundary_Vector"] = len(clipped)

        # 2. FMB subdivisions and survey parcels.
        if any(k in selected_ids for k in VILLAGE_FMB_ALIASES):
            feats = _collect_village_features_for_clip(
                req, "fmb", config.FMB_MERGED_URI, config.FMB_LAYER_ID, vector_tile_manager,
            )
            clipped = _clip_feature_list(feats, clip_geom, "polygon", minx, miny, maxx, maxy) if feats else []
            if clipped:
                _write_layer(zf, "Village_FMB_Subdivisions", clipped, "polygon",
                             export_format, "fmb")
                exported["Village_FMB_Subdivisions"] = len(clipped)

        # 3. Thematic cart layers.
        for lid in selected_ids:
            defn = layer_map.get(lid)
            if not defn:
                continue
            uri = find_cart_layer_file(lid)
            geom_type = defn.get("geom_type", "point")
            title = defn.get("name", lid).replace("generic_viewer_", "").replace(" ", "_")
            try:
                feats = []
                if minx is not None and miny is not None:
                    feats = get_cart_layer_features_in_bbox(
                        lid, minx, miny, maxx, maxy, vector_tile_manager, uri
                    )
                if not feats and uri and gisfs.exists(uri):
                    feats = _layer_features(lid, uri)

                if not feats:
                    continue
                clipped = _clip_feature_list(feats, clip_geom, geom_type, minx, miny, maxx, maxy)
                if not clipped:
                    continue
                _write_layer(zf, title, clipped, geom_type, export_format, "vector")
                exported[title] = len(clipped)
            except Exception as e:
                print("[spatial/clip_download] Error exporting %s: %s" % (lid, e))

        zf.writestr("manifest.json", json.dumps({
            "export_type": "Spatial_Polygon_Clip",
            "format": export_format,
            "total_layers": len(exported),
            "layers": exported,
        }, indent=2))

    zip_bytes = zip_buffer.getvalue()
    if not exported:
        return json_response({
            "success": False,
            "detail": "No features fell inside the clip polygon for the selected layers.",
        }, status=404)

    filename = "%s_%s.zip" % (req.clip_name or "TamilNadu_Layers", export_format)
    return binary_response(zip_bytes, "application/zip", filename)


def _write_layer(zf: zipfile.ZipFile, title: str, features: List[Dict[str, Any]],
                 geom_type: str, export_format: str, file_type: str) -> None:
    """Serialise one clipped layer into the bundle in the requested format."""
    fc = {"type": "FeatureCollection", "name": title, "crs": _CRS84, "features": features}

    if export_format == "shp":
        from shp_exporter import export_features_to_shp_in_zip
        export_features_to_shp_in_zip(features, title, geom_type, zf)
    elif export_format in ("kml", "kmz"):
        zf.writestr("%s.kml" % title, geojson_to_kml(fc, title, file_type))
    elif export_format == "dxf":
        zf.writestr("%s.dxf" % title, geojson_to_dxf(fc))
    else:
        zf.writestr("%s.geojson" % title, json.dumps(fc, indent=2))


def _layer_features(layer_id: str, uri: str) -> Optional[List[Dict[str, Any]]]:
    cached = cart_layer_cache.get(layer_id)
    if cached and "geojson" in cached:
        return cached["geojson"].get("features", [])
    raw = load_geojson_file(uri)
    if not raw:
        return None
    feats = raw.get("features", []) if raw.get("type") == "FeatureCollection" else [raw]
    cart_layer_cache[layer_id] = {"geojson": {"type": "FeatureCollection", "features": feats}}
    return feats
