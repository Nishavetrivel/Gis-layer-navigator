"""
backend/services/geometry_service.py
───────────────────────────────────
Geometry parsing, DBF attribute extraction, fast bounding box calculations,
and raw GeoJSON / SHP file caching.
"""

import json
import os
import struct
from typing import Optional, Any, Dict, List, Tuple

from core import gisfs

#: Parsed layers keyed by URI. Bounded, because a Lambda holding several
#: hundred-megabyte FeatureCollections in a dict will exhaust its memory.
raw_geojson_file_cache: Dict[str, Any] = {}

_CACHE_MAX_ENTRIES = int(os.environ.get("GIS_LAYER_CACHE_ENTRIES") or 12)
_CACHE_MAX_FEATURES = int(os.environ.get("GIS_LAYER_CACHE_FEATURES") or 400000)


def _cache_put(key: str, data: Dict[str, Any]) -> None:
    """Insert into the layer cache, evicting oldest entries past the budget."""
    feature_count = len((data or {}).get("features") or [])
    if feature_count > _CACHE_MAX_FEATURES:
        return
    while len(raw_geojson_file_cache) >= _CACHE_MAX_ENTRIES:
        raw_geojson_file_cache.pop(next(iter(raw_geojson_file_cache)), None)
    raw_geojson_file_cache[key] = data


def find_dbf_path(shp_path: str) -> Optional[str]:
    """Finds the accompanying .dbf for an ESRI .shp."""
    if not shp_path:
        return None
    base, _ = gisfs.splitext(shp_path)
    for ext in [".dbf", ".DBF", ".Dbf", ".dBf"]:
        candidate = base + ext
        if gisfs.exists(candidate):
            return candidate
    parent = gisfs.dirname(shp_path) or "."
    stem = gisfs.basename(base).lower()
    try:
        for f in gisfs.listdir(parent):
            fn, fe = os.path.splitext(f)
            if fn.lower() == stem and fe.lower() == ".dbf":
                return gisfs.join(parent, f)
    except Exception:
        pass
    return None

def parse_dbf_file(dbf_path: str) -> List[Dict[str, Any]]:
    """Parse a dBase III/IV .dbf attribute table using only the standard library."""
    if not dbf_path or not gisfs.exists(dbf_path):
        return []
    records = []
    try:
        with gisfs.open_binary(dbf_path) as f:
            header = f.read(32)
            if len(header) < 32:
                return []
            num_records, header_len, record_len = struct.unpack("<IHH", header[4:12])
            
            # Read field descriptors
            fields = []
            while True:
                field_data = f.read(32)
                if len(field_data) < 32 or field_data[0] == 0x0D:
                    break
                name = field_data[:11].replace(b"\x00", b"").decode("latin-1", errors="ignore").strip()
                ftype = chr(field_data[11])
                flen = field_data[16]
                fields.append((name, ftype, flen))
            
            f.seek(header_len)
            for _ in range(num_records):
                record_bytes = f.read(record_len)
                if len(record_bytes) < record_len:
                    break
                if record_bytes[0:1] == b"*":  # deleted record
                    continue
                rec = {}
                offset = 1
                for name, ftype, flen in fields:
                    raw_val = record_bytes[offset:offset + flen].decode("latin-1", errors="ignore").strip()
                    offset += flen
                    if ftype == "N":
                        try:
                            val = int(raw_val) if "." not in raw_val else float(raw_val)
                        except ValueError:
                            val = raw_val
                    else:
                        val = raw_val
                    rec[name] = val
                records.append(rec)
    except Exception as e:
        print(f"[geometry_service] Error reading DBF {dbf_path}:", e)
    return records

def parse_shp_file(shp_path: str) -> Optional[Dict[str, Any]]:
    """Native binary ESRI Shapefile parser for Polygon, PolyLine, Point features with DBF properties."""
    if not shp_path or not gisfs.exists(shp_path):
        return None
    try:
        try:
            import shapefile

            # pyshp needs a real seekable file plus its .shx/.dbf sidecars, so
            # remote shapefiles are mirrored into /tmp first (cached per container).
            local_shp = gisfs.materialize_shapefile(shp_path)
            if local_shp:
                sf = shapefile.Reader(local_shp)
                return sf.__geo_interface__
        except Exception:
            pass

        dbf_path = find_dbf_path(shp_path)
        dbf_records = parse_dbf_file(dbf_path) if dbf_path else []

        with gisfs.open_binary(shp_path) as f:
            header = f.read(100)
            if len(header) < 100:
                return None
            file_code, = struct.unpack(">i", header[0:4])
            if file_code != 9994:
                return None

            features = []
            rec_idx = 0
            while True:
                rec_head = f.read(8)
                if len(rec_head) < 8:
                    break
                rec_num, content_len = struct.unpack(">2i", rec_head)
                rec_bytes = f.read(content_len * 2)
                if len(rec_bytes) < 4:
                    break
                shape_type, = struct.unpack("<i", rec_bytes[0:4])

                props = dbf_records[rec_idx] if rec_idx < len(dbf_records) else {}
                rec_idx += 1

                if shape_type in (1, 11, 21):
                    # Point
                    if len(rec_bytes) >= 20:
                        px, py = struct.unpack("<2d", rec_bytes[4:20])
                        features.append({
                            "type": "Feature",
                            "properties": props,
                            "geometry": {
                                "type": "Point",
                                "coordinates": [px, py]
                            }
                        })
                elif shape_type in (3, 5, 13, 15):
                    # PolyLine or Polygon
                    if len(rec_bytes) < 44:
                        continue
                    min_x, min_y, max_x, max_y, num_parts, num_points = struct.unpack("<4d2i", rec_bytes[4:44])
                    offset = 44
                    parts = struct.unpack(f"<{num_parts}i", rec_bytes[offset:offset + num_parts * 4])
                    offset += num_parts * 4
                    points = struct.unpack(f"<{num_points * 2}d", rec_bytes[offset:offset + num_points * 16])

                    rings = []
                    for i in range(num_parts):
                        start_idx = parts[i]
                        end_idx = parts[i + 1] if i + 1 < num_parts else num_points
                        ring = [[points[j * 2], points[j * 2 + 1]] for j in range(start_idx, end_idx)]
                        if ring:
                            rings.append(ring)

                    if shape_type in (5, 15):
                        geom_type = "Polygon" if len(rings) == 1 else "MultiPolygon"
                        coords = rings if geom_type == "Polygon" else [[r] for r in rings]
                    else:
                        geom_type = "LineString" if len(rings) == 1 else "MultiLineString"
                        coords = rings[0] if geom_type == "LineString" else rings

                    features.append({
                        "type": "Feature",
                        "properties": props,
                        "geometry": {
                            "type": geom_type,
                            "coordinates": coords
                        }
                    })
            return {
                "type": "FeatureCollection",
                "features": features
            }
    except Exception as err:
        print(f"[geometry_service] Error reading SHP {shp_path}:", err)
        return None

