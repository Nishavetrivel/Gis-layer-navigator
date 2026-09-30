"""
backend/services/spatial_clip_service.py
───────────────────────────────────────
Spatial geometry clipping, intersection calculations, and multi-layer feature extraction.
"""

from dataclasses import dataclass, field
from typing import Optional, Any, Dict, List

import shapely.geometry
from shapely.geometry import box, shape, mapping, Polygon, MultiPolygon, Point
from shapely.ops import unary_union

from core import gisfs
from services.geometry_service import (
    load_geojson_file,
    _fast_bbox_check,
)
from db import get_village_entries


@dataclass
class SpatialClipRequest:
    """Body of /api/spatial/clip/preview and /api/spatial/clip/download.

    A dataclass rather than a pydantic model: the only validation this payload
    needs is coercion, and dropping pydantic keeps the shared Lambda layer small.
    """

    #: GeoJSON FeatureCollection / Polygon / MultiPolygon, a
    #: ``[min_lng, min_lat, max_lng, max_lat]`` bbox, or None for the full layer.
    clip_polygon: Optional[Any] = None
    layer_ids: List[str] = field(default_factory=list)
    format: str = "shp"  # shp | geojson | kml | kmz | dxf
    clip_name: str = "TamilNadu_Spatial_Layers"
    village_geojson: Optional[Any] = None
    parcel_geojson: Optional[Any] = None
    district_code: Optional[str] = None
    taluk_code: Optional[str] = None
    village_code: Optional[str] = None
    village_codes: List[str] = field(default_factory=list)
    file_type: Optional[str] = "fmb"

    @classmethod
    def from_dict(cls, body: Optional[Dict[str, Any]]) -> "SpatialClipRequest":
        body = body or {}

        def as_list(value: Any) -> List[str]:
            if value is None:
                return []
            if isinstance(value, str):
                return [v.strip() for v in value.split(",") if v.strip()]
            if isinstance(value, (list, tuple)):
                return [str(v) for v in value if v not in (None, "")]
            return []

        def as_str(value: Any) -> Optional[str]:
            return None if value is None else str(value)

        return cls(
            clip_polygon=body.get("clip_polygon"),
            layer_ids=as_list(body.get("layer_ids")),
            format=str(body.get("format") or "shp"),
            clip_name=str(body.get("clip_name") or "TamilNadu_Spatial_Layers"),
            village_geojson=body.get("village_geojson"),
            parcel_geojson=body.get("parcel_geojson"),
            district_code=as_str(body.get("district_code")),
            taluk_code=as_str(body.get("taluk_code")),
            village_code=as_str(body.get("village_code")),
            village_codes=as_list(body.get("village_codes")),
            file_type=str(body.get("file_type") or "fmb"),
        )

def _parse_clip_geometry(poly_data: Any):
    """Parse various client clip geometry inputs (BBox array, FeatureCollection, Polygon, Coords list)."""
    if not poly_data or poly_data == 'all' or poly_data == 'full':
        return None
    try:
        # 1. Check if bbox array [min_lng, min_lat, max_lng, max_lat]
        if isinstance(poly_data, (list, tuple)) and len(poly_data) == 4 and all(isinstance(x, (int, float)) for x in poly_data):
            return box(poly_data[0], poly_data[1], poly_data[2], poly_data[3]) # minx, miny, maxx, maxy

        # 2. Check if FeatureCollection (e.g. active Village layer or multiple combined villages)
        if isinstance(poly_data, dict) and poly_data.get("type") == "FeatureCollection":
            feats = poly_data.get("features", [])
            shapes = []
            for f in feats:
                g = f.get("geometry")
                if g:
                    try:
                        s = shape(g)
                        if not s.is_valid:
                            from shapely import make_valid
                            s = make_valid(s)
                        if not s.is_empty:
                            shapes.append(s)
                    except Exception:
                        pass
            if shapes:
                return unary_union(shapes) if len(shapes) > 1 else shapes[0]

        # 3. Check if GeoJSON Feature or geometry dict
        if isinstance(poly_data, dict):
            geom = poly_data.get("geometry") or poly_data
            if geom.get("type") in ("Polygon", "MultiPolygon", "GeometryCollection", "Point", "LineString"):
                s_geom = shape(geom)
                if not s_geom.is_valid:
                    from shapely import make_valid
                    s_geom = make_valid(s_geom)
                return s_geom

        # 4. Check if list of features or coordinates
        if isinstance(poly_data, list) and len(poly_data) > 0:
            if isinstance(poly_data[0], dict):
                shapes = []
                for item in poly_data:
                    g = item.get("geometry") if isinstance(item, dict) else item
                    if isinstance(g, dict) and g.get("type"):
                        try:
                            s = shape(g)
                            if not s.is_valid:
                                from shapely import make_valid
                                s = make_valid(s)
                            shapes.append(s)
                        except Exception:
                            pass
                if shapes:
                    return unary_union(shapes) if len(shapes) > 1 else shapes[0]

            if isinstance(poly_data[0], list):
                coords = poly_data[0] if (len(poly_data[0]) > 0 and isinstance(poly_data[0][0], list)) else poly_data
                if len(coords) >= 3:
                    coords_list = list(coords)
                    if coords_list[0] != coords_list[-1]:
                        coords_list.append(coords_list[0])
                    return Polygon(coords_list)
    except Exception as e:
        print("[spatial_clip_service] Clip geometry parse error:", e)
    return None

