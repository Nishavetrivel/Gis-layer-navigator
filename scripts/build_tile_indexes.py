#!/usr/bin/env python3
"""
scripts/build_tile_indexes.py
─────────────────────────────
Build the sqlite R-Tree tile indexes ahead of deployment.

The tile function refuses to index a large layer inside a request — the water
bodies index alone is ~170 MB and takes minutes to build. Instead the indexes
are produced here and published to ``GIS_TILE_INDEX_URI``; at request time a
Lambda mirrors the one index it needs into /tmp, once per container.

Usage
─────
    python scripts/build_tile_indexes.py                       # all layers, local
    python scripts/build_tile_indexes.py --layer tnrd_roads    # one layer
    python scripts/build_tile_indexes.py --data-uri s3://bucket/gis --publish
    python scripts/build_tile_indexes.py --force               # rebuild existing
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-uri", default="",
                        help="Root data URI. Defaults to GIS_DATA_URI or ./data.")
    parser.add_argument("--layer", action="append", default=[],
                        help="Layer id to build. Repeatable; omit for all layers.")
    parser.add_argument("--include-fmb", action="store_true",
                        help="Also index the merged FMB district-01 layer.")
    parser.add_argument("--publish", action="store_true",
                        help="Upload each index to GIS_TILE_INDEX_URI when it lives in S3.")
    parser.add_argument("--force", action="store_true",
                        help="Rebuild even when a published index already exists.")
    parser.add_argument("--out", default="",
                        help="Local output directory (default: <data>/cache).")
    args = parser.parse_args(argv)

    if args.data_uri:
        os.environ["GIS_DATA_URI"] = args.data_uri

    from core import config, gisfs
    from mvt_service import vector_tile_manager
    from services.cart_layer_service import CART_LAYER_DEFINITIONS, find_cart_layer_file

    out_dir = args.out or (
        config.CACHE_URI if not config.is_s3(config.CACHE_URI) else "./data/cache"
    )
    os.makedirs(out_dir, exist_ok=True)
    print("Data root : %s" % config.GIS_DATA_URI)
    print("Index dest: %s" % (config.TILE_INDEX_URI if args.publish else out_dir))

    jobs = []
    wanted = set(args.layer)
    for defn in CART_LAYER_DEFINITIONS:
        if wanted and defn["id"] not in wanted:
            continue
        jobs.append((defn["id"], find_cart_layer_file(defn["id"])))

    if args.include_fmb or config.FMB_LAYER_ID in wanted:
        jobs.append((config.FMB_LAYER_ID, config.FMB_MERGED_URI))

    built = 0
    skipped = 0
    for layer_id, source in jobs:
        if not source or not gisfs.exists(source):
            print("  skip %-45s (no source layer found)" % layer_id)
            skipped += 1
            continue

        published = vector_tile_manager.index_object_uri(layer_id)
        if not args.force and gisfs.exists(published) \
                and gisfs.getmtime(published) >= gisfs.getmtime(source):
            print("  skip %-45s (index already current)" % layer_id)
            skipped += 1
            continue

        dest = os.path.join(out_dir, "tile_index_%s.sqlite" % layer_id)
        started = time.time()
        print("  build %-44s <- %s" % (layer_id, source))
        result = vector_tile_manager.build_index(layer_id, source, destination=dest)
        if not result:
            print("    FAILED")
            continue

        size_mb = os.path.getsize(result) / 1048576.0
        print("    %.1f MB in %.1fs" % (size_mb, time.time() - started))
        built += 1

        if args.publish and config.is_s3(published):
            gisfs.upload_file(result, published, "application/vnd.sqlite3")
            print("    published -> %s" % published)

    print("\n%d built, %d skipped." % (built, skipped))
    if not args.publish:
        print("Indexes are local only. Re-run with --publish, or upload %s "
              "with scripts/sync_data_to_s3.py." % out_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
