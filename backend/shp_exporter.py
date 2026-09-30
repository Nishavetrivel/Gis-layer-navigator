import io
import re
import shapefile
from typing import List, Dict, Any

WGS84_PRJ = (
    'GEOGCS["GCS_WGS_1984",'
    'DATUM["D_WGS_1984",'
    'SPHEROID["WGS_1984",6378137.0,298.257223563]],'
    'PRIMEM["Greenwich",0.0],'
    'UNIT["Degree",0.0174532925199433]]'
)

def sanitize_field_name(name: str, existing_names: List[str]) -> str:
    """Sanitize field name for ESRI DBF (max 10 chars, ASCII alphanumeric + underscore)."""
    clean = re.sub(r'[^a-zA-Z0-9_]', '_', str(name)).strip('_')
    if not clean or clean[0].isdigit():
        clean = f"f_{clean}"
    clean = clean[:10].lower()
    
    # Ensure uniqueness
    base = clean
    idx = 1
    while clean in existing_names:
        suffix = f"_{idx}"
        clean = f"{base[:10 - len(suffix)]}{suffix}"
        idx += 1
    return clean

def export_features_to_shp_in_zip(features: List[Dict[str, Any]], layer_name: str, geom_type: str, zf):
    """
    Export GeoJSON features into standard ESRI Shapefile (.shp, .shx, .dbf, .prj)
    and write directly into an open ZipFile.
    Fully compatible with QGIS, ArcGIS, GDAL/OGR.
    """
    if not features:
        return

    # Determine shapefile geometry type
    geom_type_lower = str(geom_type).lower()
    if geom_type_lower in ('polygon', 'multipolygon'):
        stype = shapefile.POLYGON
    elif geom_type_lower in ('line', 'linestring', 'multilinestring', 'polyline'):
        stype = shapefile.POLYLINE
    else:
        stype = shapefile.POINT

    # 1. Discover and sanitize attribute fields across first 50 features
    field_map = {}  # orig_key -> dbf_field_name
    dbf_field_names = []
    
    for f in features[:50]:
        props = f.get('properties') or {}
        for k in props.keys():
            if k not in field_map:
                sanitized = sanitize_field_name(k, dbf_field_names)
                field_map[k] = sanitized
                dbf_field_names.append(sanitized)

    if not dbf_field_names:
        dbf_field_names = ['id', 'name']
        field_map = {'id': 'id', 'name': 'name'}

    shp_buf = io.BytesIO()
    shx_buf = io.BytesIO()
    dbf_buf = io.BytesIO()

    with shapefile.Writer(shp=shp_buf, shx=shx_buf, dbf=dbf_buf, shapeType=stype, encoding='utf-8') as w:
        w.autoBalance = 1
        
        # Add fields (Text type 'C', size 150)
        for fname in dbf_field_names:
            w.field(fname, 'C', size=150)

        for feat in features:
            geom = feat.get('geometry')
            if not geom:
                continue
            
            g_type = geom.get('type')
            coords = geom.get('coordinates', [])
            props = feat.get('properties') or {}

            # Prepare DBF record values matching sanitized field order
            rec_vals = {}
            for orig_k, dbf_k in field_map.items():
                v = props.get(orig_k, '')
                if v is None:
                    str_val = ''
                elif isinstance(v, (dict, list)):
                    str_val = str(v).strip()[:140]
                else:
                    str_val = str(v).strip()[:140]
                rec_vals[dbf_k] = str_val

            # Fill in any missing fields with empty string
            for dbf_k in dbf_field_names:
                if dbf_k not in rec_vals:
                    rec_vals[dbf_k] = ''

            try:
                if stype == shapefile.POINT:
                    if g_type == 'Point' and len(coords) >= 2:
                        w.point(float(coords[0]), float(coords[1]))
                        w.record(**rec_vals)
                    elif g_type == 'MultiPoint' and len(coords) > 0:
                        for pt in coords:
                            if len(pt) >= 2:
                                w.point(float(pt[0]), float(pt[1]))
                                w.record(**rec_vals)

                elif stype == shapefile.POLYLINE:
                    if g_type == 'LineString' and len(coords) >= 2:
                        w.line([coords])
                        w.record(**rec_vals)
                    elif g_type == 'MultiLineString' and len(coords) > 0:
                        w.line(coords)
                        w.record(**rec_vals)

                elif stype == shapefile.POLYGON:
                    if g_type == 'Polygon' and len(coords) > 0:
                        w.poly(coords)
                        w.record(**rec_vals)
                    elif g_type == 'MultiPolygon' and len(coords) > 0:
                        # Collect all rings from all polygon parts
                        all_rings = []
                        for poly in coords:
                            for ring in poly:
                                if len(ring) >= 3:
                                    all_rings.append(ring)
                        if all_rings:
                            w.poly(all_rings)
                            w.record(**rec_vals)
                    elif g_type in ('LineString', 'MultiLineString'):
                        rings = [coords] if g_type == 'LineString' else coords
                        poly_rings = []
                        for ring in rings:
                            if len(ring) >= 3:
                                r = list(ring)
                                if r[0] != r[-1]:
                                    r.append(r[0])
                                poly_rings.append(r)
                        if poly_rings:
                            w.poly(poly_rings)
                            w.record(**rec_vals)
            except Exception:
                pass

    clean_base = re.sub(r'[^a-zA-Z0-9_-]', '_', layer_name)
    zf.writestr(f"{clean_base}.shp", shp_buf.getvalue())
    zf.writestr(f"{clean_base}.shx", shx_buf.getvalue())
    zf.writestr(f"{clean_base}.dbf", dbf_buf.getvalue())
    zf.writestr(f"{clean_base}.prj", WGS84_PRJ)
    zf.writestr(f"{clean_base}.cpg", "UTF-8")
