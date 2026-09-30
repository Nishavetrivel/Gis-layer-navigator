"""
GET & HEAD /api/pmtiles/{district_code}
──────────────────────────────────────
PMTiles byte-range streaming proxy for cadastral parcel vector tiles.
Speaks HTTP Range requests to S3 bucket 'gis-layer-nav' (or local cache)
enabling MapLibre GL to stream vector tiles directly via PMTiles protocol.
"""

import os
import re
from typing import Any, Dict, Optional

import boto3
from botocore.config import Config as BotoConfig

from core import config
from core.http import Request, HttpError, binary_response, cors_headers, redirect, response

PMTILES_BUCKET = os.getenv("GIS_PMTILES_BUCKET", "gis-layer-nav")
PMTILES_PREFIX = os.getenv("GIS_PMTILES_PREFIX", "cadastral/cadas_pmtiles/cadas_pmtiles")
PMTILES_TYPE = "application/vnd.pmtiles"

_s3_client = None


def get_s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            region_name=os.getenv("AWS_REGION", "ap-south-1"),
            config=BotoConfig(
                retries={"max_attempts": 3, "mode": "standard"},
                connect_timeout=5,
                read_timeout=15,
            ),
        )
    return _s3_client


def resolve_district_code(segments) -> Optional[str]:
    """Parse segments like ['35'], ['d35'], ['d35_cadastral.pmtiles'], etc."""
    full_path = "/".join(segments)
    match = re.search(r"d?(\d{1,2})", full_path)
    if not match:
        return None
    dist_num = int(match.group(1))
    if 1 <= dist_num <= 38:
        return f"{dist_num:02d}"
    return None


def handle(request: Request) -> Dict[str, Any]:
    segments = request.proxy_segments()
    if not segments:
        raise HttpError(400, "Missing district code in /api/pmtiles/{district}")

    dist_code = resolve_district_code(segments)
    if not dist_code:
        raise HttpError(400, f"Invalid district code in path: {'/'.join(segments)}")

    s3_key = f"{PMTILES_PREFIX}/d{dist_code}_cadastral.pmtiles"
    s3 = get_s3()

    extra_headers = cors_headers()
    extra_headers["Accept-Ranges"] = "bytes"
    extra_headers["Access-Control-Expose-Headers"] = (
        "Content-Range, Accept-Ranges, Content-Length, ETag"
    )
    extra_headers["Cache-Control"] = "public, max-age=86400"

    # Handle HEAD request for metadata/probing
    if request.method == "HEAD":
        try:
            head_obj = s3.head_object(Bucket=PMTILES_BUCKET, Key=s3_key)
            extra_headers["Content-Length"] = str(head_obj["ContentLength"])
            if "ETag" in head_obj:
                extra_headers["ETag"] = str(head_obj["ETag"])
            return response(200, "", headers=extra_headers, content_type=PMTILES_TYPE)
        except Exception as e:
            err_msg = str(e)
            if "NoSuchKey" in err_msg or "404" in err_msg:
                raise HttpError(404, f"Cadastral PMTiles not found for district {dist_code}")
            raise HttpError(500, f"Error probing PMTiles: {err_msg}")

    range_header = request.headers.get("range")

    # If no Range header is requested, avoid reading the whole multi-MB file through Lambda;
    # redirect to a pre-signed S3 URL directly.
    if not range_header:
        try:
            presigned_url = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": PMTILES_BUCKET, "Key": s3_key},
                ExpiresIn=3600,
            )
            return redirect(presigned_url)
        except Exception as e:
            raise HttpError(500, f"Failed to generate PMTiles presigned URL: {e}")

    try:
        kwargs: Dict[str, Any] = {
            "Bucket": PMTILES_BUCKET,
            "Key": s3_key,
            "Range": range_header,
        }

        obj = s3.get_object(**kwargs)
        data = obj["Body"].read()

        status = 206 if "ContentRange" in obj else 200
        if "ContentRange" in obj:
            extra_headers["Content-Range"] = str(obj["ContentRange"])
        if "ETag" in obj:
            extra_headers["ETag"] = str(obj["ETag"])
        extra_headers["Content-Length"] = str(len(data))

        return binary_response(
            data,
            content_type=PMTILES_TYPE,
            headers=extra_headers,
            status=status,
            inline=True,
        )
    except Exception as e:
        err_msg = str(e)
        if "NoSuchKey" in err_msg or "404" in err_msg:
            raise HttpError(404, f"Cadastral PMTiles not found for district {dist_code}")
        raise HttpError(500, f"Error fetching PMTiles range: {err_msg}")
