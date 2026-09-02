"""
GET /api/taluks
───────────────
Taluks for one or more districts. Accepts ``district_code``, ``district`` or
``districtCode``, each optionally comma-separated.
"""

from typing import Any, Dict, List

from core.http import Request, json_response, cache_headers
from db import get_taluks_by_district, normalize_code_segment


def handle(request: Request) -> Dict[str, Any]:
    d_param = request.q("district_code", "district", "districtCode", default="") or ""
    dist_codes = [
        normalize_code_segment(d.strip(), 2) for d in d_param.split(",") if d.strip()
    ]

    all_taluks: List[Dict[str, str]] = []
    seen = set()
    for dc in dist_codes:
        for t in get_taluks_by_district(dc):
            t_code = t.get("code") or t.get("taluk_code") or ""
            # Multi-district queries need the district prefix to stay unambiguous.
            full_code = "%s_%s" % (dc, t_code) if len(dist_codes) > 1 else t_code
            if full_code in seen:
                continue
            seen.add(full_code)
            all_taluks.append({
                "code": full_code,
                "taluk_code": t_code,
                "name": t.get("name") or t.get("taluk_name") or "Taluk %s" % t_code,
                "district_code": dc,
            })

    return json_response(all_taluks, headers=cache_headers(3600))
