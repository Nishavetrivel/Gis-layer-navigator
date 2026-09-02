"""
backend/db.py
─────────────
GIS Layer Navigator data scanner & indexer.

Sources are configured as URIs (see core/config.py) so the same code serves
S3 objects in Lambda and local folders in development:

- District layers : ``GIS_DISTRICT_URI``       (default <data>/District 2)
- Taluk layers    : ``GIS_TALUK_URI``          (default <data>/Taluk 5)
- Village/parcel  : ``GIS_VECTOR_URI``         (default <data>/vector)
- Master names    : ``GIS_OFFICIAL_NAMES_URI`` (default <data>/official_names.json)

All filesystem access goes through ``core.gisfs``; nothing here touches ``os``
paths directly.
"""

import re
import xml.etree.ElementTree as ET
import zipfile
from typing import Any, Dict, List, Optional, Tuple

from core import config, gisfs


def _existing(uris: List[str]) -> List[str]:
    """Keep the configured roots that actually resolve, preserving order."""
    seen = set()
    out: List[str] = []
    for uri in uris:
        if not uri:
            continue
        norm = gisfs.normalize(uri)
        if norm in seen:
            continue
        seen.add(norm)
        if gisfs.exists(uri) or gisfs.isdir(uri):
            out.append(uri)
    return out


def _configured_roots(primary: str, extra_env: str) -> List[str]:
    """Primary root plus any comma-separated fallbacks from ``extra_env``."""
    import os

    roots = [primary]
    extras = (os.environ.get(extra_env) or "").strip()
    if extras:
        roots.extend([e.strip() for e in extras.split(",") if e.strip()])
    return roots


DISTRICT_ROOTS: List[str] = _configured_roots(config.DISTRICT_URI, "GIS_DISTRICT_FALLBACK_URIS")
TALUK_ROOTS: List[str] = _configured_roots(config.TALUK_URI, "GIS_TALUK_FALLBACK_URIS")
VECTOR_ROOTS: List[str] = _configured_roots(config.VECTOR_URI, "GIS_VECTOR_FALLBACK_URIS")


def get_existing_path(uris: List[str]) -> str:
    for uri in uris:
        if uri and (gisfs.exists(uri) or gisfs.isdir(uri)):
            return uri
    return uris[0] if uris else ""


def get_district_root() -> str:
    return get_existing_path(DISTRICT_ROOTS)


def get_taluk_root() -> str:
    return get_existing_path(TALUK_ROOTS)


def get_vector_root() -> str:
    return get_existing_path(VECTOR_ROOTS)


def get_excel_ref_path() -> str:
    """Legacy XLSX name sheet, only consulted when official_names.json is absent."""
    import os

    candidates = [config.OFFICIAL_NAMES_URI]
    extra = (os.environ.get("GIS_EXCEL_REF_URI") or "").strip()
    if extra:
        candidates.insert(0, extra)
    return get_existing_path(candidates)


# ─── CODE NORMALISATION ───────────────────────────────────────────────────────

def strip_leading_zeros(code: str) -> str:
    if not code:
        return ""
    parts = str(code).split("_")
    out = []
    for seg in parts:
        try:
            out.append(str(int(seg)))
        except ValueError:
            out.append("0")
    return "_".join(out)


def format_clean_survey(raw_survey: str, is_vector: bool = False) -> str:
    if not raw_survey:
        return ""
    s = str(raw_survey).strip()
    combo_match = re.match(r"^[0-9]{2}_[0-9]{2}_[0-9]{3}_(.+)$", s)
    if combo_match:
        s = combo_match.group(1)
    if is_vector:
        return re.sub(r"[\/\s]", "", s).strip()
    return s.replace("_", "/")


def normalize_code_segment(raw: Any, expected_digits: int = 2) -> str:
    """Extract and normalise a district (2), taluk (2) or village (3) code."""
    if raw is None:
        return "*"
    s = str(raw).strip()
    if not s or s == "*":
        return "*"
    if "_" in s:
        s = s.split("_")[-1].strip()
    digits = re.sub(r"\D", "", s)
    if digits:
        return digits.zfill(expected_digits)
    return s.zfill(expected_digits)


def pad_code(raw: str) -> str:
    if not raw:
        return ""
    parts = str(raw).split("_")
    if len(parts) == 1:
        return parts[0].zfill(2)
    if len(parts) == 2:
        return "%s_%s" % (parts[0].zfill(2), parts[1].zfill(2))
    if len(parts) >= 3:
        return "%s_%s_%s" % (parts[0].zfill(2), parts[1].zfill(2), parts[2].zfill(3))
    return str(raw)


