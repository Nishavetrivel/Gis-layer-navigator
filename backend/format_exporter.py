"""
backend/format_exporter.py
───────────────────────────
Exporter utility in Python for KML, KMZ, DXF (AutoCAD), GeoJSON, and Shapefile ZIP.
"""

import io
import json
import os
import struct
import tempfile
import zipfile
from xml.sax.saxutils import escape as xml_escape
from typing import Dict, Any, List, Optional, Tuple

from core import gisfs
from zip_bundler import build_human_readable_prefix


# ─── KML / KMZ (GeoPandas + simplekml — per-file native conversion) ──────────

def geojson_file_to_kml_bytes(geojson_path: str, doc_name: str = "GIS Export", file_type: str = "vector") -> bytes:
    """
    Convert a native on-disk .geojson file → KML bytes using simplekml.
    Each feature becomes a Placemark with all properties preserved as ExtendedData.
    """
    try:
        import simplekml
    except ImportError:
        gj = json.loads(gisfs.read_bytes(geojson_path).decode("utf-8", errors="replace"))
        return geojson_to_kml(gj, doc_name, file_type).encode("utf-8")

    # Colour scheme matching existing KML style
    if file_type == "fmb":
        line_color = simplekml.Color.changealphaint(255, simplekml.Color.green)
        poly_color = simplekml.Color.changealphaint(64,  simplekml.Color.green)
    else:
        line_color = simplekml.Color.changealphaint(255, "ffc78402")
        poly_color = simplekml.Color.changealphaint(64,  "ffc78402")

    kml = simplekml.Kml(name=doc_name)
    style = simplekml.Style()
    style.linestyle.color = line_color
    style.linestyle.width = 2.5
    style.polystyle.color = poly_color
    style.polystyle.fill = 1
    style.polystyle.outline = 1

    try:
        data = json.loads(gisfs.read_bytes(geojson_path).decode("utf-8", errors="replace"))
    except Exception:
        return b""

    features = data.get("features", []) if data.get("type") == "FeatureCollection" else [data]

    for feat in features:
        geom = feat.get("geometry")
        if not geom:
            continue
        props = feat.get("properties") or {}
        label = (
            str(props.get("survey_no", ""))
            or str(props.get("name", ""))
            or str(props.get("village_name", ""))
            or "Feature"
        )
        gtype = geom.get("type", "")
        coords = geom.get("coordinates", [])

        def _add_poly_coords(kml_container, poly_coords, lbl, pr):
            if not poly_coords:
                return
            ext = [(pt[0], pt[1]) for pt in poly_coords[0] if len(pt) >= 2]
            inte = [[(pt[0], pt[1]) for pt in ring if len(pt) >= 2] for ring in poly_coords[1:]]
            pol = kml_container.newpolygon(name=lbl)
            pol.outerboundaryis = ext
            if inte:
                pol.innerboundaryis = inte
            pol.style = style
            for k, v in pr.items():
                if v is not None:
                    pol.extendeddata.newdata(name=str(k), value=str(v))

        if gtype == "Polygon":
            _add_poly_coords(kml, coords, label, props)
        elif gtype == "MultiPolygon":
            folder = kml.newfolder(name=label)
            for pcoords in coords:
                _add_poly_coords(folder, pcoords, label, props)
        elif gtype == "Point":
            if len(coords) >= 2:
                pt = kml.newpoint(name=label, coords=[(coords[0], coords[1])])
                pt.style = style
                for k, v in props.items():
                    if v is not None:
                        pt.extendeddata.newdata(name=str(k), value=str(v))
        elif gtype == "LineString":
            line_pts = [(pt[0], pt[1]) for pt in coords if len(pt) >= 2]
            if line_pts:
                ls = kml.newlinestring(name=label, coords=line_pts)
                ls.style = style
                for k, v in props.items():
                    if v is not None:
                        ls.extendeddata.newdata(name=str(k), value=str(v))
        elif gtype == "MultiLineString":
            folder = kml.newfolder(name=label)
            for seg in coords:
                line_pts = [(pt[0], pt[1]) for pt in seg if len(pt) >= 2]
                if line_pts:
                    ls = folder.newlinestring(name=label, coords=line_pts)
                    ls.style = style
                    for k, v in props.items():
                        if v is not None:
                            ls.extendeddata.newdata(name=str(k), value=str(v))

    return kml.kml(format=False).encode("utf-8")


