"""
backend/handlers/export/_export_core.py
───────────────────────────────────────
Shared export pipeline behind /api/export and /api/download/{level}/{code}.

Format handling, per-village ZIP folder structure and the native-file-first
fallback chain are preserved exactly as the FastAPI backend implemented them;
only file access moved to ``core.gisfs``.
"""

import io
import json
import zipfile
from typing import Any, Dict, List, Optional, Tuple

from core import gisfs
from core.asyncutil import run_sync
from core.http import HttpError
from db import get_village_entries, pad_code
from format_exporter import (
    geojson_file_to_kml_bytes,
    geojson_file_to_kmz_bytes,
    geojson_to_dxf,
    geojson_to_kml,
    geojson_to_kmz,
    geojson_to_shapefile_zip,
)
from services.geojson_builder import build_merged_geojson
from zip_bundler import build_human_readable_prefix, generate_shapefile_zip_bytes

ZIP_TYPE = "application/zip"
KML_TYPE = "application/vnd.google-earth.kml+xml"
KMZ_TYPE = "application/vnd.google-earth.kmz"
DXF_TYPE = "application/dxf"

_CRS84 = {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}}
_WGS84_PRJ = (
    'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,'
    '298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'
)

#: (payload, content type, download filename)
Export = Tuple[bytes, str, str]


def build_export(level: str, code: str,
                 district_code: Optional[str] = None,
                 taluk_code: Optional[str] = None,
                 village_code: Optional[str] = None,
                 file_type: str = "vector",
                 export_format: str = "shp",
                 base_survey: Optional[str] = None) -> Export:
    """Produce the download payload for one export request."""
    fmt = (export_format or "shp").lower().strip()
    ft = (file_type or "vector").lower().strip()
    name_prefix = build_human_readable_prefix(
        level, code, district_code, taluk_code, village_code, ft,
    )
    type_tag = ft.upper()
    base_name = "%s_%s" % (name_prefix, type_tag)

    if level == "parcel":
        parcel = _export_parcel(
            code, district_code, taluk_code, village_code, ft, fmt, base_survey,
            name_prefix, base_name,
        )
        if parcel is not None:
            return parcel

    if fmt in ("shp", "shapefile", "zip"):
        return _export_shapefile(
            level, code, district_code, taluk_code, village_code, ft, base_name,
        )

    if fmt in ("geojson", "json"):
        return _export_geojson(
            level, code, district_code, taluk_code, village_code, ft,
            name_prefix, type_tag, base_name,
        )

    # KML / KMZ / DXF all need the merged collection.
    merged = run_sync(build_merged_geojson(
        level=level, code=code, q_dist=district_code, q_tal=taluk_code,
        q_vil=village_code, file_type=ft,
    ))
    g_data = merged.get("geojson") if merged else None
    if not g_data or not g_data.get("features"):
        raise HttpError(
            404, "No GIS boundary data found for level='%s' code='%s'." % (level, code),
        )

    if fmt == "kml":
        return _export_kml(
            level, code, district_code, taluk_code, village_code, ft,
            name_prefix, type_tag, base_name, g_data,
        )

    if fmt == "kmz":
        return _export_kmz(
            level, code, district_code, taluk_code, village_code, ft,
            name_prefix, type_tag, base_name, g_data,
        )

    if fmt in ("cad", "dxf"):
        return (
            geojson_to_dxf(g_data).encode("utf-8"),
            DXF_TYPE,
            "%s_AutoCAD.dxf" % base_name,
        )

    return _export_package(base_name, g_data)


# ─── PARCEL / SURVEY LEVEL ───────────────────────────────────────────────────