TN_DISTRICTS = {
    'chennai', 'kancheepuram', 'kanchipuram', 'tiruvallur', 'thiruvallur', 'chengalpattu',
    'vellore', 'tirupathur', 'ranipet', 'thiruvannamalai', 'tiruvannamalai', 'villupuram',
    'kallakurichi', 'cuddalore', 'dharmapuri', 'krishnagiri', 'salem', 'namakkal', 'erode',
    'coimbatore', 'tiruppur', 'nilgiris', 'karur', 'tiruchirappalli', 'trichy', 'perambalur',
    'ariyalur', 'thanjavur', 'thiruvarur', 'nagapattinam', 'mayiladuthurai', 'pudukkottai',
    'dindigul', 'madurai', 'theni', 'virudhunagar', 'sivagangai', 'ramanathapuram',
    'thoothukkudi', 'tuticorin', 'tirunelveli', 'tenkasi', 'kanniyakumari', 'kanyakumari'
}


def read_xlsx_rows(file_uri: str) -> List[List[str]]:
    """Pure standard-library XLSX reader (no third-party dependency)."""
    if not file_uri or not gisfs.exists(file_uri):
        return []
    try:
        with zipfile.ZipFile(gisfs.open_binary(file_uri), 'r') as z:
            shared_strings: List[str] = []
            if 'xl/sharedStrings.xml' in z.namelist():
                tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
                for si in tree.findall('.//{*}si'):
                    texts = [t.text or '' for t in si.findall('.//{*}t')]
                    shared_strings.append(''.join(texts))

            sheet_files = [
                f for f in z.namelist()
                if f.startswith('xl/worksheets/sheet') and f.endswith('.xml')
            ]
            if not sheet_files:
                return []
            sheet_files.sort()
            sheet_tree = ET.fromstring(z.read(sheet_files[0]))

            rows: List[List[str]] = []
            for row_elem in sheet_tree.findall('.//{*}row'):
                row_data: List[str] = []
                for cell in row_elem.findall('{*}c'):
                    cell_type = cell.get('t')
                    val_elem = cell.find('{*}v')
                    if val_elem is not None and val_elem.text is not None:
                        val = val_elem.text
                        if cell_type == 's':
                            try:
                                idx = int(val)
                                row_data.append(
                                    shared_strings[idx] if idx < len(shared_strings) else val
                                )
                            except ValueError:
                                row_data.append(val)
                        else:
                            row_data.append(val)
                    else:
                        is_elem = cell.find('{*}is/{*}t')
                        row_data.append(is_elem.text if (is_elem is not None and is_elem.text) else '')
                if any(str(c).strip() for c in row_data):
                    rows.append(row_data)
            return rows
    except Exception as err:
        print("[db.py] Error parsing XLSX %s: %s" % (file_uri, err))
        return []


_official_names_map: Optional[Dict[str, Dict[str, str]]] = None


def get_official_names_map() -> Dict[str, Dict[str, str]]:
    """District/taluk/village name lookup, cached for the container's lifetime."""
    global _official_names_map
    if _official_names_map is not None:
        return _official_names_map

    m: Dict[str, Dict[str, str]] = {}

    # 1. First priority: official_names.json (single object read).
    try:
        if gisfs.exists(config.OFFICIAL_NAMES_URI):
            parsed = gisfs.read_json(config.OFFICIAL_NAMES_URI)
            if parsed:
                _official_names_map = parsed
                return parsed
    except Exception as err:
        print("[db.py] Error loading official_names.json:", err)

    # 2. Fallback: Excel reference sheet.
    excel_path = get_excel_ref_path()
    if excel_path and excel_path.lower().endswith(".xlsx") and gisfs.exists(excel_path):
        try:
            rows = read_xlsx_rows(excel_path)
            if rows and len(rows) > 1:
                header = [str(c).strip().lower() for c in rows[0]]

                def find_col(kind: str) -> Optional[int]:
                    return next(
                        (i for i, h in enumerate(header)
                         if kind in h and ('code' in h or 'no' in h or 'id' in h)),
                        None,
                    )

                def find_name(kind: str) -> Optional[int]:
                    return next((i for i, h in enumerate(header) if kind in h and 'name' in h), None)

                dc_idx = find_col('dist')
                dn_idx = find_name('dist')
                tc_idx = find_col('taluk')
                tn_idx = find_name('taluk')
                vc_idx = find_col('vil')
                vn_idx = find_name('vil')

                defaults = [dc_idx, dn_idx, tc_idx, tn_idx, vc_idx, vn_idx]
                for pos, val in enumerate(defaults):
                    if val is None and len(header) > pos:
                        defaults[pos] = pos
                dc_idx, dn_idx, tc_idx, tn_idx, vc_idx, vn_idx = defaults

                for r in rows[1:]:
                    def get_col(idx):
                        return str(r[idx]).strip() if idx is not None and idx < len(r) else ""

                    d_code = pad_code(get_col(dc_idx))
                    d_name = get_col(dn_idx)
                    t_code = pad_code(get_col(tc_idx))
                    t_name = get_col(tn_idx)
                    v_code = pad_code(get_col(vc_idx))
                    v_name = get_col(vn_idx)

                    if d_code and t_code and v_code:
                        m["%s_%s_%s" % (d_code, t_code, v_code)] = {
                            "d": d_name or "District %s" % d_code,
                            "t": t_name or "Taluk %s" % t_code,
                            "v": v_name or "Village %s" % v_code,
                        }
                if m:
                    _official_names_map = m
                    return m
        except Exception as err:
            print("[db.py] Error loading Excel reference names:", err)

    _official_names_map = m
    return _official_names_map


