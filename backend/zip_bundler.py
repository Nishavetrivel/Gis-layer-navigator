"""
backend/zip_bundler.py
──────────────────────
Zip packaging for GIS Shapefiles (native on-disk bundles), GeoJSON,
and merged layers in Python.

Key responsibilities:
- Bundle native ESRI sidecar files (.shp, .shx, .dbf, .prj, .cpg) from the
  correct FMB or Vector directory based on the selected layer type.
- Support multi-selection (comma-separated codes) at every level.
- Always include a WGS84 .prj if no .prj is present in source files.
- Always include a .cpg (UTF-8) file.
"""

import io
import re
import zipfile
from typing import Optional, List, Tuple

from core import gisfs
from db import (
    pad_code,
    get_village_entry,
    get_village_entries,
    get_all_districts,
    get_taluks_by_district,
    get_vector_root,
)

# ─── CONSTANTS ────────────────────────────────────────────────────────────────

_WGS84_PRJ = (
    'GEOGCS["GCS_WGS_1984",'
    'DATUM["D_WGS_1984",'
    'SPHEROID["WGS_1984",6378137.0,298.257223563]],'
    'PRIMEM["Greenwich",0.0],'
    'UNIT["Degree",0.0174532925199433]]'
)

# ESRI Shapefile mandatory + recommended sidecar extensions
_SHP_EXTENSIONS = [".shp", ".shx", ".dbf", ".prj", ".cpg", ".sbn", ".sbx", ".idx"]

# GeoJSON sidecar extensions (only added to SHP ZIP if present, not mandatory)
_GEOJSON_EXTS = [".geojson", ".json"]


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def sanitize_name(s: str) -> str:
    if not s:
        return ""
    clean = re.sub(r'[\\/:*?"<>|]', "", str(s).strip())
    return re.sub(r"\s+", "_", clean)


def build_human_readable_prefix(
    level: str,
    code: str,
    q_dist: Optional[str] = None,
    q_tal: Optional[str] = None,
    q_vil: Optional[str] = None,
    file_type: str = "vector",
) -> str:
    """Build a human-readable filename prefix from level + code + optional names."""
    raw_codes = [c.strip() for c in (code or "").split(",") if c.strip()]
    dist_name = ""
    tal_name = ""
    vil_name = ""
    item_names: List[str] = []

    for c in raw_codes:
        clean_c = re.sub(r"\.zip$", "", c, flags=re.IGNORECASE)
        parts = [p for p in clean_c.split("_") if p]

        dc = pad_code(q_dist) if q_dist else (parts[0] if len(parts) >= 1 else "")
        tc = pad_code(q_tal) if q_tal else (parts[1] if len(parts) >= 2 else "")
        vc = pad_code(q_vil) if q_vil else (parts[2] if len(parts) >= 3 else "")

        entry = None
        if dc and tc and vc:
            entry = get_village_entry(dc, tc, vc, file_type)

        if entry:
            if not dist_name:
                dist_name = sanitize_name(entry.get("district_name") or f"District_{dc}")
            if not tal_name:
                tal_name = sanitize_name(entry.get("taluk_name") or f"Taluk_{tc}")
            if level == "village" and not vil_name:
                vil_name = sanitize_name(entry.get("village_name") or f"Village_{vc}")
            if level == "parcel" and len(parts) >= 4:
                item_names.append(sanitize_name(parts[3]))
        else:
            if level == "district" and dc:
                all_d = get_all_districts()
                d_found = next((d for d in all_d if d["district_code"] == dc), None)
                d_n = d_found["district_name"] if d_found else f"District_{dc}"
                item_names.append(sanitize_name(d_n))
            elif level == "taluk" and dc and tc:
                all_t = get_taluks_by_district(dc)
                t_found = next((t for t in all_t if t["taluk_code"] == tc), None)
                t_n = t_found["taluk_name"] if t_found else f"Taluk_{tc}"
                item_names.append(sanitize_name(t_n))

    if level == "district":
        name = item_names[0] if item_names else (dist_name or "District")
        return f"District_{name}"
    elif level == "taluk":
        name = item_names[0] if item_names else (tal_name or "Taluk")
        prefix = f"{dist_name}_" if dist_name else ""
        return f"{prefix}Taluk_{name}"
    elif level == "village":
        name = vil_name or (item_names[0] if item_names else "Village")
        prefix = f"{dist_name}_{tal_name}_" if (dist_name and tal_name) else ""
        return f"{prefix}Village_{name}"
    elif level == "parcel":
        p_name = item_names[0] if item_names else "Parcel"
        prefix = f"{dist_name}_{tal_name}_{vil_name}_" if (dist_name and tal_name and vil_name) else ""
        return f"{prefix}Survey_{p_name}"

    return sanitize_name(code or "GIS_Export")