def load_geojson_file(file_path: str) -> Optional[Dict[str, Any]]:
    """Load a GeoJSON or Shapefile into a FeatureCollection dict, with caching."""
    if not file_path or not gisfs.exists(file_path):
        return None
    cache_key = gisfs.normalize(file_path)
    if cache_key in raw_geojson_file_cache:
        return raw_geojson_file_cache[cache_key]
    try:
        if file_path.lower().endswith(".shp"):
            data = parse_shp_file(file_path)
        else:
            data = json.loads(gisfs.read_bytes(file_path).decode("utf-8", errors="replace"))
        if data:
            _cache_put(cache_key, data)
        return data
    except Exception as e:
        print("[geometry_service] Error reading layer file %s: %s" % (file_path, e))
        return None

def compute_geojson_bounds_and_features(features: List[Dict[str, Any]]) -> Tuple[List[float], float]:
    """Calculate bounding box [min_x, min_y, max_x, max_y] and approximate area quickly."""
    min_x, min_y = float("inf"), float("inf")
    max_x, max_y = float("-inf"), float("-inf")
    total_area = 0.0

    def extract_coords(coords):
        nonlocal min_x, min_y, max_x, max_y
        if not coords:
            return
        if isinstance(coords, (list, tuple)):
            if len(coords) >= 2 and isinstance(coords[0], (int, float)) and isinstance(coords[1], (int, float)):
                x, y = float(coords[0]), float(coords[1])
                if x < min_x: min_x = x
                if y < min_y: min_y = y
                if x > max_x: max_x = x
                if y > max_y: max_y = y
            else:
                for c in coords:
                    extract_coords(c)

    for feat in features:
        geom = feat.get("geometry")
        if not geom:
            continue
        extract_coords(geom.get("coordinates"))

    if min_x == float("inf"):
        return [76.23298, 8.07761, 80.34882, 13.56284], 0.0

    return [min_x, min_y, max_x, max_y], total_area

def _fast_bbox_check(geom: Dict[str, Any], minx: float, miny: float, maxx: float, maxy: float) -> bool:
    """Ultra-fast bounding box reject test before invoking Shapely geometry engine."""
    if not geom or minx is None:
        return True
    gtype = geom.get("type", "")
    coords = geom.get("coordinates", [])
    if not coords:
        return False
    
    if gtype == "Point":
        if len(coords) >= 2:
            return minx <= coords[0] <= maxx and miny <= coords[1] <= maxy
        return False
    elif gtype == "LineString":
        xs = [c[0] for c in coords if isinstance(c, (list, tuple)) and len(c) >= 2]
        ys = [c[1] for c in coords if isinstance(c, (list, tuple)) and len(c) >= 2]
        if not xs or not ys:
            return False
        return not (max(xs) < minx or min(xs) > maxx or max(ys) < miny or min(ys) > maxy)
    elif gtype == "MultiLineString":
        all_xs = []
        all_ys = []
        for line in coords:
            if isinstance(line, (list, tuple)):
                for pt in line:
                    if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                        all_xs.append(pt[0])
                        all_ys.append(pt[1])
        if not all_xs or not all_ys:
            return False
        return not (max(all_xs) < minx or min(all_xs) > maxx or max(all_ys) < miny or min(all_ys) > maxy)
    elif gtype == "Polygon":
        if not coords or not coords[0]:
            return False
        xs = [c[0] for c in coords[0] if isinstance(c, (list, tuple)) and len(c) >= 2]
        ys = [c[1] for c in coords[0] if isinstance(c, (list, tuple)) and len(c) >= 2]
        if not xs or not ys:
            return False
        return not (max(xs) < minx or min(xs) > maxx or max(ys) < miny or min(ys) > maxy)
    elif gtype == "MultiPolygon":
        all_xs = []
        all_ys = []
        for poly in coords:
            if isinstance(poly, (list, tuple)) and len(poly) > 0:
                for ring in poly:
                    if isinstance(ring, (list, tuple)):
                        for pt in ring:
                            if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                                all_xs.append(pt[0])
                                all_ys.append(pt[1])
        if not all_xs or not all_ys:
            return False
        return not (max(all_xs) < minx or min(all_xs) > maxx or max(all_ys) < miny or min(all_ys) > maxy)
    return True