from services.geometry_service import find_dbf_path, parse_dbf_file  # noqa: E402


# ─── FILE DISCOVERY ───────────────────────────────────────────────────────────

_GIS_SUFFIXES = (".geojson", ".json", ".shp")


def _walk_gis_files(root: str) -> List[str]:
    """All .geojson/.json/.shp files under ``root`` (one cached listing on S3)."""
    if not root:
        return []
    try:
        return gisfs.glob_files(root, _GIS_SUFFIXES)
    except Exception as err:
        print("[db.py] Error walking %s: %s" % (root, err))
        return []


def get_district_file(district_code: str = "all",
                      district_name: Optional[str] = None) -> Optional[str]:
    """Locate a district boundary layer under the configured district root."""
    root = get_district_root()
    all_files = _walk_gis_files(root)
    if not all_files:
        return None

    if district_code and district_code not in ("all", "*"):
        dc_pad = pad_code(district_code)
        dc_int = str(int(dc_pad)) if dc_pad.isdigit() else dc_pad
        dname_clean = re.sub(r"[^a-zA-Z0-9]", "", district_name or "").lower()

        for f in all_files:
            fname = gisfs.basename(f).lower()
            if ("_%s_" % dc_pad in fname
                    or fname.startswith("%s_" % dc_pad)
                    or "_%s." % dc_pad in fname
                    or "district_%s" % dc_pad in fname
                    or "district%s" % dc_pad in fname
                    or fname in ("%s.shp" % dc_pad, "%s.geojson" % dc_pad,
                                 "%s.shp" % dc_int, "%s.geojson" % dc_int)):
                return f
            if dname_clean and len(dname_clean) > 2 and dname_clean in re.sub(r"[^a-zA-Z0-9]", "", fname):
                return f

    geojson_files = [f for f in all_files if f.lower().endswith((".geojson", ".json"))]
    shp_files = [f for f in all_files if f.lower().endswith(".shp")]
    if geojson_files:
        return geojson_files[0]
    if shp_files:
        return shp_files[0]
    return all_files[0]


def get_all_district_files() -> List[str]:
    return _walk_gis_files(get_district_root())


def get_taluk_file(district_code: str = "", taluk_code: str = "",
                   taluk_name: Optional[str] = None) -> Optional[str]:
    """Locate a taluk boundary layer under the configured taluk root."""
    all_files = _walk_gis_files(get_taluk_root())
    if not all_files:
        return None

    dc_pad = pad_code(district_code) if district_code else ""
    tc_pad = pad_code(taluk_code) if taluk_code else ""
    tname_clean = re.sub(r"[^a-zA-Z0-9]", "", taluk_name or "").lower()

    if dc_pad and tc_pad:
        for f in all_files:
            fname = gisfs.basename(f).lower()
            if "%s_%s" % (dc_pad, tc_pad) in fname or "%s%s" % (dc_pad, tc_pad) in fname:
                return f
            if tname_clean and len(tname_clean) > 2 and tname_clean in re.sub(r"[^a-zA-Z0-9]", "", fname):
                return f

    if dc_pad:
        for f in all_files:
            fname = gisfs.basename(f).lower()
            if ("_%s_" % dc_pad in fname
                    or fname.startswith("%s_" % dc_pad)
                    or "taluk_%s" % dc_pad in fname):
                return f

    geojson_files = [f for f in all_files if f.lower().endswith((".geojson", ".json"))]
    shp_files = [f for f in all_files if f.lower().endswith(".shp")]
    if geojson_files:
        return geojson_files[0]
    if shp_files:
        return shp_files[0]
    return all_files[0]