def _bundle_shapefile_sidecars(
    shp_path: str,
    zf: zipfile.ZipFile,
    arc_folder: str,
    seen_paths: set,
) -> int:
    """
    Bundle all sidecar files (.shp, .shx, .dbf, .prj, .cpg, etc.)
    adjacent to a given .shp file into the ZipFile.
    Returns number of files added.
    """
    if not shp_path or not gisfs.exists(shp_path):
        return 0

    base_path = gisfs.splitext(shp_path)[0]
    dir_name = gisfs.dirname(shp_path)
    base_name = gisfs.basename(base_path)
    added = 0

    # Candidates in both lower and upper case extensions.
    all_exts = _SHP_EXTENSIONS + [ext.upper() for ext in _SHP_EXTENSIONS]

    for ext in all_exts:
        candidate = gisfs.join(dir_name, base_name + ext)
        if not gisfs.exists(candidate):
            continue
        norm_p = gisfs.normalize(candidate)
        if norm_p in seen_paths:
            continue
        seen_paths.add(norm_p)
        clean_ext = gisfs.splitext(candidate)[1].lower()
        arcname = f"{arc_folder}/{base_name}{clean_ext}" if arc_folder else f"{base_name}{clean_ext}"
        zf.writestr(arcname, gisfs.read_bytes(candidate))
        added += 1

    return added


# ─── MAIN FUNCTION ────────────────────────────────────────────────────────────

