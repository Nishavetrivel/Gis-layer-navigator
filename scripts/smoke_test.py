#!/usr/bin/env python3
"""
scripts/smoke_test.py
─────────────────────
Invoke every endpoint through its real Lambda handler with a synthetic API
Gateway proxy event, and report the status each one returns.

This exercises the deployed code path — routing, parameter parsing, response
encoding — without AWS. Endpoints whose data is not present locally are
expected to answer 404/empty rather than raise; a 500 is a genuine failure.

    python scripts/smoke_test.py
    python scripts/smoke_test.py --data-uri s3://my-gis-bucket/gis
    python scripts/smoke_test.py --verbose
"""

import argparse
import json
import os
import sys
import time
import traceback

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, BACKEND)


def event(method, resource, path, query=None, path_params=None, body=None):
    return {
        "resource": resource,
        "path": path,
        "httpMethod": method,
        "headers": {"Content-Type": "application/json"},
        "queryStringParameters": query or None,
        "multiValueQueryStringParameters": {k: [v] for k, v in (query or {}).items()} or None,
        "pathParameters": path_params or None,
        "requestContext": {"stage": "test", "resourcePath": resource},
        "body": json.dumps(body) if body is not None else None,
        "isBase64Encoded": False,
    }


def cases():
    """(label, entrypoint module, event) for all 23 endpoints."""
    return [
        ("GET  /api/districts", "hierarchy_api",
         event("GET", "/api/districts", "/api/districts")),
        ("GET  /api/taluks", "hierarchy_api",
         event("GET", "/api/taluks", "/api/taluks", {"district_code": "01"})),
        ("GET  /api/villages", "hierarchy_api",
         event("GET", "/api/villages", "/api/villages", {"taluk_code": "01_01"})),
        ("GET  /api/parcels", "hierarchy_api",
         event("GET", "/api/parcels", "/api/parcels", {"village_code": "01_01_001"})),
        ("GET  /api/metadata", "hierarchy_api",
         event("GET", "/api/metadata", "/api/metadata", {"level": "district", "code": "01"})),
        ("GET  /api/search", "hierarchy_api",
         event("GET", "/api/search", "/api/search", {"q": "chennai", "limit": "5"})),

        ("GET  /api/cart-layers", "cart_api",
         event("GET", "/api/cart-layers", "/api/cart-layers")),
        ("GET  /api/cart-layers/list", "cart_api",
         event("GET", "/api/cart-layers/list", "/api/cart-layers/list")),
        ("GET  /api/cart-layer/{id}", "cart_api",
         event("GET", "/api/cart-layer/{layer_id}", "/api/cart-layer/generic_viewer_fire_stations",
               path_params={"layer_id": "generic_viewer_fire_stations"})),

        ("GET  /api/tiles/../{z}/{x}/{y}.pbf", "tiles_api",
         event("GET", "/api/tiles/{proxy+}",
               "/api/tiles/generic_viewer_fire_stations/10/735/475.pbf",
               path_params={"proxy": "generic_viewer_fire_stations/10/735/475.pbf"})),
        ("GET  /api/tiles/{id}/metadata", "tiles_api",
         event("GET", "/api/tiles/{proxy+}",
               "/api/tiles/generic_viewer_fire_stations/metadata",
               path_params={"proxy": "generic_viewer_fire_stations/metadata"})),
        ("GET  /api/fmb-tiles/{z}/{x}/{y}.pbf", "tiles_api",
         event("GET", "/api/fmb-tiles/{proxy+}", "/api/fmb-tiles/12/2941/1901.pbf",
               path_params={"proxy": "12/2941/1901.pbf"})),

        ("GET  /api/spatial/resolve", "spatial_api",
         event("GET", "/api/spatial/resolve", "/api/spatial/resolve",
               {"lat": "11.0", "lng": "78.5", "zoom": "8"})),
        ("GET  /api/spatial/viewport", "spatial_api",
         event("GET", "/api/spatial/viewport", "/api/spatial/viewport",
               {"min_lng": "78.0", "min_lat": "10.5", "max_lng": "79.0",
                "max_lat": "11.5", "zoom": "8"})),

        ("POST /api/spatial/clip/preview", "clip_api",
         event("POST", "/api/spatial/clip/preview", "/api/spatial/clip/preview",
               body={"clip_polygon": [78.0, 10.5, 78.2, 10.7],
                     "layer_ids": ["generic_viewer_fire_stations"]})),
        ("POST /api/spatial/clip/download", "clip_api",
         event("POST", "/api/spatial/clip/download", "/api/spatial/clip/download",
               body={"clip_polygon": [78.0, 10.5, 78.2, 10.7],
                     "layer_ids": ["generic_viewer_fire_stations"],
                     "format": "geojson"})),

        ("GET  /api/geojson", "geojson_api",
         event("GET", "/api/geojson", "/api/geojson", {"level": "district", "code": "01"})),
        ("GET  /api/auto-zoom-layer", "geojson_api",
         event("GET", "/api/auto-zoom-layer", "/api/auto-zoom-layer", {"level": "village"})),

        ("GET  /api/export", "export_api",
         event("GET", "/api/export", "/api/export",
               {"level": "district", "code": "01", "format": "geojson"})),
        ("GET  /api/download-zip", "export_api",
         event("GET", "/api/download-zip", "/api/download-zip",
               {"level": "village", "code": "01_01_001"})),
        ("GET  /api/download/{level}/{code}", "export_api",
         event("GET", "/api/download/{proxy+}", "/api/download/district/01",
               {"format": "geojson"}, path_params={"proxy": "district/01"})),
        ("POST /api/export-polygon", "export_api",
         event("POST", "/api/export-polygon", "/api/export-polygon",
               body={"format": "geojson", "name": "smoke",
                     "geojson": {"type": "Polygon", "coordinates":
                                 [[[78.0, 10.5], [78.1, 10.5], [78.1, 10.6], [78.0, 10.5]]]}})),

        ("POST /api/ai/chat", "ai_api",
         event("POST", "/api/ai/chat", "/api/ai/chat", body={"prompt": "hello"})),
    ]


