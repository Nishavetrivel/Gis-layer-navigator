"""
GET /api/parcels
────────────────
Survey-number parcels for one or more villages, read out of each village's
vector (or FMB) layer.
"""

import re
from typing import Any, Dict, List

from core import gisfs
from core.http import Request, json_response, cache_headers
from db import get_village_entry, normalize_code_segment
from services.geometry_service import load_geojson_file

_SURVEY_KEYS = ("survey_no", "SURVEY_NO", "sno", "KIDE", "sf_no")


def handle(request: Request) -> Dict[str, Any]:
    v_param = request.q("village_code", "village", "villageCode", default="") or ""
    t_param = request.q("taluk_code", "taluk", "talukCode", default="") or ""
    d_param = request.q("district_code", "district", "districtCode", default="") or ""
    file_type = request.q("type", default="vector") or "vector"

    vil_entries = [v.strip() for v in v_param.split(",") if v.strip()]
    all_parcels: List[Dict[str, Any]] = []
    seen = set()

    for raw_v in vil_entries:
        parts = raw_v.split("_")
        if len(parts) >= 3:
            dc = normalize_code_segment(parts[0], 2)
            tc = normalize_code_segment(parts[1], 2)
            vc = normalize_code_segment(parts[2], 3)
        else:
            dc = normalize_code_segment(d_param.split(",")[0], 2) if d_param else "01"
            tc = normalize_code_segment(t_param.split(",")[0], 2) if t_param else "01"
            vc = normalize_code_segment(raw_v, 3)

        entry = get_village_entry(dc, tc, vc, file_type)
        # FMB coverage is partial; fall back to the vector layer for that village.
        if file_type == "fmb" and not _has_geojson(entry):
            entry = get_village_entry(dc, tc, vc, "vector")
        if not _has_geojson(entry):
            continue

        raw = load_geojson_file(entry["geojson_path"])
        if not raw:
            continue
        feats = raw.get("features", []) if raw.get("type") == "FeatureCollection" else [raw]

        for feat in feats:
            props = feat.get("properties") or {}
            raw_s = ""
            for key in _SURVEY_KEYS:
                if props.get(key):
                    raw_s = str(props[key]).strip()
                    break
            if not raw_s:
                continue

            full_p_code = "%s_%s_%s_%s" % (
                entry["district_code"], entry["taluk_code"], entry["village_code"], raw_s,
            )
            if full_p_code in seen:
                continue
            seen.add(full_p_code)

            base_survey = raw_s.split("/")[0] if "/" in raw_s else raw_s.split("_")[0]
            subdivision = raw_s.split("/")[1] if "/" in raw_s else ""

            all_parcels.append({
                "code": full_p_code,
                "survey_no": raw_s,
                "base_survey": base_survey,
                "subdivision": subdivision,
                "name": "Survey %s" % raw_s,
                "district_code": entry["district_code"],
                "taluk_code": entry["taluk_code"],
                "village_code": entry["village_code"],
                "land_type": props.get("land_type") or props.get("type") or "Cadastral",
                "area_acres": props.get("area_acres") or props.get("area") or 0.0,
                "file_path": entry.get("shp_path", ""),
                "geojson_path": entry.get("geojson_path", ""),
            })

    # Natural sort so 2 precedes 10 and 2/1 follows 2.
    all_parcels.sort(
        key=lambda x: [int(c) if c.isdigit() else c
                       for c in re.split(r'(\d+)', x["survey_no"])]
    )
    return json_response(all_parcels, headers=cache_headers(600))


def _has_geojson(entry) -> bool:
    return bool(entry and entry.get("geojson_path") and gisfs.exists(entry["geojson_path"]))