def generate_shapefile_zip_bytes(
    level: str,
    code: str,
    file_type: str = "vector",
    q_dist: Optional[str] = None,
    q_tal: Optional[str] = None,
    q_vil: Optional[str] = None,
) -> Tuple[bytes, str, int]:
    """
    Generates a zip byte buffer containing Shapefile components and projection files.

    Priority:
    1. Use native on-disk .shp + all sidecar files if available.
    2. Add WGS84 .prj if not present in source.
    3. Add .cpg = UTF-8 encoding marker.

    Supports comma-separated multi-selection in `code` for multi-download.
    """
    # Handle comma-separated multi-selection
    raw_codes = [c.strip() for c in (code or "").split(",") if c.strip()]

    # For single code, parse out district/taluk/village from the code string
    if len(raw_codes) == 1:
        single_code = raw_codes[0]
        parts = [p.strip() for p in single_code.split("_") if p.strip()]

        if level == "district":
            dc = pad_code(q_dist or single_code)
            tc = "*"
            vc = "*"
        elif level == "taluk":
            if len(parts) >= 2:
                dc = pad_code(parts[0])
                tc = pad_code(parts[1])
            else:
                dc = pad_code(q_dist) if q_dist else "*"
                tc = pad_code(parts[0])
            vc = "*"
        elif level in ("village", "parcel"):
            if len(parts) >= 3:
                dc = pad_code(parts[0])
                tc = pad_code(parts[1])
                vc = pad_code(parts[2])
            else:
                dc = pad_code(q_dist) if q_dist else "*"
                tc = pad_code(q_tal) if q_tal else "*"
                vc = pad_code(parts[0])
        else:
            dc = pad_code(q_dist) if q_dist else "*"
            tc = pad_code(q_tal) if q_tal else "*"
            vc = pad_code(q_vil) if q_vil else "*"

        if file_type == "both":
            entries = get_village_entries(dc, tc, vc, "vector") + get_village_entries(dc, tc, vc, "fmb")
        else:
            entries = get_village_entries(dc, tc, vc, file_type)
            if not entries and file_type == "fmb":
                # Fallback to vector if FMB entries empty
                entries = get_village_entries(dc, tc, vc, "vector")

    else:
        # Multi-selection: resolve each code independently and merge entries
        entries = []
        seen_combos: set = set()
        for c in raw_codes:
            parts = [p.strip() for p in c.split("_") if p.strip()]
            if level == "district":
                dc = pad_code(parts[0]) if parts else "*"
                tc = "*"; vc = "*"
            elif level == "taluk":
                dc = pad_code(parts[0]) if len(parts) >= 2 else (pad_code(q_dist) if q_dist else "*")
                tc = pad_code(parts[1]) if len(parts) >= 2 else (pad_code(parts[0]) if parts else "*")
                vc = "*"
            elif level in ("village", "parcel"):
                dc = pad_code(parts[0]) if len(parts) >= 3 else (pad_code(q_dist) if q_dist else "*")
                tc = pad_code(parts[1]) if len(parts) >= 3 else (pad_code(q_tal)  if q_tal  else "*")
                vc = pad_code(parts[2]) if len(parts) >= 3 else (pad_code(parts[0]) if parts else "*")
            else:
                dc = tc = vc = "*"

            types_to_check = ["vector", "fmb"] if file_type == "both" else [file_type]
            for ft_item in types_to_check:
                sub_entries = get_village_entries(dc, tc, vc, ft_item)
                if not sub_entries and ft_item == "fmb":
                    sub_entries = get_village_entries(dc, tc, vc, "vector")
                for e in sub_entries:
                    combo = (e["district_code"], e["taluk_code"], e["village_code"], e.get("file_type", ft_item))
                    if combo not in seen_combos:
                        seen_combos.add(combo)
                        entries.append(e)

        # For multi-select build prefix
        dc = pad_code(q_dist) if q_dist else "*"
        tc = pad_code(q_tal)  if q_tal  else "*"
        vc = pad_code(q_vil)  if q_vil  else "*"

    name_prefix = build_human_readable_prefix(
        level, code,
        q_dist or (dc if dc != "*" else None),
        q_tal  or (tc if tc != "*" else None),
        q_vil  or (vc if vc != "*" else None),
        file_type,
    )
    ft_tag = file_type.upper()
    zip_filename = f"{name_prefix}_{ft_tag}_Shapefiles.zip"

    mem_zip = io.BytesIO()
    files_added = 0
    seen_paths: set = set()
    has_prj = False
    has_cpg = False

    with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for entry in entries:
            shp_path = entry.get("shp_path")
            if not shp_path or not gisfs.exists(shp_path):
                # Fall back to geojson_path when no .shp is present.
                shp_path = entry.get("geojson_path", "")
                if not shp_path or not gisfs.exists(shp_path):
                    continue
                if shp_path.lower().endswith((".geojson", ".json")):
                    # Cannot bundle a geojson as SHP sidecar — skip sidecar bundling
                    if shp_path not in seen_paths:
                        seen_paths.add(shp_path)
                        arc_base = gisfs.splitext(gisfs.basename(shp_path))[0]
                        dc_ = entry['district_code']
                        tc_ = entry['taluk_code']
                        vc_ = entry['village_code']
                        if len(entries) > 1 or level not in ("village", "parcel"):
                            folder_prefix = f"{dc_}_{tc_}/{dc_}_{tc_}_{vc_}"
                        else:
                            folder_prefix = ""
                        arcname = f"{folder_prefix}/{arc_base}.geojson" if folder_prefix else f"{arc_base}.geojson"
                        zf.writestr(arcname, gisfs.read_bytes(shp_path))
                        files_added += 1
                    continue

            # Determine arc folder: {dc}_{tc}/{dc}_{tc}_{vc}/ for multi-entry or district/taluk scope
            dc_ = entry['district_code']
            tc_ = entry['taluk_code']
            vc_ = entry['village_code']
            if len(entries) > 1 or level not in ("village", "parcel"):
                folder_prefix = f"{dc_}_{tc_}/{dc_}_{tc_}_{vc_}"
            else:
                folder_prefix = ""

            n = _bundle_shapefile_sidecars(shp_path, zf, folder_prefix, seen_paths)
            files_added += n

            # Track if .prj / .cpg was already included
            base_path = gisfs.splitext(shp_path)[0]
            if gisfs.exists(base_path + ".prj"):
                has_prj = True
            if gisfs.exists(base_path + ".cpg"):
                has_cpg = True

        # Always ensure WGS84 .prj is present
        if not has_prj and files_added > 0:
            zf.writestr(f"{name_prefix}_EPSG4326.prj", _WGS84_PRJ)

        # Always ensure .cpg (UTF-8) is present
        if not has_cpg and files_added > 0:
            zf.writestr(f"{name_prefix}.cpg", "UTF-8")

    mem_zip.seek(0)
    return mem_zip.getvalue(), zip_filename, files_added