def geojson_file_to_kmz_bytes(geojson_path: str, doc_name: str = "GIS Export", file_type: str = "vector") -> bytes:
    """Convert a native on-disk .geojson file → KMZ bytes (ZIP of doc.kml)."""
    kml_bytes = geojson_file_to_kml_bytes(geojson_path, doc_name, file_type)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("doc.kml", kml_bytes)
    return buf.getvalue()


# ─── KML / KMZ ────────────────────────────────────────────────────────────────

def _kml_style_block(file_type: str = "vector") -> str:
    """Returns KML style XML based on layer type (fmb = emerald, vector = sky-blue)."""
    if file_type == "fmb":
        # Emerald green – FMB cadastral parcels
        line_color  = "ff10b981"   # #10b981 ABGR
        poly_color  = "4010b981"   # 25 % opacity fill
    else:
        # Sky blue – Vector village/taluk/district boundaries
        line_color  = "ffc78402"   # #0284c7 ABGR (KML = AABBGGRR)
        poly_color  = "40c78402"

    return f"""  <Style id="gisStyle">
    <LineStyle><color>{line_color}</color><width>2.5</width></LineStyle>
    <PolyStyle><color>{poly_color}</color><fill>1</fill><outline>1</outline></PolyStyle>
  </Style>"""


def geojson_to_kml(
    geojson: Dict[str, Any],
    document_name: str = "GIS Export",
    file_type: str = "vector",
) -> str:
    features = (
        geojson.get("features", [])
        if geojson.get("type") == "FeatureCollection"
        else [geojson]
    )

    def format_coords(ring: List[List[float]]) -> str:
        return " ".join(
            f"{c[0]},{c[1]},0" for c in ring if len(c) >= 2
        )

    style_block = _kml_style_block(file_type)
    placemarks_xml: List[str] = []

    for feature in features:
        props = feature.get("properties") or {}
        name = (
            props.get("name")
            or props.get("survey_no")
            or props.get("village_name")
            or props.get("taluk_name")
            or props.get("district_name")
            or "Feature"
        )
        geom = feature.get("geometry")
        if not geom:
            continue

        gtype = geom.get("type")
        coords = geom.get("coordinates", [])
        geom_xml = ""

        if gtype == "Polygon":
            outer = coords[0] if coords else []
            inner_rings = coords[1:] if len(coords) > 1 else []
            outer_xml = f"<outerBoundaryIs><LinearRing><coordinates>{format_coords(outer)}</coordinates></LinearRing></outerBoundaryIs>"
            inner_xml = "".join(
                f"<innerBoundaryIs><LinearRing><coordinates>{format_coords(r)}</coordinates></LinearRing></innerBoundaryIs>"
                for r in inner_rings
            )
            geom_xml = f"<Polygon>{outer_xml}{inner_xml}</Polygon>"

        elif gtype == "MultiPolygon":
            polys = []
            for poly in coords:
                outer = poly[0] if poly else []
                inner_rings = poly[1:] if len(poly) > 1 else []
                outer_xml = f"<outerBoundaryIs><LinearRing><coordinates>{format_coords(outer)}</coordinates></LinearRing></outerBoundaryIs>"
                inner_xml = "".join(
                    f"<innerBoundaryIs><LinearRing><coordinates>{format_coords(r)}</coordinates></LinearRing></innerBoundaryIs>"
                    for r in inner_rings
                )
                polys.append(f"<Polygon>{outer_xml}{inner_xml}</Polygon>")
            geom_xml = f"<MultiGeometry>{''.join(polys)}</MultiGeometry>"

        elif gtype == "Point":
            if len(coords) >= 2:
                geom_xml = f"<Point><coordinates>{coords[0]},{coords[1]},0</coordinates></Point>"

        elif gtype == "LineString":
            geom_xml = f"<LineString><coordinates>{format_coords(coords)}</coordinates></LineString>"

        elif gtype == "MultiLineString":
            lines = [
                f"<LineString><coordinates>{format_coords(l)}</coordinates></LineString>"
                for l in coords
            ]
            geom_xml = f"<MultiGeometry>{''.join(lines)}</MultiGeometry>"

        if not geom_xml:
            continue

        # Build HTML popup balloon table
        desc_rows = "".join(
            f"<tr><td style='font-weight:bold;padding:2px 8px 2px 0;color:#555;'>{xml_escape(str(k))}:</td>"
            f"<td style='padding:2px 0;'>{xml_escape(str(v))}</td></tr>"
            for k, v in props.items()
            if v is not None and str(v).strip()
        )
        type_badge = "FMB" if file_type == "fmb" else "VECTOR"
        html_desc = f"""<![CDATA[
        <div style='font-family:sans-serif;font-size:12px;max-width:320px;'>
          <h3 style='margin:0 0 6px 0;color:#0284c7;font-size:14px;border-bottom:1px solid #ddd;padding-bottom:4px;'>
            {xml_escape(str(name))}
            <span style='font-size:10px;background:#e0f2fe;color:#0369a1;padding:1px 5px;border-radius:3px;margin-left:6px;'>{type_badge}</span>
          </h3>
          <table style='font-size:11px;border-collapse:collapse;width:100%;'>{desc_rows}</table>
        </div>
        ]]>"""

        ext_data = "".join(
            f'<Data name="{xml_escape(str(k))}"><value>{xml_escape(str(v))}</value></Data>'
            for k, v in props.items()
        )

        placemarks_xml.append(f"""
  <Placemark>
    <name>{xml_escape(str(name))}</name>
    <description>{html_desc}</description>
    <ExtendedData>{ext_data}</ExtendedData>
    <styleUrl>#gisStyle</styleUrl>
    {geom_xml}
  </Placemark>""")

    kml_doc = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>{xml_escape(document_name)}</name>
    <description>{xml_escape(document_name)} — Exported from GIS Layer Navigator</description>
{style_block}
{"".join(placemarks_xml)}
  </Document>
