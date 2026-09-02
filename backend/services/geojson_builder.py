"""
backend/services/geojson_builder.py
───────────────────────────────────
Hierarchical GeoJSON merging, normalization, multi-selection aggregation,
and in-memory RAM caching for instant sub-millisecond layer delivery.
"""

import re
from typing import Optional, Any, Dict, List

from core import gisfs
from services.geometry_service import (
    load_geojson_file,
    compute_geojson_bounds_and_features,
)
from db import (
    get_all_district_files,
    get_district_file,
    get_taluk_files_by_district,
    get_village_entries,
    get_official_names_map,
    normalize_code_segment,
    format_clean_survey,
)

memory_geojson_cache: Dict[str, Any] = {}

async def build_merged_geojson(
    level: str,
    code: str,
    q_dist: Optional[str] = None,
    q_tal: Optional[str] = None,
    q_vil: Optional[str] = None,
    file_type: str = "vector",
    survey_no: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Constructs and merges GeoJSON FeatureCollections across District, Taluk, Village,
    and Parcel hierarchical tiers with in-memory caching.
    """
    # Handle comma-separated multi-code selection (e.g., '026,020,025')
    if code and "," in code:
        multi_codes = [c.strip() for c in code.split(",") if c.strip()]
        if len(multi_codes) > 1:
            all_sub_features: List[Dict[str, Any]] = []
            for sub_c in multi_codes:
                sub_res = await build_merged_geojson(
                    level=level,
                    code=sub_c,
                    q_dist=q_dist,
                    q_tal=q_tal,
                    q_vil=None if level == "village" else q_vil,
                    file_type=file_type,
                    survey_no=survey_no,
                )
                feats = (sub_res.get("geojson") or {}).get("features") or []
                all_sub_features.extend(feats)
            
            bbox, total_area = compute_geojson_bounds_and_features(all_sub_features)
            return {
                "success": True,
                "level": level,
                "code": code,
                "name": f"{len(multi_codes)} {level.capitalize()}s",
                "file_type": file_type,
                "feature_count": len(all_sub_features),
                "bbox": bbox,
                "total_area": total_area,
                "geojson": {
                    "type": "FeatureCollection",
                    "features": all_sub_features
                }
            }

    # Infer hierarchical codes from level and code if not explicitly given
    if level == "district" and code and code != "all" and not q_dist:
        q_dist = code
    elif level == "taluk" and code and not q_tal:
        parts = code.split("_")
        if len(parts) >= 2:
            if not q_dist: q_dist = parts[0]
            q_tal = parts[1]
        else:
            q_tal = code
    elif level == "village" and code and not q_vil:
        parts = code.split("_")
        if len(parts) >= 3:
            if not q_dist: q_dist = parts[0]
            if not q_tal: q_tal = parts[1]
            q_vil = parts[2]
        else:
            q_vil = code
    elif level == "parcel" and code and not survey_no:
        parts = code.split("_")
        if len(parts) >= 4:
            if not q_dist: q_dist = parts[0]
            if not q_tal: q_tal = parts[1]
            if not q_vil: q_vil = parts[2]
            survey_no = "_".join(parts[3:])
        else:
            survey_no = code

    dc = normalize_code_segment(q_dist, 2) if q_dist else "*"
    tc = normalize_code_segment(q_tal, 2) if q_tal else "*"
    vc = normalize_code_segment(q_vil, 3) if q_vil else "*"
    ft = (file_type or "vector").lower().strip()
    is_vector = (ft == "vector")

    raw_dist = dc if dc != "*" else ""
    raw_tal = tc if tc != "*" else ""
    raw_vil = vc if vc != "*" else ""
    raw_sno = survey_no or ""

    # Check In-Memory RAM Cache first for sub-millisecond response
    cache_key = f"{level}_{code}_{raw_dist}_{raw_tal}_{raw_vil}_{raw_sno}_{ft}"
    if cache_key in memory_geojson_cache:
        return memory_geojson_cache[cache_key]

    official_map = get_official_names_map()

    # 1. District Level: Check District 2 directory
    if level == "district":
        all_dist_files = get_all_district_files()
        all_feats: List[Dict[str, Any]] = []

        if code in ("all", "*", ""):
            # Load master or aggregate all district files
            master_file = get_district_file("all", "")
            if master_file:
                raw = load_geojson_file(master_file)
                if raw:
                    feats = raw.get("features", []) if raw.get("type") == "FeatureCollection" else [raw]
                    if len(feats) > 1:
                        all_feats = feats

            # If master had <=1 features and multiple files exist, aggregate all files
            if len(all_feats) <= 1 and len(all_dist_files) > 1:
                all_feats = []
                for df in all_dist_files:
                    raw = load_geojson_file(df)
                    if raw:
                        feats = raw.get("features", []) if raw.get("type") == "FeatureCollection" else [raw]
                        for f in feats:
                            props = f.get("properties") or {}
                            if not props.get("district_c") and not props.get("DISTRICT_C"):
                                m_code = re.search(r"(\d+)", gisfs.basename(df))
                                if m_code:
                                    props["district_c"] = int(m_code.group(1))
                            all_feats.append(f)
        else:
            # Single district requested
            dc_clean = normalize_code_segment(code, 2)
            dc_int = int(dc_clean) if dc_clean.isdigit() else None
            d_name_lower = (raw_dist or code or "").lower().strip()

            # Search official map for district name if needed
            if not d_name_lower or d_name_lower == dc_clean or d_name_lower.isdigit():
                for k, v in official_map.items():
                    if normalize_code_segment(k.split("_")[0], 2) == dc_clean and v.get("d"):
                        d_name_lower = v["d"].lower().strip()
                        break

            # Try specific file first, then fall back to scanning all district files
            dist_file = get_district_file(code, raw_dist or d_name_lower)
            candidate_files = [dist_file] if dist_file and gisfs.exists(dist_file) else []
            for df in all_dist_files:
                if df not in candidate_files:
                    candidate_files.append(df)

            for cf in candidate_files:
                if not cf or not gisfs.exists(cf):
                    continue
                raw = load_geojson_file(cf)
                if not raw:
                    continue
                feats = raw.get("features", []) if raw.get("type") == "FeatureCollection" else [raw]
                for feat in feats:
                    props = feat.get("properties") or {}
                    feat_code_raw = (
                        props.get("district_c") or props.get("DISTRICT_C") or
                        props.get("dist_code") or props.get("DIST_CODE") or
                        props.get("district_code") or props.get("DISTRICT_CODE") or
                        props.get("dist_id") or props.get("DIST_ID") or
                        props.get("dt_code") or props.get("DT_CODE") or ""
                    )
                    feat_name = str(
                        props.get("dist_name") or props.get("DIST_NAME") or
                        props.get("district_name") or props.get("DISTRICT_NAME") or
                        props.get("name") or props.get("NAME") or
                        props.get("District") or props.get("DISTRICT") or ""
                    ).lower().strip()

                    feat_digits = re.sub(r"\D", "", str(feat_code_raw))
                    feat_int = int(feat_digits) if feat_digits else None
                    feat_pad = normalize_code_segment(feat_digits, 2) if feat_digits else ""

                    if dc_int is not None and feat_int is not None and feat_int == dc_int:
                        all_feats.append(feat)
                        continue
                    if dc_clean and feat_pad and feat_pad == dc_clean:
                        all_feats.append(feat)
                        continue
                    if d_name_lower and len(d_name_lower) >= 3 and feat_name:
                        if d_name_lower in feat_name or feat_name in d_name_lower:
                            all_feats.append(feat)
                            continue

                if all_feats:
                    break

        if all_feats:
            # Normalize properties
            for f in all_feats:
                p = f.get("properties") or {}
                d_c = p.get("district_c") or p.get("DISTRICT_C") or p.get("dist_code") or p.get("dist_id") or code
                d_pad = normalize_code_segment(str(d_c), 2)
                d_n = p.get("dist_name") or p.get("DIST_NAME") or p.get("district_name") or f"District {d_pad}"
                p["district_code"] = d_pad
                p["district_name"] = str(d_n)
                p["name"] = str(d_n)

            bbox, total_area = compute_geojson_bounds_and_features(all_feats)
            result = {
                "success": True,
                "level": level,
                "code": code or "all",
                "name": all_feats[0].get("properties", {}).get("district_name", code),
                "file_type": ft,
                "feature_count": len(all_feats),
                "bbox": bbox,
                "total_area": total_area,
                "geojson": {
                    "type": "FeatureCollection",
                    "features": all_feats
                }
            }
            memory_geojson_cache[cache_key] = result
            return result

    # 2. Taluk Level: Check Taluk 5 directory
    if level == "taluk":
        tal_files = get_taluk_files_by_district(raw_dist or code)
        all_feats = []

        dc_clean = normalize_code_segment(raw_dist, 2) if raw_dist else ""
        dc_int = int(dc_clean) if dc_clean.isdigit() else None
        
        tal_raw = raw_tal or code or ""
        tal_seg = tal_raw.split("_")[-1] if "_" in tal_raw else tal_raw
        tc_clean = normalize_code_segment(tal_seg, 2) if tal_seg else ""
        tc_int = int(tc_clean) if tc_clean.isdigit() else None

        for tal_file in tal_files:
            if not tal_file or not gisfs.exists(tal_file):
                continue
            raw_data = load_geojson_file(tal_file)
            if not raw_data:
                continue
            feats = raw_data.get("features", []) if raw_data.get("type") == "FeatureCollection" else [raw_data]
            
            for feat in feats:
                props = feat.get("properties") or {}
                feat_dc = props.get("district_c") or props.get("DISTRICT_C") or props.get("dist_id") or props.get("dist_code")
                feat_tc = props.get("Taluk_code") or props.get("taluk_code") or props.get("TALUK_CODE") or props.get("taluk_id") or props.get("t_code")

                matches_dist = True
                if dc_int is not None and feat_dc is not None:
                    try:
                        matches_dist = (int(feat_dc) == dc_int)
                    except (ValueError, TypeError):
                        matches_dist = False

                matches_taluk = True
                if tc_int is not None and feat_tc is not None:
                    try:
                        matches_taluk = (int(feat_tc) == tc_int)
                    except (ValueError, TypeError):
                        matches_taluk = False

                if matches_dist and (tc_int is None or matches_taluk):
                    # Attach normalized properties
                    d_pad = normalize_code_segment(str(feat_dc), 2) if feat_dc is not None else dc_clean
                    t_pad = normalize_code_segment(str(feat_tc), 2) if feat_tc is not None else tc_clean
                    t_name = str(props.get("talukname") or props.get("taluk_name") or props.get("TALUKNAME") or f"Taluk {t_pad}").strip()
                    props["district_code"] = d_pad
                    props["taluk_code"] = t_pad
                    props["taluk_name"] = t_name
                    props["name"] = t_name
                    all_feats.append(feat)

        if all_feats:
            taluk_name = all_feats[0].get("properties", {}).get("taluk_name", code)
            bbox, total_area = compute_geojson_bounds_and_features(all_feats)
            result = {
                "success": True,
                "level": level,
                "code": code,
                "name": taluk_name or code,
                "file_type": ft,
                "feature_count": len(all_feats),
                "bbox": bbox,
                "total_area": total_area,
                "geojson": {
                    "type": "FeatureCollection",
                    "features": all_feats
                }
            }
            memory_geojson_cache[cache_key] = result
            return result

    # 3. Village & Parcel Level
    entries = get_village_entries(dc, tc, vc, ft)
    if not entries and ft == "fmb":
        # Fallback to vector only if FMB is truly not available on disk
        ft = "vector"
        is_vector = True
        entries = get_village_entries(dc, tc, vc, "vector")
    all_features: List[Dict[str, Any]] = []

    clean_survey = format_clean_survey(survey_no or "", is_vector) if survey_no else ""

    for entry in entries:
        gpath = entry.get("geojson_path")
        if not gpath or not gisfs.exists(gpath):
            continue

        raw = load_geojson_file(gpath)
        if not raw:
            continue

        feats = raw.get("features", []) if raw.get("type") == "FeatureCollection" else [raw]

        for feat in feats:
            props = dict(feat.get("properties") or {})
            props["district_code"] = entry["district_code"]
            props["taluk_code"] = entry["taluk_code"]
            props["village_code"] = entry["village_code"]
            props["district_name"] = entry["district_name"]
            props["taluk_name"] = entry["taluk_name"]
            props["village_name"] = entry["village_name"]

            raw_s = str(props.get("survey_no") or props.get("SURVEY_NO") or props.get("sno") or props.get("KIDE") or props.get("sf_no") or "").strip()
            props["survey_no"] = raw_s
            is_sub = ("/" in raw_s) or bool(props.get("subdivision")) or (entry.get("file_type") == "fmb" and "/" in str(props.get("KIDE", "")))
            props["is_subdivision"] = bool(is_sub)
            props["color_type"] = "subdivision" if is_sub else "parcel"
            if is_sub:
                props["fmb"] = 1
                if "/" in raw_s:
                    props["base_survey"] = raw_s.split("/")[0]
                    props["subdivision"] = props.get("subdivision") or raw_s.split("/")[1]
            else:
                props["base_survey"] = raw_s
                props["subdivision"] = ""

            feat_copy = {
                "type": "Feature",
                "properties": props,
                "geometry": feat.get("geometry")
            }

            if clean_survey:
                raw_s = str(props.get("survey_no") or props.get("SURVEY_NO") or props.get("sno") or props.get("KIDE") or props.get("sf_no") or "").strip()
                cs = format_clean_survey(raw_s, is_vector)
                b_sno = raw_s.split("/")[0].strip().lower()
                clean_target = clean_survey.split("/")[0].strip().lower()
                if raw_s.lower() == clean_survey.lower() or cs.lower() == clean_survey.lower() or b_sno == clean_target:
                    all_features.append(feat_copy)
            else:
                all_features.append(feat_copy)

    bbox, total_area = compute_geojson_bounds_and_features(all_features)
    fc = {
        "type": "FeatureCollection",
        "features": all_features
    }

    base_features: List[Dict[str, Any]] = []
    if level in ("village", "parcel") and ft == "fmb":
        v_entries = get_village_entries(dc, tc, vc, "vector")
        for v_entry in v_entries:
            v_gpath = v_entry.get("geojson_path")
            if v_gpath and gisfs.exists(v_gpath):
                v_raw = load_geojson_file(v_gpath)
                if v_raw:
                    v_feats = v_raw.get("features", []) if v_raw.get("type") == "FeatureCollection" else [v_raw]
                    for vf in v_feats:
                        v_props = dict(vf.get("properties") or {})
                        v_sno = str(v_props.get("survey_no") or v_props.get("SURVEY_NO") or v_props.get("sno") or "").strip()
                        v_props["survey_no"] = v_sno
                        v_props["base_survey"] = v_sno
                        v_props["is_subdivision"] = False
                        v_props["color_type"] = "parcel"
                        v_props["district_name"] = v_entry.get("district_name")
                        v_props["taluk_name"] = v_entry.get("taluk_name")
                        v_props["village_name"] = v_entry.get("village_name")
                        base_features.append({
                            "type": "Feature",
                            "properties": v_props,
                            "geometry": vf.get("geometry")
                        })

    result = {
        "success": True,
        "level": level,
        "code": code,
        "file_type": ft,
        "feature_count": len(all_features),
        "bbox": bbox,
        "total_area": total_area,
        "geojson": fc,
        "base_geojson": {
            "type": "FeatureCollection",
            "features": base_features
        } if base_features else None
    }

    # Save to in-memory RAM cache if we have features
    if len(all_features) > 0:
        memory_geojson_cache[cache_key] = result

    return result
