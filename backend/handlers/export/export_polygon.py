"""
POST /api/export-polygon
────────────────────────
Export a client-supplied GeoJSON geometry (a polygon drawn on the map) into any
supported GIS format.
"""

import io
import json
import re
import zipfile
from typing import Any, Dict

from core.http import Request, HttpError, binary_response
from format_exporter import (
    geojson_to_dxf,
    geojson_to_kml,
    geojson_to_kmz,
    geojson_to_shapefile_zip,
)

_CRS84 = {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}}
_WGS84_PRJ = (
    'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,'
    '298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'
)
_BARE_GEOMETRY_TYPES = ("Polygon", "MultiPolygon", "Point", "LineString", "MultiLineString")


def handle(request: Request) -> Dict[str, Any]:
    body = request.json()
    g_data = body.get("geojson")
    if not g_data or not isinstance(g_data, dict):
        raise HttpError(400, "Missing GeoJSON data to export.")

    name = body.get("name") or "polygon_extract"
    fmt = str(body.get("format") or "shp").lower().strip()
    ft = str(body.get("file_type") or "vector").lower().strip()

    # Accept a Feature, a bare geometry, or a FeatureCollection.
    if g_data.get("type") == "Feature":
        g_data = {"type": "FeatureCollection", "features": [g_data]}
    elif g_data.get("type") in _BARE_GEOMETRY_TYPES:
        g_data = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {"name": name or "Extracted Feature"},
                "geometry": g_data,
            }],
        }

    if not g_data.get("features"):
        raise HttpError(400, "GeoJSON contains no features to export.")

    clean_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', str(name).strip()) or "Polygon_Extract"
    base_name = "%s_%s" % (clean_name, ft.upper())

    if fmt in ("shp", "shapefile", "zip"):
        shp_bytes, shp_name = geojson_to_shapefile_zip(g_data, base_name=base_name, file_type=ft)
        if not shp_bytes:
            raise HttpError(500, "Failed to convert the extracted geometry to a Shapefile.")
        return binary_response(shp_bytes, "application/zip", shp_name)

    if fmt in ("geojson", "json"):
        export_fc = dict(g_data)
        export_fc["name"] = base_name
        export_fc["crs"] = _CRS84
        return binary_response(
            json.dumps(export_fc, indent=2, ensure_ascii=False).encode("utf-8"),
            "application/geo+json",
            "%s.geojson" % base_name,
        )

    if fmt == "kml":
        kml_xml = geojson_to_kml(g_data, "%s (Extracted Polygon)" % clean_name, ft)
        return binary_response(
            kml_xml.encode("utf-8"),
            "application/vnd.google-earth.kml+xml",
            "%s_GoogleEarth.kml" % base_name,
        )

    if fmt == "kmz":
        return binary_response(
            geojson_to_kmz(g_data, "%s (Extracted Polygon)" % clean_name, ft),
            "application/vnd.google-earth.kmz",
            "%s_GoogleEarth.kmz" % base_name,
        )

    if fmt in ("cad", "dxf"):
        return binary_response(
            geojson_to_dxf(g_data).encode("utf-8"),
            "application/dxf",
            "%s_AutoCAD.dxf" % base_name,
        )

    # Fallback: GeoJSON plus projection and encoding sidecars in a ZIP.
    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("%s.geojson" % base_name, json.dumps(g_data, indent=2, ensure_ascii=False))
        zf.writestr("%s_WGS84.prj" % base_name, _WGS84_PRJ)
        zf.writestr("%s.cpg" % base_name, "UTF-8")
    return binary_response(mem_zip.getvalue(), "application/zip", "%s_Package.zip" % base_name)
