#!/usr/bin/env python3
"""
scripts/build_startup_cache.py
──────────────────────────────
Pre-render the payloads the FastAPI server used to build in its startup thread.

A Lambda has no equivalent hook — every cold start would otherwise re-merge
every district and taluk boundary in the state. This script builds those two
collections once and writes them where ``handlers/geo/geojson.py`` looks:

    <cache>/startup_all_districts.json
    <cache>/startup_all_taluks.json

Run it against local data (writing into ./data/cache, then sync to S3), or
directly against the deployed bucket.

Usage
─────
    python scripts/build_startup_cache.py
    python scripts/build_startup_cache.py --data-uri s3://my-gis-bucket/gis
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-uri", default="",
                        help="Root data URI. Defaults to GIS_DATA_URI or ./data.")
    parser.add_argument("--only", choices=["district", "taluk"], default=None,
                        help="Build just one of the two payloads.")
    args = parser.parse_args(argv)

    if args.data_uri:
        os.environ["GIS_DATA_URI"] = args.data_uri

    from core import config, gisfs
    from core.asyncutil import run_sync
    from services.geojson_builder import build_merged_geojson

    print("Data root: %s" % config.GIS_DATA_URI)

    targets = [
        ("district", config.STARTUP_DISTRICT_URI),
        ("taluk", config.STARTUP_TALUK_URI),
    ]
    if args.only:
        targets = [t for t in targets if t[0] == args.only]

    for level, destination in targets:
        print("Building all-%s collection..." % level)
        result = run_sync(build_merged_geojson(level=level, code="all"))
        if not result or not result.get("success"):
            print("  failed: builder returned %r" % (result and result.get("error")),
                  file=sys.stderr)
            continue

        payload = json.dumps(result, ensure_ascii=False).encode("utf-8")
        feature_count = len((result.get("geojson") or {}).get("features") or [])
        gisfs.write_bytes(destination, payload, "application/json")
        print("  wrote %s (%d features, %.1f MB)"
              % (destination, feature_count, len(payload) / 1048576.0))

    print("\nDone. /api/geojson?level=district&code=all now answers from storage.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