def get_taluk_files_by_district(district_code: str) -> List[str]:
    return _walk_gis_files(get_taluk_root())


# ─── ON-DEMAND VILLAGE FILE RESOLVER ─────────────────────────────────────────

_village_file_cache: Dict[Tuple[str, str, str, str], Tuple[str, str]] = {}


def _pick_village_files(dir_uri: str, names: List[str]) -> Tuple[str, str]:
    """Choose the first .shp and first .geojson/.json from a directory listing."""
    shp = ""
    geo = ""
    for name in names:
        lower = name.lower()
        full = gisfs.join(dir_uri, name)
        if lower.endswith(".shp") and not shp:
            shp = full
        elif lower.endswith((".geojson", ".json")) and not geo:
            geo = full
    return shp, geo


def find_village_file_on_demand(district_code: str, taluk_code: str,
                                village_code: str,
                                file_type: str = "vector") -> Tuple[str, str]:
    """Resolve (shp_uri, geojson_uri) for one village without scanning the tree.

    Lookups are direct prefix probes — hierarchical ``<root>/dd/tt/vvv/<type>/``
    first, then a flat ``dd_tt_vvv*`` name match — so cost is constant per
    village rather than proportional to the size of the vector store.
    """
    dc_pad = normalize_code_segment(district_code, 2)
    tc_pad = normalize_code_segment(taluk_code, 2)
    vc_pad = normalize_code_segment(village_code, 3)
    ft = (file_type or "vector").lower().strip()

    cache_key = (dc_pad, tc_pad, vc_pad, ft)
    if cache_key in _village_file_cache:
        return _village_file_cache[cache_key]

    shp_found = ""
    geojson_found = ""

    dc_int = str(int(dc_pad)) if dc_pad.isdigit() else dc_pad
    tc_int = str(int(tc_pad)) if tc_pad.isdigit() else tc_pad
    vc_int = str(int(vc_pad)) if vc_pad.isdigit() else vc_pad

    for root in VECTOR_ROOTS:
        if not root:
            continue

        # 1. Hierarchical layout. On S3 a single recursive listing of the
        #    village prefix answers every candidate at once.
        village_prefix = gisfs.join(root, dc_pad, tc_pad, vc_pad)
        sub_order = [
            ft, "%s/georef" % ft, "%s/GeoJSON" % ft, "vector",
            "fmb/georef", "fmb", "", "georef", "GeoJSON",
        ]
        found_by_sub: Dict[str, List[str]] = {}
        try:
            for dirpath, _dirs, files in gisfs.walk(village_prefix):
                rel = dirpath[len(village_prefix):].strip("/\\").replace("\\", "/")
                found_by_sub[rel] = files
        except Exception:
            pass

        for sub in sub_order:
            files = found_by_sub.get(sub)
            if not files:
                continue
            sub_dir = gisfs.join(village_prefix, *sub.split("/")) if sub else village_prefix
            s, g = _pick_village_files(sub_dir, files)
            shp_found = shp_found or s
            geojson_found = geojson_found or g
            if shp_found or geojson_found:
                break

        # 1b. Unpadded hierarchical variant (e.g. 17/1/29/vector).
        if not (shp_found or geojson_found) and (dc_int, tc_int, vc_int) != (dc_pad, tc_pad, vc_pad):
            alt_prefix = gisfs.join(root, dc_int, tc_int, vc_int)
            try:
                for dirpath, _dirs, files in gisfs.walk(alt_prefix):
                    s, g = _pick_village_files(dirpath, files)
                    shp_found = shp_found or s
                    geojson_found = geojson_found or g
                    if shp_found or geojson_found:
                        break
            except Exception:
                pass

        if shp_found or geojson_found:
            break

        # 2. Flat layout: <root>/17_01_029_..._vector.shp
        for prefix in ("%s_%s_%s" % (dc_pad, tc_pad, vc_pad),
                       "%s_%s_%s" % (dc_int, tc_int, vc_int)):
            names = gisfs.list_names_with_prefix(root, prefix)
            if names:
                s, g = _pick_village_files(root, names)
                shp_found = shp_found or s
                geojson_found = geojson_found or g
            if shp_found or geojson_found:
                break

        if shp_found or geojson_found:
            break

    # When only a SHP exists the caller parses it into GeoJSON, so point both ways.
    res = (shp_found or geojson_found, geojson_found or shp_found)
    _village_file_cache[cache_key] = res
    return res


