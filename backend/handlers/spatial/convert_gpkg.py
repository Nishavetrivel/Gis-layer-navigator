"""
backend/handlers/spatial/convert_gpkg.py
────────────────────────────────────────
POST /api/spatial/convert-gpkg
Convert uploaded OGC GeoPackage (.gpkg) file into GeoJSON FeatureCollections
with automatic CRS reprojection (e.g. UTM 44N / EPSG:32644 -> WGS84 EPSG:4326)
and full multi-village / multi-taluk / district hierarchy aggregation.
"""

import json
import os
import sys
import tempfile
import sqlite3
from typing import Any, Dict, List, Tuple
from shapely import wkb, ops
from pyproj import Transformer

from core.http import Request, json_response


def _parse_gpkg_geom(raw_blob: bytes, transformer: Transformer = None) -> Any:
    """
    Parse an OGC GeoPackage binary geometry blob into a GeoJSON-compatible mapping.
    Header:
      byte 0-1: 0x47 0x50 ('GP')
      byte 2: version
      byte 3: flags (bit 0 = endianness, bits 1-3 = envelope type)
      byte 4-7: srs_id
      followed by optional envelope, then standard WKB.
    """
    if not raw_blob or len(raw_blob) < 8:
        return None

    if raw_blob[0] != 0x47 or raw_blob[1] != 0x50:
        # Fallback: maybe raw WKB without GPKG header
        try:
            geom = wkb.loads(raw_blob)
            if transformer and not geom.is_empty:
                geom = ops.transform(transformer.transform, geom)
            return geom.__geo_interface__
        except Exception:
            return None

    flags = raw_blob[3]
    envelope_type = (flags >> 1) & 0x07
    envelope_sizes = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}
    header_len = 8 + envelope_sizes.get(envelope_type, 0)

    wkb_data = raw_blob[header_len:]
    try:
        geom = wkb.loads(wkb_data)
        if geom.is_empty:
            return None
        if transformer:
            geom = ops.transform(transformer.transform, geom)
        return geom.__geo_interface__
    except Exception:
        return None


