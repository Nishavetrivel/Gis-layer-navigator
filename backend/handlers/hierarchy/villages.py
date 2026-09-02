"""
GET /api/villages
─────────────────
Villages for one or more taluks. Taluk entries may be bare codes or
``district_taluk`` pairs, comma-separated.
"""

from typing import Any, Dict, List

from core.http import Request, json_response, cache_headers
from db import get_villages_by_taluk, normalize_code_segment


def handle(request: Request) -> Dict[str, Any]:
    t_param = request.q("taluk_code", "taluk", "talukCode", default="") or ""
    d_param = request.q("district_code", "district", "districtCode", default="") or ""

    tal_entries = [t.strip() for t in t_param.split(",") if t.strip()]
    dist_codes = [
        normalize_code_segment(d.strip(), 2) for d in d_param.split(",") if d.strip()
    ]

    all_villages: List[Dict[str, str]] = []
    seen = set()
    for raw_t in tal_entries:
        parts = raw_t.split("_")
        if len(parts) >= 2:
            dc = normalize_code_segment(parts[0], 2)
            tc = normalize_code_segment(parts[1], 2)
        else:
            dc = dist_codes[0] if dist_codes else "01"
            tc = normalize_code_segment(raw_t, 2)

        for v in get_villages_by_taluk(dc, tc):
            vc = v.get("code") or v.get("village_code") or ""
            full_code = "%s_%s_%s" % (dc, tc, vc)
            if full_code in seen:
                continue
            seen.add(full_code)
            all_villages.append({
                "code": full_code,
                "village_code": vc,
                "name": v.get("name") or v.get("village_name") or "Village %s" % vc,
                "taluk_code": tc,
                "district_code": dc,
            })

    return json_response(all_villages, headers=cache_headers(3600))