# ─── CORE GETTERS ────────────────────────────────────────────────────────────

def get_all_districts() -> List[Dict[str, str]]:
    """All districts with codes and official Tamil Nadu names."""
    m: Dict[str, str] = {}

    official_map = get_official_names_map()
    for combo, data in official_map.items():
        parts = combo.split("_")
        if parts:
            dc = normalize_code_segment(parts[0], 2)
            if (dc not in m or m[dc] == "District %s" % dc) and data.get("d"):
                m[dc] = data["d"]

    root = get_district_root()
    if root:
        for f in _walk_gis_files(root):
            if not f.lower().endswith(".shp"):
                continue
            dbf_f = find_dbf_path(f)
            if not dbf_f:
                continue
            for props in parse_dbf_file(dbf_f):
                code = (props.get("district_c") or props.get("DISTRICT_C")
                        or props.get("dist_code") or props.get("DIST_CODE")
                        or props.get("dist_id"))
                name = (props.get("dist_name") or props.get("DIST_NAME")
                        or props.get("district_name") or props.get("DISTRICT_NAME"))
                if code is not None:
                    c_pad = normalize_code_segment(str(code), 2)
                    if c_pad not in m or m[c_pad] == "District %s" % c_pad:
                        m[c_pad] = str(name) if name else "District %s" % c_pad

    out = [{"district_code": k, "district_name": v} for k, v in m.items()]
    out.sort(key=lambda x: int(x["district_code"]) if x["district_code"].isdigit() else 0)
    return out


def get_taluks_by_district(district_code: str) -> List[Dict[str, str]]:
    dc_pad = normalize_code_segment(district_code, 2)
    dc_int = int(dc_pad) if dc_pad.isdigit() else None
    m: Dict[str, str] = {}

    try:
        for tal_file in get_taluk_files_by_district(dc_pad):
            if not tal_file or not tal_file.lower().endswith(".shp"):
                continue
            dbf_f = find_dbf_path(tal_file)
            if not dbf_f:
                continue
            for props in parse_dbf_file(dbf_f):
                feat_dc = (props.get("district_c") or props.get("DISTRICT_C")
                           or props.get("dist_id") or props.get("dist_code"))
                feat_tc = (props.get("Taluk_code") or props.get("taluk_code")
                           or props.get("TALUK_CODE") or props.get("taluk_id")
                           or props.get("t_code"))
                feat_tname = (props.get("talukname") or props.get("taluk_name")
                              or props.get("TALUKNAME") or props.get("t_name"))
                if feat_dc is not None and dc_int is not None:
                    try:
                        if int(feat_dc) == dc_int and feat_tc is not None:
                            tc_str = normalize_code_segment(str(feat_tc), 2)
                            m[tc_str] = str(feat_tname) if feat_tname else "Taluk %s" % tc_str
                    except (ValueError, TypeError):
                        pass
    except Exception as e:
        print("[db.py] Error reading taluks from files:", e)

    official_map = get_official_names_map()
    for combo, data in official_map.items():
        parts = combo.split("_")
        if len(parts) >= 2 and normalize_code_segment(parts[0], 2) == dc_pad:
            tc_code = normalize_code_segment(parts[1], 2)
            if (tc_code not in m or m[tc_code] == "Taluk %s" % tc_code) and data.get("t"):
                m[tc_code] = data["t"]

    out = [{"taluk_code": k, "taluk_name": v} for k, v in m.items()]
    out.sort(key=lambda x: int(x["taluk_code"]) if x["taluk_code"].isdigit() else 0)
    return out


def get_villages_by_taluk(district_code: str, taluk_code: str) -> List[Dict[str, str]]:
    dc_pad = normalize_code_segment(district_code, 2)
    tc_pad = normalize_code_segment(taluk_code, 2)
    m: Dict[str, str] = {}

    for combo, data in get_official_names_map().items():
        parts = combo.split("_")
        if (len(parts) >= 3
                and normalize_code_segment(parts[0], 2) == dc_pad
                and normalize_code_segment(parts[1], 2) == tc_pad):
            vc = normalize_code_segment(parts[2], 3)
            m[vc] = data.get("v") or "Village %s" % vc

    out = [{"village_code": k, "village_name": v} for k, v in m.items()]
    out.sort(key=lambda x: [int(c) if c.isdigit() else c
                            for c in re.split(r'(\d+)', x["village_code"])])
    return out


def _clean_ft(ft: Any) -> str:
    if hasattr(ft, "default"):
        return str(ft.default).lower()
    return str(ft or "vector").lower()


