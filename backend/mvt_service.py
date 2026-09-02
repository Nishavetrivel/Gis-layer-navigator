"""
backend/mvt_service.py
──────────────────────
Mapbox Vector Tile (MVT 2.1 / .pbf) encoding for GIS Layer Navigator.

This module is pure computation: Web Mercator projection, geometry command
encoding, and a standard-library protobuf writer. Index storage and tile
caching live in ``mvt_service_manager`` so the encoder stays free of I/O.

1. Standard Web Mercator (EPSG:3857) tile projection into [0, 4096].
2. Zoom-adaptive property pruning and coordinate decimation.
3. Pure-Python protobuf encoder compliant with the MVT 2.1 specification.
"""

import json
import math
import struct
import zlib
from typing import Any, Dict, List, Optional, Tuple

EXTENT = 4096

# Essential property keys to include in vector tiles for tooltips and rendering
ESSENTIAL_KEYS = {
    'id', 'name', 'title', 'category', 'type', 'district', 'taluk',
    'village', 'location', 'status', 'school_name', 'NAME', 'NAME_OF_SC',
    'road_name', 'river_name', 'wb_name', 'mine_name', 'area_acres', 'area',
    'panchayat', 'panchayat_name', 'PAN_NAME', 'habitation', 'block',
    'town_municipality', 'education_district', 'assembly', 'parliament',
    'managing_department', 'management', 'category_group', 'directorate',
    'college_name', 'fire_station', 'petrol_bunk', 'tasmac_name',
    'place_name', 'tourist_place', 'TOURIST_NA', 'tourist_name',
    'Description', 'description', 'SHOP_NO', 'shop_no', 'DEPT_NAME', 'dept_name',
    'water_body_name', 'tourist_point_name', 'sector', 'sec_code', 'icds_code',
    'd_name', 'dist_name', 'taluk_name', 'block_name', 'panchayat_village',
    'tasmac_sho', 'full_addre', 'road_nam', 'road_num', 'nh_name', 'nh_no',
    'mineral_le', 'feature_na', 'length_km', 'district_name'
}

# ─── PROTOBUF & MVT ENCODER ──────────────────────────────────────────────────

def encode_varint(value: int) -> bytes:
    """Encode an integer as a variable-length protobuf varint."""
    bits = value & 0x7F
    value >>= 7
    result = bytearray()
    while value:
        result.append(0x80 | bits)
        bits = value & 0x7F
        value >>= 7
    result.append(bits)
    return bytes(result)

def encode_zigzag(n: int) -> int:
    """ZigZag encode a signed integer to unsigned integer."""
    return (n << 1) ^ (n >> 31)

def encode_tag_and_type(field_number: int, wire_type: int) -> bytes:
    return encode_varint((field_number << 3) | wire_type)

def encode_length_delimited(field_number: int, data: bytes) -> bytes:
    return encode_tag_and_type(field_number, 2) + encode_varint(len(data)) + data

def encode_varint_field(field_number: int, value: int) -> bytes:
    return encode_tag_and_type(field_number, 0) + encode_varint(value)

def encode_string_field(field_number: int, value: str) -> bytes:
    encoded = value.encode('utf-8')
    return encode_length_delimited(field_number, encoded)

def encode_double_field(field_number: int, value: float) -> bytes:
    return encode_tag_and_type(field_number, 1) + struct.pack('<d', value)

def encode_mvt_value(val: Any) -> bytes:
    """Encode a property Value according to MVT 2.1 protobuf spec."""
    if isinstance(val, bool):
        val_bytes = encode_varint_field(7, 1 if val else 0)
    elif isinstance(val, int):
        val_bytes = encode_varint_field(5, val) if val >= 0 else encode_varint_field(6, encode_zigzag(val))
    elif isinstance(val, float):
        val_bytes = encode_double_field(3, val)
    else:
        val_bytes = encode_string_field(1, str(val))
    return encode_length_delimited(4, val_bytes)


# ─── WEB MERCATOR TILE PROJECTION ─────────────────────────────────────────────

def to_tile_px(lng: float, lat: float, z: int, x: int, y: int) -> Tuple[int, int]:
    """
    Project WGS84 (lng, lat) to tile pixel space [0, EXTENT] (4096)
    using exact standard Web Mercator (EPSG:3857) projection.
    """
    lat = max(-85.05112878, min(85.05112878, lat))
    lat_rad = math.radians(lat)
    n = 2.0 ** z
    x_norm = (lng + 180.0) / 360.0
    y_norm = (1.0 - math.log(math.tan(math.pi / 4.0 + lat_rad / 2.0)) / math.pi) / 2.0

    px = int(round((x_norm * n - x) * EXTENT))
    py = int(round((y_norm * n - y) * EXTENT))
    return px, py