def _export_parcel(code, district_code, taluk_code, village_code, ft, fmt,
                   base_survey, name_prefix, base_name) -> Optional[Export]:
    parts = [p.strip() for p in (code or "").split("_") if p.strip()]
    if len(parts) >= 4:
        district_code = district_code or parts[0]
        taluk_code = taluk_code or parts[1]
        village_code = village_code or parts[2]
        if not base_survey:
            base_survey = "_".join(parts[3:])

    target_sno = str(base_survey).strip() if base_survey else ""
    if not target_sno:
        target_sno = parts[-1] if parts else code
    target_sno = str(target_sno).strip().replace("_", "/")

    # Target village code for village level fallback
    vil_combo = ""
    if district_code and taluk_code and village_code:
        vil_combo = f"{district_code}_{taluk_code}_{village_code}"
    elif len(parts) >= 3:
        vil_combo = f"{parts[0]}_{parts[1]}_{parts[2]}"
    else:
        vil_combo = village_code or code

    # Support comma-separated surveys in code or base_survey
    target_snos = set()
    for s in target_sno.split(","):
        s_clean = s.strip().lower()
        if s_clean:
            target_snos.add(s_clean)
            if "/" in s_clean:
                target_snos.add(s_clean.split("/")[0].strip())

    merged_feats: List[Dict[str, Any]] = []
    types_to_try = ("vector", "fmb") if ft in ("both", "vector") else ("fmb", "vector")
    for sub_ft in types_to_try:
        try:
            res = run_sync(build_merged_geojson(
                "parcel", vil_combo, q_dist=district_code, q_tal=taluk_code,
                q_vil=village_code, file_type=sub_ft, survey_no=target_sno,
            ))
            feats = (res.get("geojson") or {}).get("features") or []
            if feats:
                merged_feats.extend(feats)
                break
        except Exception:
            pass

    if not merged_feats:
        # Fall back to scanning the village layer for matching survey numbers.
        for sub_ft in ("vector", "fmb"):
            try:
                fallback = run_sync(build_merged_geojson(
                    "village", vil_combo, q_dist=district_code, q_tal=taluk_code,
                    q_vil=village_code, file_type=sub_ft,
                ))
                for f in (fallback.get("geojson") or {}).get("features") or []:
                    props = f.get("properties") or {}
                    raw_sno = str(props.get("survey_no") or props.get("SURVEY_NO") or props.get("sno") or props.get("KIDE") or props.get("name") or "").strip().lower()
                    base_sno = raw_sno.split("/")[0].strip() if "/" in raw_sno else raw_sno
                    if any(t == raw_sno or t == base_sno or raw_sno.startswith(f"{t}/") for t in target_snos):
                        merged_feats.append(f)
                if merged_feats:
                    break
            except Exception:
                pass

    if not merged_feats:
        raise HttpError(404, "No parcel features found for survey '%s'." % target_sno)

    parcel_fc = {"type": "FeatureCollection", "crs": _CRS84, "features": merged_feats}

    if fmt in ("shp", "shapefile", "zip"):
        shp_bytes, shp_name = geojson_to_shapefile_zip(parcel_fc, base_name=base_name, file_type=ft)
        if shp_bytes:
            return shp_bytes, ZIP_TYPE, shp_name

    if fmt in ("geojson", "json"):
        return (
            _zip_of({"%s.geojson" % base_name: json.dumps(parcel_fc, indent=2, ensure_ascii=False)}),
            ZIP_TYPE,
            "%s_GeoJSON.zip" % base_name,
        )

    if fmt == "kmz":
        return geojson_to_kmz(parcel_fc, name_prefix, ft), KMZ_TYPE, "%s.kmz" % base_name

    if fmt == "kml":
        return (
            _zip_of({"%s.kml" % base_name: geojson_to_kml(parcel_fc, name_prefix, ft)}),
            ZIP_TYPE,
            "%s_KML.zip" % base_name,
        )

    # Any other format falls through to the generic pipeline.
    return None


# ─── ENTRY RESOLUTION ────────────────────────────────────────────────────────