def get_village_entry(district_code: str, taluk_code: str, village_code: str,
                      file_type: str = "vector") -> Optional[Dict[str, Any]]:
    """Metadata and resolved storage URIs for a single village."""
    dc_pad = normalize_code_segment(district_code, 2)
    tc_pad = normalize_code_segment(taluk_code, 2)
    vc_pad = normalize_code_segment(village_code, 3)
    ft = _clean_ft(file_type)

    combo = "%s_%s_%s" % (dc_pad, tc_pad, vc_pad)
    official = get_official_names_map().get(combo) or {}
    shp_path, geojson_path = find_village_file_on_demand(dc_pad, tc_pad, vc_pad, ft)

    return {
        "district_code": dc_pad,
        "taluk_code": tc_pad,
        "village_code": vc_pad,
        "combo_code": combo,
        "district_name": official.get("d") or "District %s" % dc_pad,
        "taluk_name": official.get("t") or "Taluk %s" % tc_pad,
        "village_name": official.get("v") or "Village %s" % vc_pad,
        "file_type": ft,
        "shp_path": shp_path,
        "geojson_path": geojson_path,
    }


def get_village_entries(district_code: str = "*", taluk_code: str = "*",
                        village_code: str = "*",
                        file_type: str = "vector") -> List[Dict[str, Any]]:
    """Village entries for a district / taluk / village scope."""
    dc_pad = normalize_code_segment(district_code, 2) if district_code and district_code != "*" else "*"
    tc_pad = normalize_code_segment(taluk_code, 2) if taluk_code and taluk_code != "*" else "*"
    vc_pad = normalize_code_segment(village_code, 3) if village_code and village_code != "*" else "*"
    ft = _clean_ft(file_type)

    if dc_pad != "*" and tc_pad != "*" and vc_pad != "*":
        entry = get_village_entry(dc_pad, tc_pad, vc_pad, ft)
        return [entry] if entry else []

    if dc_pad != "*" and tc_pad != "*":
        entries = []
        for v in get_villages_by_taluk(dc_pad, tc_pad):
            e = get_village_entry(dc_pad, tc_pad, v["village_code"], ft)
            if e:
                entries.append(e)
        return entries

    if dc_pad != "*":
        entries = []
        for t in get_taluks_by_district(dc_pad):
            for v in get_villages_by_taluk(dc_pad, t["taluk_code"]):
                e = get_village_entry(dc_pad, t["taluk_code"], v["village_code"], ft)
                if e and (e["geojson_path"] or e["shp_path"]):
                    entries.append(e)
        return entries

    return []


def get_gis_entries(force_refresh: bool = False) -> List[Dict[str, Any]]:
    """Compatibility getter for vector entries."""
    return []


def get_item_by_level_and_code(level: str, code: str,
                               q_dist: Optional[str] = None,
                               q_tal: Optional[str] = None,
                               q_vil: Optional[str] = None,
                               file_type: str = "vector") -> Optional[Dict[str, Any]]:
    clean_code = code.replace(".zip", "").strip() if code else ""
    parts = clean_code.split("_") if clean_code else []

    dc = normalize_code_segment(q_dist, 2) if q_dist else (
        normalize_code_segment(parts[0], 2) if len(parts) >= 1 and parts[0] else "")
    tc = normalize_code_segment(q_tal, 2) if q_tal else (
        normalize_code_segment(parts[1], 2) if len(parts) >= 2 and parts[1] else "")
    vc = normalize_code_segment(q_vil, 3) if q_vil else (
        normalize_code_segment(parts[2], 3) if len(parts) >= 3 and parts[2] else "")

    if dc and tc and vc:
        return get_village_entry(dc, tc, vc, file_type)
    return None