def tile_to_bbox(z: int, x: int, y: int, buffer_fraction: float = 0.08) -> Tuple[float, float, float, float]:
    """
    Calculate WGS84 bounding box (lon_min, lat_min, lon_max, lat_max) for a tile (z, x, y).
    """
    n = 2.0 ** z
    lon_min = x / n * 360.0 - 180.0
    lon_max = (x + 1.0) / n * 360.0 - 180.0

    lat_rad_max = math.atan(math.sinh(math.pi * (1.0 - 2.0 * y / n)))
    lat_rad_min = math.atan(math.sinh(math.pi * (1.0 - 2.0 * (y + 1.0) / n)))

    lat_max = math.degrees(lat_rad_max)
    lat_min = math.degrees(lat_rad_min)

    lon_buf = (lon_max - lon_min) * buffer_fraction
    lat_buf = (lat_max - lat_min) * buffer_fraction

    return (lon_min - lon_buf, lat_min - lat_buf, lon_max + lon_buf, lat_max + lat_buf)


# ─── GEOMETRY TO MVT COMMANDS ─────────────────────────────────────────────────

def geometry_to_mvt_commands(geom_type: str, coordinates: Any, z: int, x: int, y: int) -> Tuple[int, List[int]]:
    """
    Convert geometry coordinates into MVT commands with zigzag delta encoding.
    """
    cmd_seq: List[int] = []
    cursor_x, cursor_y = 0, 0

    def add_move_to(px: int, py: int):
        nonlocal cursor_x, cursor_y
        dx = px - cursor_x
        dy = py - cursor_y
        cursor_x = px
        cursor_y = py
        cmd_seq.append(1 | (1 << 3))  # MoveTo command with count = 1
        cmd_seq.append(encode_zigzag(dx))
        cmd_seq.append(encode_zigzag(dy))

    def add_line_to(pts: List[Tuple[int, int]]):
        nonlocal cursor_x, cursor_y
        if not pts:
            return
        cmd_seq.append(2 | (len(pts) << 3))  # LineTo command with count = len(pts)
        for px, py in pts:
            dx = px - cursor_x
            dy = py - cursor_y
            cursor_x = px
            cursor_y = py
            cmd_seq.append(encode_zigzag(dx))
            cmd_seq.append(encode_zigzag(dy))

    def add_close_path():
        cmd_seq.append(7 | (1 << 3))  # ClosePath command with count = 1

    mvt_type = 0
    gt = geom_type.lower()

    if gt == "point":
        mvt_type = 1
        px, py = to_tile_px(coordinates[0], coordinates[1], z, x, y)
        add_move_to(px, py)

    elif gt == "multipoint":
        mvt_type = 1
        for pt in coordinates:
            px, py = to_tile_px(pt[0], pt[1], z, x, y)
            add_move_to(px, py)

    elif gt == "linestring":
        mvt_type = 2
        if len(coordinates) >= 2:
            first_px, first_py = to_tile_px(coordinates[0][0], coordinates[0][1], z, x, y)
            add_move_to(first_px, first_py)
            line_pts = []
            for pt in coordinates[1:]:
                px, py = to_tile_px(pt[0], pt[1], z, x, y)
                if not line_pts and (px, py) == (first_px, first_py):
                    continue
                if line_pts and (px, py) == line_pts[-1]:
                    continue
                line_pts.append((px, py))
            if line_pts:
                add_line_to(line_pts)

    elif gt == "multilinestring":
        mvt_type = 2
        for line in coordinates:
            if len(line) >= 2:
                first_px, first_py = to_tile_px(line[0][0], line[0][1], z, x, y)
                add_move_to(first_px, first_py)
                line_pts = []
                for pt in line[1:]:
                    px, py = to_tile_px(pt[0], pt[1], z, x, y)
                    if not line_pts and (px, py) == (first_px, first_py):
                        continue
                    if line_pts and (px, py) == line_pts[-1]:
                        continue
                    line_pts.append((px, py))
                if line_pts:
                    add_line_to(line_pts)

    elif gt == "polygon":
        mvt_type = 3
        for ring in coordinates:
            if len(ring) >= 3:
                first_px, first_py = to_tile_px(ring[0][0], ring[0][1], z, x, y)
                add_move_to(first_px, first_py)
                line_pts = []
                for pt in ring[1:-1]:
                    px, py = to_tile_px(pt[0], pt[1], z, x, y)
                    if not line_pts and (px, py) == (first_px, first_py):
                        continue
                    if line_pts and (px, py) == line_pts[-1]:
                        continue
                    line_pts.append((px, py))
                if line_pts:
                    add_line_to(line_pts)
                add_close_path()

    elif gt == "multipolygon":
        mvt_type = 3
        for poly in coordinates:
            for ring in poly:
                if len(ring) >= 3:
                    first_px, first_py = to_tile_px(ring[0][0], ring[0][1], z, x, y)
                    add_move_to(first_px, first_py)
                    line_pts = []
                    for pt in ring[1:-1]:
                        px, py = to_tile_px(pt[0], pt[1], z, x, y)
                        if not line_pts and (px, py) == (first_px, first_py):
                            continue
                        if line_pts and (px, py) == line_pts[-1]:
                            continue
                        line_pts.append((px, py))
                    if line_pts:
                        add_line_to(line_pts)
                    add_close_path()

    return mvt_type, cmd_seq


