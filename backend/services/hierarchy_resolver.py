"""
backend/services/hierarchy_resolver.py
──────────────────────────────────────
Spatial Point-in-Polygon hierarchy resolver and continuous zoom viewport resolver.
Handles fast viewport bounds calculations across District, Taluk, Village, and Parcel tiers.
"""

import json
import threading
from typing import Dict, Any, List, Tuple, Optional
from shapely.geometry import Point, shape

from core import config, gisfs
from services.geometry_service import load_geojson_file
from services.geojson_builder import build_merged_geojson
from services.cart_layer_service import CART_LAYER_DEFINITIONS, find_cart_layer_file
from db import (
    get_all_district_files,
    get_taluk_root,
    get_village_entries,
    normalize_code_segment,
    _walk_gis_files,
)
from mvt_service import vector_tile_manager

# Statewide village boundary sources, configurable via GIS_TN_VILLAGE_* env vars.
TN_VILLAGE_BOUNDARY_CACHE = config.TN_VILLAGE_BOUNDARY_CACHE_URI
TN_VILLAGE_BOUNDARY_GEOJSON = config.TN_VILLAGE_BOUNDARY_GEOJSON_URI
TN_VILLAGE_BOUNDARY_SHP = config.TN_VILLAGE_BOUNDARY_SHP_URI

class TNVillageBoundaryManager:
    def __init__(self):
        self._features = []
        self._bboxes = []
        self._initialized = False
        self._lock = threading.Lock()

    def initialize(self):
        if self._initialized:
            return
        with self._lock:
            if self._initialized:
                return
            # 1. Prefer pre-compiled binary cache for instant load
            if gisfs.exists(TN_VILLAGE_BOUNDARY_CACHE):
                try:
                    import pickle
                    with gisfs.open_binary(TN_VILLAGE_BOUNDARY_CACHE) as f:
                        self._features, self._bboxes = pickle.load(f)
                    self._initialized = True
                    print(f"[TNVillageBoundaryManager] Loaded {len(self._bboxes)} TN Village boundaries from binary cache")
                    return
                except Exception as e:
                    print("[TNVillageBoundaryManager] Binary cache load error, falling back to raw GeoJSON:", e)

            # 2. Raw GeoJSON
            if gisfs.exists(TN_VILLAGE_BOUNDARY_GEOJSON):
                try:
                    data = json.loads(
                        gisfs.read_bytes(TN_VILLAGE_BOUNDARY_GEOJSON).decode("utf-8", errors="replace")
                    )
                    raw_feats = data.get("features", [])
                    boxes = []
                    valid_feats = []

                    def get_bbox(coords):
                        box = [float('inf'), float('inf'), float('-inf'), float('-inf')]
                        def walk(c):
                            if isinstance(c, (list, tuple)) and len(c) >= 2 and isinstance(c[0], (int, float)):
                                x, y = c[0], c[1]
                                if x < box[0]: box[0] = x
                                if y < box[1]: box[1] = y
                                if x > box[2]: box[2] = x
                                if y > box[3]: box[3] = y
                            elif isinstance(c, (list, tuple)):
                                for sub in c:
                                    walk(sub)
                        walk(coords)
                        return box

                    for feat in raw_feats:
                        geom = feat.get("geometry")
                        if geom:
                            b = get_bbox(geom.get("coordinates", []))
                            if b[0] != float('inf'):
                                idx = len(valid_feats)
                                valid_feats.append(feat)
                                boxes.append((b, idx))

                    self._features = valid_feats
                    self._bboxes = boxes
                    self._initialized = True
                    print(f"[TNVillageBoundaryManager] Indexed {len(self._bboxes)} TN Village boundaries from geojson.geojson")
                    return
                except Exception as e:
                    print("[TNVillageBoundaryManager] GeoJSON load error, falling back to SHP:", e)

            # 3. Fallback to Shapefile
            if gisfs.exists(TN_VILLAGE_BOUNDARY_SHP):
                try:
                    import shapefile
                    local_shp = gisfs.materialize_shapefile(TN_VILLAGE_BOUNDARY_SHP)
                    if not local_shp:
                        raise FileNotFoundError(TN_VILLAGE_BOUNDARY_SHP)
                    sf = shapefile.Reader(local_shp, encoding='latin1')
                    boxes = []
                    feats = []
                    for i, s in enumerate(sf.shapes()):
                        if hasattr(s, 'bbox') and s.bbox:
                            try:
                                rec = sf.record(i)
                                props = {
                                    "district_code": str(rec[0]),
                                    "taluk_code": str(rec[1]),
                                    "village_code": str(rec[7]),
                                    "village_name": str(rec[3]),
                                    "taluk_name": str(rec[6]),
                                    "district_name": str(rec[5]),
                                    "name": str(rec[3]),
                                }
                                feat_dict = {
                                    "type": "Feature",
                                    "properties": props,
                                    "geometry": s.__geo_interface__
                                }
                                idx = len(feats)
                                feats.append(feat_dict)
                                boxes.append((s.bbox, idx))
                            except Exception:
                                pass
                    self._features = feats
                    self._bboxes = boxes
                    self._initialized = True
                    print(f"[TNVillageBoundaryManager] Indexed {len(self._bboxes)} TN Village boundaries from rv_nov29.shp")
                except Exception as e:
                    print("[TNVillageBoundaryManager] Shapefile init error:", e)

    def get_villages_in_bbox(self, min_lng: float, min_lat: float, max_lng: float, max_lat: float, limit: int = 150) -> Dict[str, Any]:
        self.initialize()
        if not self._features or not self._bboxes:
            return {"type": "FeatureCollection", "features": []}
        
        matching_indices = [
            idx for (b, idx) in self._bboxes
            if (max(min_lng, b[0]) <= min(max_lng, b[2])) and (max(min_lat, b[1]) <= min(max_lat, b[3]))
        ]
        
        features = [self._features[idx] for idx in matching_indices[:limit]]
        return {"type": "FeatureCollection", "features": features}

