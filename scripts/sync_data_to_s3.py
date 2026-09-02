#!/usr/bin/env python3
"""
scripts/sync_data_to_s3.py
──────────────────────────
Upload the GIS data tree to the bucket the Lambda functions read from.

The functions never bundle data; they resolve every path under
``GIS_DATA_URI``. This script puts the local tree into that layout:

    <prefix>/cart_layers/*.geojson        thematic overlays
    <prefix>/cache/*.sqlite               pre-built tile indexes
    <prefix>/cache/merged_village_fast.geojson
    <prefix>/vector/dd/tt/vvv/...         village & parcel layers
    <prefix>/District 2/, <prefix>/Taluk 5/
    <prefix>/official_names.json
    <prefix>/fmb/district_01_merged_fmb.geojson
    <prefix>/tn_village_boundary/...

Usage
─────
    python scripts/sync_data_to_s3.py --bucket my-gis-bucket
    python scripts/sync_data_to_s3.py --bucket my-gis-bucket --source ./data --prefix gis
    python scripts/sync_data_to_s3.py --bucket my-gis-bucket --extra-root "D:/vector:vector"
    python scripts/sync_data_to_s3.py --bucket my-gis-bucket --dry-run

Existing objects are skipped when size and mtime already match, so re-running
after adding one district only uploads that district.
"""

import argparse
import concurrent.futures
import mimetypes
import os
import sys
import threading
from typing import Iterator, List, Optional, Tuple

try:
    import boto3
    from botocore.config import Config as BotoConfig
except ImportError:
    sys.exit("boto3 is required: pip install boto3")

CONTENT_TYPES = {
    ".geojson": "application/geo+json",
    ".json": "application/json",
    ".sqlite": "application/vnd.sqlite3",
    ".shp": "application/octet-stream",
    ".shx": "application/octet-stream",
    ".dbf": "application/dbase",
    ".prj": "text/plain",
    ".cpg": "text/plain",
    ".pkl": "application/octet-stream",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

SKIP_DIRS = {".git", "__pycache__", "node_modules", ".tmpcache", ".DS_Store"}

_printed = threading.Lock()


def content_type_for(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext in CONTENT_TYPES:
        return CONTENT_TYPES[ext]
    guessed, _ = mimetypes.guess_type(path)
    return guessed or "application/octet-stream"


def walk_files(root: str) -> Iterator[Tuple[str, str]]:
    """Yield (absolute path, path relative to root) for every file under root."""
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if name in SKIP_DIRS:
                continue
            full = os.path.join(dirpath, name)
            yield full, os.path.relpath(full, root).replace(os.sep, "/")


def existing_objects(s3, bucket: str, prefix: str) -> dict:
    """Map of key -> (size, epoch mtime) already present under the prefix."""
    out = {}
    paginator = s3.get_paginator("list_objects_v2")
    search = (prefix.strip("/") + "/") if prefix.strip("/") else ""
    for page in paginator.paginate(Bucket=bucket, Prefix=search):
        for obj in page.get("Contents") or []:
            out[obj["Key"]] = (obj["Size"], obj["LastModified"].timestamp())
    return out


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--bucket", required=True, help="Destination S3 bucket.")
    parser.add_argument("--prefix", default="gis", help="Key prefix (default: gis).")
    parser.add_argument("--source", default="data", help="Local data folder (default: ./data).")
    parser.add_argument(
        "--extra-root", action="append", default=[], metavar="LOCAL:REMOTE",
        help="Additional tree to upload, as LOCAL_PATH:REMOTE_SUBPREFIX. Repeatable.",
    )
    parser.add_argument("--workers", type=int, default=8, help="Parallel uploads (default: 8).")
    parser.add_argument("--force", action="store_true", help="Re-upload even if unchanged.")
    parser.add_argument("--dry-run", action="store_true", help="List what would upload.")
    args = parser.parse_args(argv)

    s3 = boto3.client("s3", config=BotoConfig(max_pool_connections=args.workers * 2,
                                              retries={"max_attempts": 5, "mode": "adaptive"}))

    roots: List[Tuple[str, str]] = []
    if os.path.isdir(args.source):
        roots.append((os.path.abspath(args.source), ""))
    else:
        print("warning: source %s does not exist" % args.source, file=sys.stderr)

    for spec in args.extra_root:
        # Split on the last colon so Windows drive letters survive.
        local, _, remote = spec.rpartition(":")
        if not local:
            print("skipping malformed --extra-root %r" % spec, file=sys.stderr)
            continue
        if not os.path.isdir(local):
            print("skipping missing --extra-root %s" % local, file=sys.stderr)
            continue
        roots.append((os.path.abspath(local), remote.strip("/")))

    if not roots:
        print("nothing to upload", file=sys.stderr)
        return 1

    print("Listing existing objects under s3://%s/%s ..." % (args.bucket, args.prefix))
    existing = {} if args.force else existing_objects(s3, args.bucket, args.prefix)
    print("  %d objects already present" % len(existing))

    pending: List[Tuple[str, str, int]] = []
    skipped = 0
    for root, sub in roots:
        for full, rel in walk_files(root):
            key_parts = [p for p in (args.prefix.strip("/"), sub, rel) if p]
            key = "/".join(key_parts)
            size = os.path.getsize(full)
            mtime = os.path.getmtime(full)
            prior = existing.get(key)
            # Same size and not newer locally: already uploaded.
            if prior and prior[0] == size and mtime <= prior[1] + 1:
                skipped += 1
                continue
            pending.append((full, key, size))

    total_bytes = sum(p[2] for p in pending)
    print("%d files to upload (%.1f MB), %d unchanged"
          % (len(pending), total_bytes / 1048576.0, skipped))

    if args.dry_run:
        for full, key, size in pending[:200]:
            print("  would upload %-70s -> %s (%.1f MB)" % (full[-70:], key, size / 1048576.0))
        if len(pending) > 200:
            print("  ... and %d more" % (len(pending) - 200))
        return 0

    if not pending:
        print("Everything is already in sync.")
        return 0

    done = [0]
    failed: List[str] = []

    def upload(item):
        full, key, size = item
        try:
            s3.upload_file(full, args.bucket, key,
                           ExtraArgs={"ContentType": content_type_for(full)})
        except Exception as exc:
            failed.append("%s: %s" % (key, exc))
            return
        with _printed:
            done[0] += 1
            print("[%d/%d] %s (%.1f MB)" % (done[0], len(pending), key, size / 1048576.0))

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(upload, pending))

    if failed:
        print("\n%d uploads failed:" % len(failed), file=sys.stderr)
        for line in failed[:20]:
            print("  " + line, file=sys.stderr)
        return 1

    print("\nUploaded %d files to s3://%s/%s" % (len(pending), args.bucket, args.prefix))
    print("Set GIS_DATA_URI=s3://%s/%s (the stack does this for you)."
          % (args.bucket, args.prefix))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