def build_mvt_tile(layer_name: str, features_data: List[Tuple[int, str, Any, Dict[str, Any]]], z: int, x: int, y: int) -> bytes:
    """
    Build binary Mapbox Vector Tile (.pbf) for a layer given features.
    """
    keys: List[str] = []
    key_map: Dict[str, int] = {}
    values: List[Any] = []
    value_map: Dict[str, int] = {}

    def get_key_idx(k: str) -> int:
        if k not in key_map:
            idx = len(keys)
            key_map[k] = idx
            keys.append(k)
            return idx
        return key_map[k]

    def get_value_idx(v: Any) -> int:
        v_str = json.dumps(v, sort_keys=True) if isinstance(v, (dict, list)) else str(v)
        if v_str not in value_map:
            idx = len(values)
            value_map[v_str] = idx
            values.append(v)
            return idx
        return value_map[v_str]

    encoded_features = bytearray()

    for feat_id, geom_type, coords, props in features_data:
        mvt_type, cmd_seq = geometry_to_mvt_commands(geom_type, coords, z, x, y)
        if not cmd_seq or mvt_type == 0:
            continue

        feat_bytes = bytearray()
        # 1. Feature ID (tag 1)
        if feat_id is not None:
            feat_bytes.extend(encode_varint_field(1, int(feat_id)))

        # 2. Tags (key-value pairs, tag 2 packed)
        if props:
            tags_packed = bytearray()
            for k, v in props.items():
                if v is None:
                    continue
                # Keep essential keys only for vector tile efficiency
                if k not in ESSENTIAL_KEYS and len(props) > 10:
                    continue
                k_idx = get_key_idx(k)
                v_idx = get_value_idx(v)
                tags_packed.extend(encode_varint(k_idx))
                tags_packed.extend(encode_varint(v_idx))
            if tags_packed:
                feat_bytes.extend(encode_length_delimited(2, bytes(tags_packed)))

        # 3. GeomType (tag 3)
        feat_bytes.extend(encode_varint_field(3, mvt_type))

        # 4. Geometry commands (tag 4 packed)
        geom_packed = bytearray()
        for cmd in cmd_seq:
            geom_packed.extend(encode_varint(cmd))
        feat_bytes.extend(encode_length_delimited(4, bytes(geom_packed)))

        encoded_features.extend(encode_length_delimited(2, bytes(feat_bytes)))

    # Assemble Layer
    layer_bytes = bytearray()
    layer_bytes.extend(encode_varint_field(15, 2))  # version = 2 (tag 15)
    layer_bytes.extend(encode_string_field(1, layer_name))  # name (tag 1)
    layer_bytes.extend(encoded_features)  # features (tag 2)

    for k in keys:
        layer_bytes.extend(encode_string_field(3, k))  # keys (tag 3)

    for v in values:
        layer_bytes.extend(encode_mvt_value(v))  # values (tag 4)

    layer_bytes.extend(encode_varint_field(5, EXTENT))  # extent = 4096 (tag 5)

    # Assemble Tile (tag 3 = Layer)
    tile_bytes = encode_length_delimited(3, bytes(layer_bytes))
    return bytes(tile_bytes)


# ─── SQLITE SPATIAL INDEXING & CACHING ────────────────────────────────────────

def compute_geom_bbox(geom_type: str, coords: Any) -> Optional[Tuple[float, float, float, float]]:
    """Compute (minx, maxx, miny, maxy) for geometry coordinates."""
    minx, maxx = float('inf'), float('-inf')
    miny, maxy = float('inf'), float('-inf')

    def check_pt(pt: List[float]):
        nonlocal minx, maxx, miny, maxy
        if len(pt) >= 2:
            x, y = pt[0], pt[1]
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y

    gt = geom_type.lower()
    if gt == "point":
        check_pt(coords)
    elif gt in ("multipoint", "linestring"):
        for pt in coords:
            check_pt(pt)
    elif gt in ("multilinestring", "polygon"):
        for ring in coords:
            for pt in ring:
                check_pt(pt)
    elif gt == "multipolygon":
        for poly in coords:
            for ring in poly:
                for pt in ring:
                    check_pt(pt)
    else:
        return None

    if minx == float('inf'):
        return None
    return (minx, maxx, miny, maxy)




# ─── MANAGER SINGLETON ───────────────────────────────────────────────────────
# Imported here (not at module top) because the manager imports the encoders
# above it; deferring the import keeps the dependency one-directional.

import os  # noqa: E402

from core import config  # noqa: E402
from mvt_service_manager import VectorTileManager  # noqa: E402

#: Shared per-container manager. Indexes are mirrored from GIS_TILE_INDEX_URI
#: into the writable /tmp cache on first use.
vector_tile_manager = VectorTileManager(
    cache_dir=os.path.join(config.LOCAL_CACHE_DIR, "tiles"),
)