def _clip_feature_list(
    feats: List[Dict[str, Any]],
    clip_geom: Any,
    gtype: str,
    minx: Optional[float],
    miny: Optional[float],
    maxx: Optional[float],
    maxy: Optional[float]
) -> List[Dict[str, Any]]:
    """Clip a list of GeoJSON features against clip_geom with robust geometry intersection."""
    if clip_geom is None:
        return feats
    clipped = []
    for f in feats:
        geom = f.get("geometry")
        if not geom:
            continue
        
        # Fast BBox reject
        if minx is not None and not _fast_bbox_check(geom, minx, miny, maxx, maxy):
            continue

        g_type = geom.get("type", "")
        coords = geom.get("coordinates", [])

        if g_type == "Point" and len(coords) >= 2:
            px, py = coords[0], coords[1]
            if clip_geom.contains(Point(px, py)) or clip_geom.intersects(Point(px, py)):
                clipped.append(f)
            continue

        try:
            s = shape(geom)
            if not s.is_valid:
                from shapely import make_valid
                s = make_valid(s)

            if gtype == "point":
                if clip_geom.contains(s) or clip_geom.intersects(s):
                    clipped.append(f)
            else:
                if s.intersects(clip_geom):
                    inter = s.intersection(clip_geom)
                    if not inter.is_empty:
                        if inter.geom_type == "GeometryCollection":
                            sub_lines = [g for g in inter.geoms if g.geom_type in ("LineString", "MultiLineString")]
                            sub_polys = [g for g in inter.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
                            if gtype == "line" and sub_lines:
                                inter = unary_union(sub_lines)
                            elif gtype == "polygon" and sub_polys:
                                inter = unary_union(sub_polys)
                            elif sub_lines or sub_polys:
                                inter = unary_union(sub_lines + sub_polys)
                            else:
                                continue
                        new_f = dict(f)
                        new_f["geometry"] = mapping(inter)
                        clipped.append(new_f)
        except Exception:
            pass
    return clipped

def _collect_village_features_for_clip(
    req: SpatialClipRequest,
    file_type: str,
    fmb_district_01_path: Optional[str] = None,
    fmb_layer_id: str = "fmb_district_01",
    vector_tile_mgr: Optional[Any] = None
) -> List[Dict[str, Any]]:
    """Collect features for single or multiple villages across Vector or FMB."""
    features = []
    seen_ids = set()

    # 1. Direct active layer passed from client
    if file_type == "vector" and req.village_geojson and isinstance(req.village_geojson, dict):
        for f in req.village_geojson.get("features", []):
            fid = f.get("properties", {}).get("village_code") or id(f)
            features.append(f)
            seen_ids.add(fid)
    elif file_type == "fmb" and req.parcel_geojson and isinstance(req.parcel_geojson, dict):
        for f in req.parcel_geojson.get("features", []):
            features.append(f)

    # 2. Check multiple village codes or single village code
    v_codes = list(req.village_codes) if req.village_codes else []
    if req.village_code and req.village_code not in v_codes:
        v_codes.append(req.village_code)

    if v_codes:
        for v_code_raw in v_codes:
            parts = str(v_code_raw).split("_")
            if len(parts) >= 3:
                d_c, t_c, v_c = parts[0], parts[1], parts[2]
            else:
                d_c = req.district_code or ""
                t_c = req.taluk_code or ""
                v_c = v_code_raw

            entries = get_village_entries(d_c, t_c, v_c, file_type)
            if not entries and file_type == "fmb":
                entries = get_village_entries(d_c, t_c, v_c, "vector")

            for ent in entries:
                gp = ent.get("geojson_path")
                if gp and gisfs.exists(gp):
                    raw = load_geojson_file(gp)
                    if raw:
                        fs = raw.get("features", []) if raw.get("type") == "FeatureCollection" else [raw]
                        for f in fs:
                            features.append(f)

    # 3. Fallback: If no features yet, load from district + taluk scope
    if not features and req.district_code and req.taluk_code:
        entries = get_village_entries(req.district_code, req.taluk_code, "*", file_type)
        for ent in entries:
            gp = ent.get("geojson_path")
            if gp and gisfs.exists(gp):
                raw = load_geojson_file(gp)
                if raw:
                    fs = raw.get("features", []) if raw.get("type") == "FeatureCollection" else [raw]
                    features.extend(fs)

    # 4. FMB fallback: use merged district FMB GeoJSON via spatial index
    if not features and file_type == "fmb" and fmb_district_01_path and vector_tile_mgr:
        clip_geom_bounds = None
        if req.clip_polygon:
            try:
                cg = _parse_clip_geometry(req.clip_polygon)
                if cg:
                    clip_geom_bounds = cg.bounds  # (minx, miny, maxx, maxy)
            except Exception:
                pass

        MERGED_FMB_PATHS = {
            "01": fmb_district_01_path,
        }
        d_c = req.district_code or ""
        if d_c and d_c in MERGED_FMB_PATHS:
            merged_path = MERGED_FMB_PATHS[d_c]
            if gisfs.exists(merged_path):
                try:
                    vector_tile_mgr.ensure_spatial_index(fmb_layer_id, merged_path)
                    conn = vector_tile_mgr.get_connection(fmb_layer_id)
                    if conn and clip_geom_bounds:
                        minx, miny, maxx, maxy = clip_geom_bounds
                        cur = conn.cursor()
                        cur.execute("""
                            SELECT f.geom_type, f.coords_json, f.props_json
                            FROM features f
                            JOIN spatial_index si ON f.id = si.id
                            WHERE si.minx <= ? AND si.maxx >= ?
                              AND si.miny <= ? AND si.maxy >= ?
                        """, (maxx, minx, maxy, miny))
                        rows = cur.fetchall()
                        import json as _json
                        for geom_type, coords_json, props_json in rows:
                            try:
                                coords = _json.loads(coords_json)
                                props = _json.loads(props_json) if props_json else {}
                                feat = {
                                    "type": "Feature",
                                    "geometry": {"type": geom_type, "coordinates": coords},
                                    "properties": props,
                                }
                                features.append(feat)
                            except Exception:
                                pass
                        print(f"[spatial_clip_service] FMB clip: loaded {len(features)} features from merged district {d_c} FMB via spatial index")
                except Exception as e:
                    print(f"[spatial_clip_service] FMB merged GeoJSON spatial query error: {e}")

    return features


def get_cart_layer_features_in_bbox(
    layer_id: str,
    minx: float,
    miny: float,
    maxx: float,
    maxy: float,
    vector_tile_mgr: Optional[Any] = None,
    uri: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Query features within bbox using pre-built SQLite spatial index in milliseconds."""
    import json as _json

    if vector_tile_mgr:
        try:
            vector_tile_mgr.ensure_spatial_index(layer_id, uri)
            conn = vector_tile_mgr.get_connection(layer_id)
            if conn:
                cur = conn.cursor()
                cur.execute("""
                    SELECT f.geom_type, f.coords_json, f.props_json
                    FROM spatial_index s JOIN features f ON s.id = f.id
                    WHERE s.minx <= ? AND s.maxx >= ? AND s.miny <= ? AND s.maxy >= ?
                """, (maxx, minx, maxy, miny))
                rows = cur.fetchall()
                feats = []
                for geom_type, coords_json, props_json in rows:
                    try:
                        coords = _json.loads(coords_json)
                        props = _json.loads(props_json) if props_json else {}
                        feats.append({
                            "type": "Feature",
                            "geometry": {"type": geom_type, "coordinates": coords},
                            "properties": props,
                        })
                    except Exception:
                        pass
                # Return index query results directly (even if empty, index is authoritative)
                return feats
        except Exception as e:
            print(f"[spatial_clip_service] Spatial index query error for {layer_id}: {e}")

    # Fallback to loading full geojson only if index is unavailable
    if uri and gisfs.exists(uri):
        raw = load_geojson_file(uri)
        if raw:
            return raw.get("features", []) if raw.get("type") == "FeatureCollection" else [raw]
    return []