def convert_gpkg_file(gpkg_path: str) -> Dict[str, Any]:
    """Inspect and convert all vector feature layers in a .gpkg file to GeoJSON."""
    conn = sqlite3.connect(gpkg_path)
    cur = conn.cursor()

    # Discover feature tables from gpkg_contents
    cur.execute(
        "SELECT table_name, data_type, srs_id FROM gpkg_contents WHERE data_type = 'features'"
    )
    feature_tables = cur.fetchall()

    if not feature_tables:
        # Fallback: find tables that have a geom column
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'gpkg_%' AND name NOT LIKE 'sqlite_%'")
        feature_tables = [(r[0], 'features', 4326) for r in cur.fetchall()]

    layers: Dict[str, Any] = {}
    default_layer = ""

    for tbl_name, _, srs_id in feature_tables:
        # Get column info
        cur.execute(f"PRAGMA table_info({tbl_name})")
        col_info = cur.fetchall()
        col_names = [c[1] for c in col_info]

        geom_col = "geom"
        if "geom" not in col_names:
            if "geometry" in col_names:
                geom_col = "geometry"
            elif "shape" in col_names:
                geom_col = "shape"
            else:
                # Find blob column
                for c in col_info:
                    if "geom" in c[1].lower() or "shape" in c[1].lower():
                        geom_col = c[1]
                        break

        # Setup CRS Transformer if not 4326
        transformer = None
        srs_num = int(srs_id) if srs_id is not None else 4326
        if srs_num not in (4326, 0, -1):
            try:
                transformer = Transformer.from_crs(f"EPSG:{srs_num}", "EPSG:4326", always_xy=True)
            except Exception:
                # Default to UTM Zone 44N if unknown or within TN UTM coordinate range
                try:
                    transformer = Transformer.from_crs("EPSG:32644", "EPSG:4326", always_xy=True)
                except Exception:
                    transformer = None

        cur.execute(f"SELECT * FROM {tbl_name}")
        rows = cur.fetchall()

        features = []
        geom_types = set()
        min_lng, min_lat = float("inf"), float("inf")
        max_lng, max_lat = float("-inf"), float("-inf")

        villages_map: Dict[str, Dict[str, Any]] = {}
        taluks_set = set()
        districts_map: Dict[str, str] = {}

        total_area_sqm = 0.0

        for r in rows:
            props = {}
            geom_data = None
            for idx, col in enumerate(col_names):
                val = r[idx]
                if col == geom_col:
                    geom_data = val
                else:
                    if isinstance(val, (str, int, float, bool)) or val is None:
                        props[col] = val

            if not geom_data:
                continue

            geo_geom = _parse_gpkg_geom(geom_data, transformer)
            if not geo_geom:
                continue

            g_type = geo_geom.get("type", "")
            if g_type:
                geom_types.add(g_type)

            # Update bounding box
            def update_bounds(coords):
                nonlocal min_lng, min_lat, max_lng, max_lat
                if isinstance(coords, (list, tuple)) and len(coords) >= 2 and isinstance(coords[0], (int, float)):
                    lng, lat = coords[0], coords[1]
                    if -180 <= lng <= 180 and -90 <= lat <= 90:
                        min_lng = min(min_lng, lng)
                        max_lng = max(max_lng, lng)
                        min_lat = min(min_lat, lat)
                        max_lat = max(max_lat, lat)
                elif isinstance(coords, (list, tuple)):
                    for sub in coords:
                        update_bounds(sub)

            update_bounds(geo_geom.get("coordinates", []))

            # Multi-Village aggregation from attributes
            v_name = str(props.get("village") or props.get("village_name") or props.get("vill_name") or "").strip()
            v_code = str(props.get("village_code") or props.get("vill_code") or props.get("code") or "").strip()
            t_name = str(props.get("taluk") or props.get("taluk_name") or props.get("talukname") or "").strip()
            d_name = str(props.get("district") or props.get("district_name") or props.get("dist_name") or "").strip()
            d_code = str(props.get("district_code") or props.get("district_c") or "").strip()

            # If village_code has format like 35_05_136, extract district 35
            if not d_code and v_code and "_" in v_code:
                parts = v_code.split("_")
                if len(parts) >= 2:
                    d_code = parts[0].zfill(2)

            if d_code and not d_name:
                # Standard district code 35 = Chengalpattu
                if d_code in ("35", "35_"):
                    d_name = "Chengalpattu"

            if t_name:
                taluks_set.add(t_name)
            if d_name:
                districts_map[d_name] = d_code

            # Accumulate plot area
            area_val = props.get("plot_area_sqm") or props.get("area_sqm")
            if isinstance(area_val, (int, float)):
                total_area_sqm += float(area_val)

            if v_name or v_code:
                v_key = v_code or v_name
                if v_key not in villages_map:
                    villages_map[v_key] = {
                        "name": v_name or f"Village {v_code}",
                        "code": v_code,
                        "taluk": t_name,
                        "count": 0,
                    }
                villages_map[v_key]["count"] += 1

            features.append({
                "type": "Feature",
                "properties": props,
                "geometry": geo_geom,
            })

        if features and not default_layer:
            default_layer = tbl_name

        # Calculate area in acres
        area_acres = round(total_area_sqm * 0.000247105, 2) if total_area_sqm > 0 else None

        # Sorted villages list by plot count descending
        sorted_villages = sorted(villages_map.values(), key=lambda v: v["count"], reverse=True)

        layers[tbl_name] = {
            "tableName": tbl_name,
            "featureCount": len(features),
            "geomTypes": sorted(list(geom_types)),
            "areaAcres": area_acres,
            "bbox": [
                round(min_lng, 6) if min_lng != float("inf") else 76.15,
                round(min_lat, 6) if min_lat != float("inf") else 8.05,
                round(max_lng, 6) if max_lng != float("-inf") else 80.35,
                round(max_lat, 6) if max_lat != float("-inf") else 13.55,
            ],
            "districts": [{"name": k, "code": v} for k, v in districts_map.items()],
            "taluks": sorted(list(taluks_set)),
            "villages": sorted_villages,
            "totalVillages": len(sorted_villages),
            "geojson": {
                "type": "FeatureCollection",
                "features": features,
            },
        }

    conn.close()

    return {
        "success": True,
        "layers": layers,
        "defaultLayer": default_layer,
        "layerNames": list(layers.keys()),
    }


def handle(request: Request) -> Dict[str, Any]:
    """Handle POST /api/spatial/convert-gpkg."""
    gpkg_file_path = None

    # 1. Check if a file path was passed in JSON body
    try:
        data = request.json()
        gpkg_file_path = data.get("file_path") or data.get("path")
    except Exception:
        pass

    # 2. Check query parameter
    if not gpkg_file_path:
        gpkg_file_path = request.q("file_path", "path")

    # 3. If raw binary payload uploaded
    if not gpkg_file_path:
        raw_bytes = request.raw_body()
        if not raw_bytes or len(raw_bytes) < 100:
            return json_response({"success": False, "error": "No GeoPackage (.gpkg) file data provided."}, status_code=400)

        # Write to temporary file
        with tempfile.NamedTemporaryFile(suffix=".gpkg", delete=False) as tmp:
            tmp.write(raw_bytes)
            gpkg_file_path = tmp.name

    try:
        if not os.path.exists(gpkg_file_path):
            return json_response({"success": False, "error": f"File not found: {gpkg_file_path}"}, status_code=404)

        result = convert_gpkg_file(gpkg_file_path)
        return json_response(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return json_response({"success": False, "error": str(e)}, status_code=500)
    finally:
        # Clean up temp file if created
        if gpkg_file_path and "tmp" in gpkg_file_path and os.path.exists(gpkg_file_path):
            try:
                os.remove(gpkg_file_path)
            except Exception:
                pass