def _resolve_entries(level: str, code: str, district_code, taluk_code,
                     village_code, ft: str) -> List[Dict[str, Any]]:
    """Village entries covered by the request, honouring comma-separated codes."""
    raw_codes = [c.strip() for c in (code or "").split(",") if c.strip()]
    if not raw_codes:
        return []

    if len(raw_codes) == 1:
        parts = [p.strip() for p in raw_codes[0].split("_") if p.strip()]
        if level == "district":
            dc, tc, vc = pad_code(district_code or raw_codes[0]), "*", "*"
        elif level == "taluk":
            if len(parts) >= 2:
                dc, tc = pad_code(parts[0]), pad_code(parts[1])
            else:
                dc = pad_code(district_code) if district_code else "*"
                tc = pad_code(parts[0])
            vc = "*"
        elif level in ("village", "parcel"):
            if len(parts) >= 3:
                dc, tc, vc = pad_code(parts[0]), pad_code(parts[1]), pad_code(parts[2])
            else:
                dc = pad_code(district_code) if district_code else "*"
                tc = pad_code(taluk_code) if taluk_code else "*"
                vc = pad_code(parts[0])
        else:
            dc = pad_code(district_code) if district_code else "*"
            tc = pad_code(taluk_code) if taluk_code else "*"
            vc = pad_code(village_code) if village_code else "*"

        if ft == "both":
            return get_village_entries(dc, tc, vc, "vector") + get_village_entries(dc, tc, vc, "fmb")
        entries = get_village_entries(dc, tc, vc, ft)
        if not entries and ft == "fmb":
            entries = get_village_entries(dc, tc, vc, "vector")
        return entries

    entries: List[Dict[str, Any]] = []
    seen: set = set()
    for c in raw_codes:
        parts = [p.strip() for p in c.split("_") if p.strip()]
        if level == "district":
            dc, tc, vc = (pad_code(parts[0]) if parts else "*"), "*", "*"
        elif level == "taluk":
            dc = pad_code(parts[0]) if len(parts) >= 2 else (pad_code(district_code) if district_code else "*")
            tc = pad_code(parts[1]) if len(parts) >= 2 else (pad_code(parts[0]) if parts else "*")
            vc = "*"
        else:
            dc = pad_code(parts[0]) if len(parts) >= 3 else (pad_code(district_code) if district_code else "*")
            tc = pad_code(parts[1]) if len(parts) >= 3 else (pad_code(taluk_code) if taluk_code else "*")
            vc = pad_code(parts[2]) if len(parts) >= 3 else (pad_code(parts[0]) if parts else "*")

        for item_ft in (["vector", "fmb"] if ft == "both" else [ft]):
            sub = get_village_entries(dc, tc, vc, item_ft)
            if not sub and item_ft == "fmb":
                sub = get_village_entries(dc, tc, vc, "vector")
            for e in sub:
                combo = (e["district_code"], e["taluk_code"], e["village_code"],
                         e.get("file_type", item_ft))
                if combo not in seen:
                    seen.add(combo)
                    entries.append(e)
    return entries


def _native_geojson_pairs(entries: List[Dict[str, Any]]) -> List[Tuple[Dict[str, Any], str]]:
    """(entry, geojson URI) pairs for entries backed by a real .geojson object."""
    pairs: List[Tuple[Dict[str, Any], str]] = []
    for entry in entries:
        gpath = entry.get("geojson_path") or ""
        if gpath and gisfs.exists(gpath) and gpath.lower().endswith((".geojson", ".json")):
            pairs.append((entry, gpath))
            continue
        shp_path = entry.get("shp_path") or ""
        if shp_path and gisfs.exists(shp_path):
            candidate = gisfs.splitext(shp_path)[0] + ".geojson"
            if gisfs.exists(candidate):
                pairs.append((entry, candidate))

    seen: set = set()
    unique: List[Tuple[Dict[str, Any], str]] = []
    for entry, gpath in pairs:
        norm = gisfs.normalize(gpath)
        if norm not in seen:
            seen.add(norm)
            unique.append((entry, gpath))
    return unique


def _arcname(level: str, entry: Dict[str, Any], filename: str, single: bool) -> str:
    """Per-village folder layout, flattened for a single-village download."""
    if level in ("village", "parcel") and single:
        return filename
    dc, tc, vc = entry["district_code"], entry["taluk_code"], entry["village_code"]
    return "%s_%s/%s_%s_%s/%s" % (dc, tc, dc, tc, vc, filename)


# ─── FORMAT PIPELINES ────────────────────────────────────────────────────────

def _export_shapefile(level, code, district_code, taluk_code, village_code,
                      ft, base_name) -> Export:
    zip_bytes, zip_filename, files_count = generate_shapefile_zip_bytes(
        level=level, code=code, file_type=ft,
        q_dist=district_code, q_tal=taluk_code, q_vil=village_code,
    )
    if files_count > 0:
        return zip_bytes, ZIP_TYPE, zip_filename

    # No native .shp on disk — convert the parsed collection instead.
    merged = run_sync(build_merged_geojson(
        level=level, code=code, q_dist=district_code, q_tal=taluk_code,
        q_vil=village_code, file_type=ft,
    ))
    g_data = merged.get("geojson") if merged else None
    if g_data and g_data.get("features"):
        shp_bytes, shp_name = geojson_to_shapefile_zip(g_data, base_name=base_name, file_type=ft)
        if shp_bytes:
            return shp_bytes, ZIP_TYPE, shp_name

    raise HttpError(404, "No Shapefile data found for level='%s' code='%s'." % (level, code))