def search_gis_index(query: str, limit: int = 50,
                     level_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """In-memory search over the official TN boundary index (names and codes)."""
    if not query or len(query.strip()) < 1:
        return []

    q = query.strip().lower()
    q_clean = re.sub(r'^(dist_|district_|tal_|taluk_|vil_|village_|sf_|survey_|sy_|parcel_)', '', q).strip()
    q_norm = re.sub(r"[\s\-\/\.]+", "_", q_clean)
    q_digits = re.sub(r"\D", "", q_clean)

    # Census TN prefix (3301 -> district 01, 330103 -> taluk 03 of district 01).
    census_dist = None
    census_tal = None
    census_vil = None
    if q_digits.startswith('33'):
        if len(q_digits) in (3, 4):
            census_dist = q_digits[2:4].zfill(2)
        elif len(q_digits) in (5, 6):
            census_dist = q_digits[2:4].zfill(2)
            census_tal = q_digits[4:6].zfill(2)
        elif len(q_digits) in (7, 8, 9):
            census_dist = q_digits[2:4].zfill(2)
            census_tal = q_digits[4:6].zfill(2)
            census_vil = q_digits[6:].zfill(3)

    tokens = [t for t in re.split(r'[\s\-\/\._,]+', q_clean) if t]
    num_tokens = [t for t in tokens if t.isdigit()]

    stopwords = {"district", "taluk", "village", "survey", "parcel", "code", "no",
                 "number", "the", "in", "of", "tn", "tamil", "nadu"}
    search_tokens = [t for t in tokens if t not in stopwords] or tokens

    has_village_hint = any(w in q for w in ["village", "vil", "villages", "gram", "panchayat"])
    has_taluk_hint = any(w in q for w in ["taluk", "taluka", "tk", "tehsil", "block"])
    has_district_hint = any(w in q for w in ["district", "dist", "dt", "districts"])

    norm_filter = (level_filter or "all").lower().strip()
    official_map = get_official_names_map()

    results: List[Dict[str, Any]] = []
    seen_keys = set()

    def all_tokens_in(text_to_search: str) -> bool:
        lower_text = text_to_search.lower()
        return all(tok in lower_text for tok in search_tokens)

    # 1. Districts
    if norm_filter in ("all", "district"):
        unique_districts: Dict[str, str] = {}
        for combo, item in official_map.items():
            parts = combo.split("_")
            if parts:
                dc = pad_code(parts[0])
                if dc not in unique_districts:
                    unique_districts[dc] = item.get("d") or "District %s" % dc

        for dc, dn in unique_districts.items():
            dn_lower = dn.lower()
            dc_clean = dc.lstrip("0") or "0"
            score = 0
            is_match = False

            if census_dist and dc == census_dist and not census_tal:
                is_match = True; score = 260
            elif len(num_tokens) == 1 and (num_tokens[0].zfill(2) == dc or num_tokens[0] == dc_clean):
                is_match = True; score = 250
            elif dc == q_clean or "dist_%s" % dc == q or "dist_%s" % dc_clean == q:
                is_match = True; score = 240
            elif dn_lower == q:
                is_match = True; score = 200
            elif dn_lower.startswith(q):
                is_match = True; score = 160
            elif len(search_tokens) > 1 and all_tokens_in("%s %s %s" % (dn, dc, dc_clean)):
                is_match = True; score = 120
            elif q in dn_lower:
                is_match = True; score = 110
            elif q_digits and (dc.startswith(q_digits) or dc_clean.startswith(q_digits)):
                is_match = True; score = 95

            if is_match:
                if has_district_hint:
                    score += 20
                seen_keys.add("dist_%s" % dc)
                results.append({
                    "code": dc,
                    "code_display": dc,
                    "name": dn,
                    "level": "district",
                    "district_code": dc,
                    "district_name": dn,
                    "location_text": "District: %s • Tamil Nadu" % dc,
                    "score": score,
                })

    # 2. Taluks
    if norm_filter in ("all", "taluk"):
        unique_taluks: Dict[Tuple[str, str], Tuple[str, str]] = {}
        for combo, item in official_map.items():
            parts = combo.split("_")
            if len(parts) >= 2:
                dc = pad_code(parts[0])
                tc = pad_code(parts[1])
                pair = (dc, tc)
                if pair not in unique_taluks:
                    unique_taluks[pair] = (
                        item.get("t") or "Taluk %s" % tc,
                        item.get("d") or "District %s" % dc,
                    )

        for (dc, tc), (tn, dn) in unique_taluks.items():
            tn_lower = tn.lower()
            tc_clean = tc.lstrip("0") or "0"
            combo_dt = "%s_%s" % (dc, tc)
            combo_clean = "%s_%s" % (dc.lstrip('0') or '0', tc_clean)
            score = 0
            is_match = False

            if census_dist and census_tal and dc == census_dist and tc == census_tal and not census_vil:
                is_match = True; score = 260
            elif len(num_tokens) == 2 and num_tokens[0].zfill(2) == dc and num_tokens[1].zfill(2) == tc:
                is_match = True; score = 250
            elif combo_dt == q_norm or combo_clean == q_norm or "tal_%s" % combo_dt == q:
                is_match = True; score = 240
            elif len(num_tokens) == 1 and (num_tokens[0].zfill(2) == tc or num_tokens[0] == tc_clean
                                           or num_tokens[0].zfill(2) == dc or num_tokens[0] == dc.lstrip("0")):
                is_match = True; score = 170
            elif tn_lower == q:
                is_match = True; score = 195
            elif tn_lower.startswith(q):
                is_match = True; score = 150
            elif len(search_tokens) > 1 and all_tokens_in("%s %s %s %s %s" % (tn, dn, tc, dc, combo_dt)):
                is_match = True; score = 120
            elif q in tn_lower or combo_dt.startswith(q_norm):
                is_match = True; score = 100

            if is_match:
                if has_taluk_hint:
                    score += 20
                key = "tal_%s" % combo_dt
                if key not in seen_keys:
                    seen_keys.add(key)
                    results.append({
                        "code": combo_dt,
                        "code_display": combo_dt,
                        "name": tn,
                        "level": "taluk",
                        "district_code": dc,
                        "district_name": dn,
                        "taluk_code": tc,
                        "taluk_name": tn,
                        "location_text": "Taluk: %s • District: %s (%s)" % (tc, dn, dc),
                        "score": score,
                    })

    # 3. Villages
    if norm_filter in ("all", "village"):
        for combo, item in official_map.items():
            parts = combo.split("_")
            if len(parts) < 3:
                continue
            dc = pad_code(parts[0])
            tc = pad_code(parts[1])
            vc = pad_code(parts[2]).zfill(3)
            combo_full = "%s_%s_%s" % (dc, tc, vc)
            vn = item.get("v") or "Village %s" % vc
            tn = item.get("t") or "Taluk %s" % tc
            dn = item.get("d") or "District %s" % dc
            vn_lower = vn.lower()
            vc_clean = vc.lstrip("0") or "0"

            score = 0
            is_match = False

            if (census_dist and census_tal and census_vil
                    and dc == census_dist and tc == census_tal and vc == census_vil):
                is_match = True; score = 270
            elif (len(num_tokens) == 3 and num_tokens[0].zfill(2) == dc
                  and num_tokens[1].zfill(2) == tc
                  and (num_tokens[2].zfill(3) == vc or num_tokens[2] == vc_clean)):
                is_match = True; score = 260
            elif (combo_full == q_norm or combo == q_norm
                  or "%s_%s_%s" % (dc, tc, vc_clean) == q_norm
                  or "vil_%s" % combo_full == q):
                is_match = True; score = 250
            elif len(num_tokens) == 1 and (num_tokens[0].zfill(3) == vc or num_tokens[0] == vc_clean
                                           or num_tokens[0].zfill(2) == dc or num_tokens[0] == dc.lstrip("0")):
                is_match = True; score = 145
            elif vn_lower == q:
                is_match = True; score = 190
            elif vn_lower.startswith(q):
                is_match = True; score = 140
            elif len(search_tokens) > 1 and all_tokens_in(
                    "%s %s %s %s %s %s %s" % (vn, tn, dn, vc, tc, dc, combo_full)):
                is_match = True; score = 110
            elif q in vn_lower or combo_full.startswith(q_norm):
                is_match = True; score = 85

            if is_match:
                if has_village_hint:
                    score += 20
                key = "vil_%s" % combo_full
                if key not in seen_keys:
                    seen_keys.add(key)
                    results.append({
                        "code": combo_full,
                        "code_display": combo_full,
                        "name": vn,
                        "level": "village",
                        "district_code": dc,
                        "district_name": dn,
                        "taluk_code": tc,
                        "taluk_name": tn,
                        "village_code": vc,
                        "village_name": vn,
                        "location_text": "Village: %s • Taluk: %s • District: %s" % (vc, tn, dn),
                        "score": score,
                    })
                    if len(results) >= limit * 2:
                        break

    # 4. Survey number / cadastral parcel
    if norm_filter in ("all", "parcel"):
        survey_match = re.match(
            r'^(?:survey|sf|sy|parcel|plot|sno|sf\.no)?\s*(\d+(?:[\/_][a-zA-Z0-9]+)?)$', q.strip())
        if survey_match:
            s_val = survey_match.group(1).replace('_', '/')
            base_s = s_val.split('/')[0]
            sub_s = s_val.split('/')[1] if '/' in s_val else ''
            results.append({
                "code": "parcel_%s" % s_val,
                "code_display": s_val,
                "name": "Survey No. %s" % s_val,
                "level": "parcel",
                "survey_no": s_val,
                "base_survey": base_s,
                "subdivision": sub_s,
                "location_text": "Survey: %s • Cadastral Parcel" % s_val,
                "score": 230,
            })

    results.sort(key=lambda r: r.get("score", 0), reverse=True)
    return results[:limit]