tn_village_boundary_manager = TNVillageBoundaryManager()


class SpatialHierarchyResolver:
    def __init__(self):
        self._district_features = []
        self._taluk_features = []
        self._village_bbox_cache: Dict[Tuple[str, str], List[Tuple[List[float], str, str]]] = {}
        self._initialized = False

    def initialize(self):
        if self._initialized:
            return
        try:
            # 1. Index Districts
            dist_files = get_all_district_files()
            for df in dist_files:
                raw = load_geojson_file(df)
                if raw:
                    feats = raw.get("features", []) if raw.get("type") == "FeatureCollection" else [raw]
                    for f in feats:
                        geom = f.get("geometry")
                        if geom:
                            try:
                                poly = shape(geom)
                                props = dict(f.get("properties") or {})
                                d_name = str(props.get("dist_name") or props.get("DIST_NAME") or props.get("district_name") or "").strip()
                                d_code = normalize_code_segment(props.get("district_c") or props.get("DISTRICT_C") or props.get("district_code") or "", 2)
                                self._district_features.append((poly, d_code, d_name, props))
                            except Exception:
                                pass

            # 2. Index Taluks
            taluk_root = get_taluk_root()
            taluk_files = _walk_gis_files(taluk_root)
            for tf in taluk_files:
                raw = load_geojson_file(tf)
                if raw:
                    feats = raw.get("features", []) if raw.get("type") == "FeatureCollection" else [raw]
                    for f in feats:
                        geom = f.get("geometry")
                        if geom:
                            try:
                                poly = shape(geom)
                                props = dict(f.get("properties") or {})
                                t_name = str(props.get("talukname") or props.get("TALUKNAME") or props.get("taluk_name") or "").strip()
                                d_code = normalize_code_segment(props.get("district_c") or props.get("DISTRICT_C") or props.get("district_code") or "", 2)
                                t_code = normalize_code_segment(props.get("Taluk_code") or props.get("taluk_code") or props.get("TALUK_CODE") or props.get("taluk_c") or "", 2)
                                self._taluk_features.append((poly, d_code, t_code, t_name, props))
                            except Exception:
                                pass

            self._initialized = True
            print(f"[SpatialHierarchyResolver] Initialized {len(self._district_features)} districts and {len(self._taluk_features)} taluks.")
        except Exception as e:
            print("[SpatialHierarchyResolver] Initialization error:", e)

    def _get_or_load_village_bboxes(self, dist_code: str, tal_code: str) -> List[Tuple[List[float], str, str]]:
        key = (dist_code, tal_code)
        if key in self._village_bbox_cache:
            return self._village_bbox_cache[key]
        
        entries = get_village_entries(dist_code, tal_code, "*", "vector")
        cached = []
        for e in entries:
            gp = e.get("geojson_path")
            if gp and gisfs.exists(gp):
                try:
                    raw = load_geojson_file(gp)
                    if raw:
                        feats = raw.get("features", []) if raw.get("type") == "FeatureCollection" else [raw]
                        b = [float('inf'), float('inf'), float('-inf'), float('-inf')]
                        def walk_c(c, b_ref):
                            if isinstance(c[0], (int, float)):
                                b_ref[0] = min(b_ref[0], c[0]); b_ref[2] = max(b_ref[2], c[0])
                                b_ref[1] = min(b_ref[1], c[1]); b_ref[3] = max(b_ref[3], c[1])
                            else:
                                for s in c: walk_c(s, b_ref)
                        for f in feats:
                            g = f.get("geometry")
                            if g and "coordinates" in g:
                                walk_c(g["coordinates"], b)
                        if b[0] != float('inf'):
                            cached.append((b, str(e.get("village_code")), str(e.get("village_name"))))
                except Exception:
                    pass
        self._village_bbox_cache[key] = cached
        return cached

    def resolve(self, lat: float, lng: float, zoom: float) -> Dict[str, Any]:
        self.initialize()
        pt = Point(lng, lat)

        matched_dist_code = ""
        matched_dist_name = ""
        for poly, d_code, d_name, _ in self._district_features:
            try:
                if poly.contains(pt):
                    matched_dist_code = d_code
                    matched_dist_name = d_name
                    break
            except Exception:
                pass

        matched_tal_code = ""
        matched_tal_name = ""
        if matched_dist_code:
            for poly, d_code, t_code, t_name, _ in self._taluk_features:
                try:
                    if (d_code == "*" or d_code == matched_dist_code) and poly.contains(pt):
                        matched_tal_code = t_code
                        matched_tal_name = t_name
                        break
                except Exception:
                    pass

        matched_vil_code = ""
        matched_vil_name = ""
        if matched_dist_code and matched_tal_code and zoom >= 11.0:
            try:
                v_bboxes = self._get_or_load_village_bboxes(matched_dist_code, matched_tal_code)
                for b, vc, vn in v_bboxes:
                    if b[0] <= lng <= b[2] and b[1] <= lat <= b[3]:
                        matched_vil_code = vc
                        matched_vil_name = vn
                        break
            except Exception:
                pass

        target_level = "district"
        if zoom >= 13.0:
            target_level = "parcel"
        elif zoom >= 10.5:
            target_level = "village_boundary"
        elif zoom >= 7.5:
            target_level = "taluk"

        return {
            "success": True,
            "target_level": target_level,
            "district_code": matched_dist_code,
            "district_name": matched_dist_name,
            "taluk_code": matched_tal_code,
            "taluk_name": matched_tal_name,
            "village_code": matched_vil_code,
            "village_name": matched_vil_name,
            "zoom": zoom,
        }

    async def resolve_viewport(
        self,
        min_lng: float,
        min_lat: float,
        max_lng: float,
        max_lat: float,
        zoom: float,
        file_type: str = "fmb"
    ) -> Dict[str, Any]:
        self.initialize()
        center_lng = (min_lng + max_lng) / 2.0
        center_lat = (min_lat + max_lat) / 2.0
        center_res = self.resolve(center_lat, center_lng, zoom)

        matched_dist_code = center_res.get("district_code") or ""
        matched_tal_code = center_res.get("taluk_code") or ""

        # Stage 1 (< 7.5): District Level
        if zoom < 7.5:
            return {
                "success": True,
                "target_level": "district",
                "district_code": matched_dist_code,
                "district_name": center_res.get("district_name"),
                "taluk_code": "",
                "taluk_name": "",
                "village_code": "",
                "village_name": "",
                "visible_villages_count": 0,
                "visible_villages": [],
                "geojson": {"type": "FeatureCollection", "features": []},
                "base_geojson": {"type": "FeatureCollection", "features": []},
                "zoom": zoom,
            }

        # Stage 2 (7.5 to 10.5): Taluk Level
        if zoom < 10.5:
            return {
                "success": True,
                "target_level": "taluk",
                "district_code": matched_dist_code,
                "district_name": center_res.get("district_name"),
                "taluk_code": matched_tal_code,
                "taluk_name": center_res.get("taluk_name"),
                "village_code": "",
                "village_name": "",
                "visible_villages_count": 0,
                "visible_villages": [],
                "geojson": {"type": "FeatureCollection", "features": []},
                "base_geojson": {"type": "FeatureCollection", "features": []},
                "zoom": zoom,
            }

        # Stage 3 (10.5 to 13.0): TN Village Boundary Level (rv_nov29.shp)
        if zoom < 13.0:
            v_boundary_gj = tn_village_boundary_manager.get_villages_in_bbox(min_lng, min_lat, max_lng, max_lat, limit=120)
            return {
                "success": True,
                "target_level": "village_boundary",
                "district_code": matched_dist_code,
                "district_name": center_res.get("district_name"),
                "taluk_code": matched_tal_code,
                "taluk_name": center_res.get("taluk_name"),
                "village_code": "",
                "village_name": "",
                "visible_villages_count": len(v_boundary_gj.get("features", [])),
                "visible_villages": [],
                "geojson": v_boundary_gj,
                "base_geojson": {"type": "FeatureCollection", "features": []},
                "zoom": zoom,
            }

        # Stage 4 (>= 13.0): Deep Parcel & Subdivision Level
        matching_villages = []
        if matched_dist_code and matched_tal_code:
            try:
                v_bboxes = self._get_or_load_village_bboxes(matched_dist_code, matched_tal_code)
                for b, vc, vn in v_bboxes:
                    # Viewport overlap check
                    if (max(min_lng, b[0]) <= min(max_lng, b[2])) and (max(min_lat, b[1]) <= min(max_lat, b[3])):
                        matching_villages.append({"village_code": vc, "village_name": vn, "bbox": b})
                        if len(matching_villages) >= 8:
                            break
            except Exception:
                pass

        combined_features = []
        combined_base_features = []

        for v in matching_villages:
            vc = v["village_code"]
            try:
                v_res = await build_merged_geojson(
                    level="village",
                    code=vc,
                    q_dist=matched_dist_code,
                    q_tal=matched_tal_code,
                    q_vil=vc,
                    file_type=file_type
                )
                if v_res and v_res.get("success"):
                    g = v_res.get("geojson") or {}
                    combined_features.extend(g.get("features") or [])
                    bg = v_res.get("base_geojson") or {}
                    combined_base_features.extend(bg.get("features") or [])
            except Exception:
                pass

        return {
            "success": True,
            "target_level": "parcel",
            "district_code": matched_dist_code,
            "district_name": center_res.get("district_name"),
            "taluk_code": matched_tal_code,
            "taluk_name": center_res.get("taluk_name"),
            "village_code": matching_villages[0]["village_code"] if matching_villages else "",
            "village_name": matching_villages[0]["village_name"] if matching_villages else "",
            "visible_villages_count": len(matching_villages),
            "visible_villages": matching_villages,
            "geojson": {
                "type": "FeatureCollection",
                "features": combined_features
            },
            "base_geojson": {
                "type": "FeatureCollection",
                "features": combined_base_features
            },
            "zoom": zoom,
        }

spatial_resolver = SpatialHierarchyResolver()