</kml>"""
    return kml_doc


def geojson_to_kmz(
    geojson: Dict[str, Any],
    document_name: str = "GIS Export",
    file_type: str = "vector",
) -> bytes:
    """Convert GeoJSON → KMZ bytes (ZIP containing doc.kml)."""
    kml_xml = geojson_to_kml(geojson, document_name, file_type)
    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("doc.kml", kml_xml.encode("utf-8"))
    return mem_zip.getvalue()


# ─── DXF ──────────────────────────────────────────────────────────────────────

def geojson_to_dxf(geojson: Dict[str, Any]) -> str:
    """Converts GeoJSON geometry into standard ASCII DXF format."""
    features = (
        geojson.get("features", [])
        if geojson.get("type") == "FeatureCollection"
        else [geojson]
    )

    lines = [
        "0", "SECTION",
        "2", "HEADER",
        "0", "ENDSEC",
        "0", "SECTION",
        "2", "TABLES",
        "0", "ENDSEC",
        "0", "SECTION",
        "2", "ENTITIES",
    ]

    def add_polyline(ring: List[List[float]]):
        if not ring:
            return
        lines.extend([
            "0", "LWPOLYLINE",
            "100", "AcDbEntity",
            "8", "0",
            "100", "AcDbPolyline",
            "90", str(len(ring)),
            "70", "1",
        ])
        for pt in ring:
            if len(pt) >= 2:
                lines.extend(["10", str(pt[0]), "20", str(pt[1])])

    for f in features:
        geom = f.get("geometry")
        if not geom:
            continue
        gtype = geom.get("type")
        coords = geom.get("coordinates", [])

        if gtype == "Polygon":
            for ring in coords:
                add_polyline(ring)
        elif gtype == "MultiPolygon":
            for poly in coords:
                for ring in poly:
                    add_polyline(ring)
        elif gtype == "LineString":
            add_polyline(coords)
        elif gtype == "MultiLineString":
            for seg in coords:
                add_polyline(seg)

    lines.extend(["0", "ENDSEC", "0", "EOF"])
    return "\n".join(lines)


# ─── SHAPEFILE FROM GEOJSON ───────────────────────────────────────────────────

_WGS84_PRJ = (
    'GEOGCS["GCS_WGS_1984",'
    'DATUM["D_WGS_1984",'
    'SPHEROID["WGS_1984",6378137.0,298.257223563]],'
    'PRIMEM["Greenwich",0.0],'
    'UNIT["Degree",0.0174532925199433]]'
)

def _geojson_shape_type(geojson: Dict[str, Any]) -> int:
    """Determine dominant ESRI shape type from a FeatureCollection."""
    import shapefile
    features = geojson.get("features", []) if geojson.get("type") == "FeatureCollection" else [geojson]
    for f in features:
        geom = f.get("geometry") or {}
        gt = geom.get("type", "")
        if "Polygon" in gt:
            return shapefile.POLYGON
        if "Line" in gt:
            return shapefile.POLYLINE
        if "Point" in gt:
            return shapefile.POINT
    return shapefile.POLYGON


def geojson_to_shapefile_zip(
    geojson: Dict[str, Any],
    base_name: str = "GIS_Export",
    file_type: str = "vector",
) -> Tuple[bytes, str]:
    """
    Convert a GeoJSON FeatureCollection → ESRI Shapefile ZIP bytes.
    Returns (zip_bytes, suggested_filename).
    Bundles: .shp, .shx, .dbf, .prj, .cpg
    """
    import shapefile

    features = geojson.get("features", []) if geojson.get("type") == "FeatureCollection" else [geojson]
    if not features:
        return b"", f"{base_name}.zip"

    shape_type = _geojson_shape_type(geojson)

    # Collect all unique property keys for DBF fields
    all_keys: List[str] = []
    seen_keys: set = set()
    for feat in features:
        for k in (feat.get("properties") or {}).keys():
            if k not in seen_keys:
                all_keys.append(k)
                seen_keys.add(k)

    with tempfile.TemporaryDirectory() as tmpdir:
        prefix = os.path.join(tmpdir, base_name)
        w = shapefile.Writer(prefix, shapeType=shape_type)

        # Add DBF fields (truncated to 10 chars, string type)
        for key in all_keys:
            field_name = str(key)[:10]
            w.field(field_name, "C", size=254)

        def _add_polygon(feat, coords_list):
            """Write outer ring + inner rings correctly for ESRI Shapefile."""
            rings = []
            for ring in coords_list:
                rings.append([list(pt[:2]) for pt in ring if len(pt) >= 2])
            if rings:
                w.poly(rings)
                return True
            return False

        def _add_point(feat, coords):
            if len(coords) >= 2:
                w.point(coords[0], coords[1])
                return True
            return False

        def _add_line(feat, coords_list):
            lines = [[list(pt[:2]) for pt in seg if len(pt) >= 2] for seg in coords_list]
            lines = [l for l in lines if l]
            if lines:
                w.line(lines)
                return True
            return False

        for feat in features:
            geom = feat.get("geometry") or {}
            props = feat.get("properties") or {}
            gtype = geom.get("type", "")
            coords = geom.get("coordinates", [])

            added = False
            if gtype == "Polygon":
                added = _add_polygon(feat, coords)
            elif gtype == "MultiPolygon":
                # ESRI Shapefile POLYGON supports multiple parts
                all_rings = []
                for poly in coords:
                    for ring in poly:
                        all_rings.append([list(pt[:2]) for pt in ring if len(pt) >= 2])
                if all_rings:
                    w.poly(all_rings)
                    added = True
            elif gtype == "Point":
                added = _add_point(feat, coords)
            elif gtype == "MultiPoint":
                for pt in coords:
                    _add_point(feat, pt)
                added = bool(coords)
            elif gtype == "LineString":
                added = _add_line(feat, [coords])
            elif gtype == "MultiLineString":
                added = _add_line(feat, coords)

            if added:
                # Build DBF record matching field order
                record = [str(props.get(k, "") or "")[:254] for k in all_keys]
                w.record(*record)

        w.close()

        # Bundle all produced sidecar files into a ZIP
        mem_zip = io.BytesIO()
        with zipfile.ZipFile(mem_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for ext in [".shp", ".shx", ".dbf"]:
                candidate = prefix + ext
                if os.path.exists(candidate):
                    zf.write(candidate, arcname=f"{base_name}{ext}")

            # Always add WGS84 .prj
            zf.writestr(f"{base_name}.prj", _WGS84_PRJ)

            # Always add .cpg for UTF-8 encoding
            zf.writestr(f"{base_name}.cpg", "UTF-8")

        zip_bytes = mem_zip.getvalue()
        zip_filename = f"{base_name}_Shapefile.zip"
        return zip_bytes, zip_filename