def _export_geojson(level, code, district_code, taluk_code, village_code, ft,
                    name_prefix, type_tag, base_name) -> Export:
    entries = _resolve_entries(level, code, district_code, taluk_code, village_code, ft)
    pairs = _native_geojson_pairs(entries)

    if pairs:
        mem_zip = io.BytesIO()
        with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for entry, gpath in pairs:
                fname = gisfs.basename(gpath)
                zf.writestr(_arcname(level, entry, fname, len(pairs) == 1),
                            gisfs.read_bytes(gpath))
        return (
            mem_zip.getvalue(), ZIP_TYPE,
            "%s_%s_GeoJSON.zip" % (name_prefix, type_tag),
        )

    merged = run_sync(build_merged_geojson(
        level=level, code=code, q_dist=district_code, q_tal=taluk_code,
        q_vil=village_code, file_type=ft,
    ))
    g_data = merged.get("geojson") if merged else None
    if not g_data or not g_data.get("features"):
        raise HttpError(404, "No GeoJSON data found for level='%s' code='%s'." % (level, code))

    export_fc = dict(g_data)
    export_fc["crs"] = _CRS84
    return (
        _zip_of({"%s.geojson" % base_name: json.dumps(export_fc, indent=2, ensure_ascii=False)}),
        ZIP_TYPE,
        "%s_GeoJSON.zip" % base_name,
    )


def _export_kml(level, code, district_code, taluk_code, village_code, ft,
                name_prefix, type_tag, base_name, g_data) -> Export:
    entries = _resolve_entries(level, code, district_code, taluk_code, village_code, ft)
    pairs = _native_geojson_pairs(entries)

    if pairs:
        mem_zip = io.BytesIO()
        with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for entry, gpath in pairs:
                stem = gisfs.splitext(gisfs.basename(gpath))[0]
                zf.writestr(
                    _arcname(level, entry, "%s.kml" % stem, len(pairs) == 1),
                    geojson_file_to_kml_bytes(gpath, stem, ft),
                )
        return mem_zip.getvalue(), ZIP_TYPE, "%s_%s_KML.zip" % (name_prefix, type_tag)

    kml_xml = geojson_to_kml(g_data, "%s (%s)" % (name_prefix, type_tag), ft)
    return kml_xml.encode("utf-8"), KML_TYPE, "%s_GoogleEarth.kml" % base_name


def _export_kmz(level, code, district_code, taluk_code, village_code, ft,
                name_prefix, type_tag, base_name, g_data) -> Export:
    entries = _resolve_entries(level, code, district_code, taluk_code, village_code, ft)
    pairs = _native_geojson_pairs(entries)

    if pairs:
        mem_zip = io.BytesIO()
        with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for entry, gpath in pairs:
                stem = gisfs.splitext(gisfs.basename(gpath))[0]
                zf.writestr(
                    _arcname(level, entry, "%s.kmz" % stem, len(pairs) == 1),
                    geojson_file_to_kmz_bytes(gpath, stem, ft),
                )
        return mem_zip.getvalue(), ZIP_TYPE, "%s_%s_KMZ.zip" % (name_prefix, type_tag)

    return (
        geojson_to_kmz(g_data, "%s (%s)" % (name_prefix, type_tag), ft),
        KMZ_TYPE,
        "%s_GoogleEarth.kmz" % base_name,
    )


def _export_package(base_name: str, g_data: Dict[str, Any]) -> Export:
    """Catch-all bundle: GeoJSON with projection and encoding sidecars."""
    export_fc = dict(g_data)
    export_fc["crs"] = _CRS84
    return (
        _zip_of({
            "%s.geojson" % base_name: json.dumps(export_fc, indent=2, ensure_ascii=False),
            "%s_WGS84.prj" % base_name: _WGS84_PRJ,
            "%s.cpg" % base_name: "UTF-8",
        }),
        ZIP_TYPE,
        "%s_Package.zip" % base_name,
    )


def _zip_of(members: Dict[str, Any]) -> bytes:
    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for arcname, content in members.items():
            zf.writestr(arcname, content)
    return mem_zip.getvalue()