class Ctx:
    function_name = "smoke"
    memory_limit_in_mb = 3008
    aws_request_id = "smoke-test"

    def get_remaining_time_in_millis(self):
        return 300000


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-uri", default="")
    parser.add_argument("--verbose", action="store_true",
                        help="Print a snippet of each response body.")
    args = parser.parse_args(argv)

    repo = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    os.environ.setdefault("GIS_DATA_URI", args.data_uri or os.path.join(repo, "data"))
    os.environ.setdefault("GIS_LOCAL_CACHE_DIR", os.path.join(repo, "data", ".tmpcache"))
    if args.data_uri:
        os.environ["GIS_DATA_URI"] = args.data_uri

    import importlib

    handlers = {}
    for name in ("hierarchy_api", "cart_api", "tiles_api", "spatial_api",
                 "clip_api", "geojson_api", "export_api", "ai_api"):
        handlers[name] = importlib.import_module("functions.%s.app" % name).lambda_handler

    print("Data root: %s\n" % os.environ["GIS_DATA_URI"])
    print("%-40s %-8s %-9s %s" % ("ENDPOINT", "STATUS", "TIME", "SIZE"))
    print("-" * 74)

    failures = []
    for label, fn, ev in cases():
        started = time.time()
        try:
            result = handlers[fn](ev, Ctx())
            status = result.get("statusCode")
            size = len(result.get("body") or "")
            marker = "" if int(status) < 500 else "  <-- FAIL"
            if int(status) >= 500:
                failures.append((label, result.get("body")))
            print("%-40s %-8s %6.0fms  %8d%s"
                  % (label, status, (time.time() - started) * 1000, size, marker))
            if args.verbose:
                body = str(result.get("body") or "")[:220]
                print("      %s" % body.replace("\n", " "))
        except Exception as exc:
            failures.append((label, traceback.format_exc()))
            print("%-40s %-8s %6.0fms  %8s  <-- RAISED %s"
                  % (label, "EXC", (time.time() - started) * 1000, "-", exc))

    print("-" * 74)
    if failures:
        print("\n%d endpoint(s) failed:\n" % len(failures))
        for label, detail in failures:
            print("  %s\n    %s\n" % (label, str(detail)[:600]))
        return 1

    print("\nAll %d endpoints responded without a server error." % len(cases()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
