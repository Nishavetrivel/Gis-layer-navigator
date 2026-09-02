"""
backend/core/http.py
────────────────────
API Gateway (REST / proxy) event parsing and response construction.

Handlers receive a :class:`Request` and return a dict shaped for API Gateway.
The helpers here replace what FastAPI used to do: query parsing with aliases,
JSON body decoding, binary responses, CORS headers, and error mapping.

Binary payloads (.pbf tiles, .zip bundles, .kmz) are base64-encoded; the REST
API declares matching ``BinaryMediaTypes`` in template.yaml. Anything larger
than ``MAX_INLINE_RESPONSE_BYTES`` is written to the artifact bucket and
returned as a 302 redirect to a pre-signed URL, since API Gateway caps a proxy
response at 6 MB.
"""

import base64
import json
import re
import time
import traceback
import uuid
from typing import Any, Callable, Dict, List, Optional

from core import config, gisfs

JSON_TYPE = "application/json"


class HttpError(Exception):
    """Raised by handlers to produce a non-2xx response."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


# ─── REQUEST ──────────────────────────────────────────────────────────────────

class Request:
    """Normalised view over a REST-API or HTTP-API proxy event."""

    __slots__ = ("event", "context", "method", "path", "path_params",
                 "query", "headers", "_body_cache")

    def __init__(self, event: Dict[str, Any], context: Any = None):
        self.event = event or {}
        self.context = context

        http_ctx = (self.event.get("requestContext") or {}).get("http") or {}
        self.method = (
            self.event.get("httpMethod")
            or http_ctx.get("method")
            or "GET"
        ).upper()
        self.path = (
            self.event.get("path")
            or http_ctx.get("path")
            or self.event.get("rawPath")
            or "/"
        )
        self.path_params = self.event.get("pathParameters") or {}
        self.headers = {
            str(k).lower(): v for k, v in (self.event.get("headers") or {}).items()
        }

        # Merge single- and multi-value query parameters.
        merged: Dict[str, List[str]] = {}
        for k, v in (self.event.get("queryStringParameters") or {}).items():
            if v is not None:
                merged[k] = [v]
        for k, vals in (self.event.get("multiValueQueryStringParameters") or {}).items():
            if vals:
                merged[k] = list(vals)
        self.query = merged
        self._body_cache: Any = None

    # ── query params ──────────────────────────────────────────────────────────

    def q(self, *names: str, default: Optional[str] = None) -> Optional[str]:
        """First present value among ``names`` — mirrors FastAPI Query aliases."""
        for name in names:
            vals = self.query.get(name)
            if vals:
                val = vals[0]
                if val is not None and str(val).strip() != "":
                    return str(val)
        return default

    def q_all(self, *names: str) -> List[str]:
        out: List[str] = []
        for name in names:
            out.extend(str(v) for v in self.query.get(name, []) if v is not None)
        return out

    def q_required(self, *names: str) -> str:
        val = self.q(*names)
        if val is None:
            raise HttpError(400, "Missing required query parameter '%s'." % names[0])
        return val

    def q_float(self, *names: str, default: Optional[float] = None,
                required: bool = False) -> Optional[float]:
        raw = self.q(*names)
        if raw is None:
            if required:
                raise HttpError(400, "Missing required query parameter '%s'." % names[0])
            return default
        try:
            return float(raw)
        except (TypeError, ValueError):
            raise HttpError(400, "Query parameter '%s' must be a number." % names[0])

    def q_int(self, *names: str, default: Optional[int] = None,
              required: bool = False) -> Optional[int]:
        raw = self.q(*names)
        if raw is None:
            if required:
                raise HttpError(400, "Missing required query parameter '%s'." % names[0])
            return default
        try:
            return int(float(raw))
        except (TypeError, ValueError):
            raise HttpError(400, "Query parameter '%s' must be an integer." % names[0])

    # ── path params ───────────────────────────────────────────────────────────

    def p(self, name: str, default: str = "") -> str:
        val = self.path_params.get(name)
        return default if val is None else str(val)

    def proxy_segments(self) -> List[str]:
        """Segments of a ``{proxy+}`` catch-all, e.g. ``schools/12/33/45.pbf``."""
        raw = self.path_params.get("proxy") or ""
        return [seg for seg in str(raw).split("/") if seg]

    # ── body ──────────────────────────────────────────────────────────────────

    def raw_body(self) -> bytes:
        body = self.event.get("body")
        if body is None:
            return b""
        if self.event.get("isBase64Encoded"):
            return base64.b64decode(body)
        return body.encode("utf-8") if isinstance(body, str) else bytes(body)

    def json(self) -> Dict[str, Any]:
        """Parsed JSON body — ``{}`` when absent, 400 when malformed."""
        if self._body_cache is not None:
            return self._body_cache
        raw = self.raw_body()
        if not raw:
            self._body_cache = {}
            return self._body_cache
        try:
            parsed = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise HttpError(400, "Request body is not valid JSON.")
        if not isinstance(parsed, dict):
            raise HttpError(400, "Request body must be a JSON object.")
        self._body_cache = parsed
        return parsed


# ─── RESPONSES ────────────────────────────────────────────────────────────────

def cors_headers() -> Dict[str, str]:
    return {
        "Access-Control-Allow-Origin": config.CORS_ALLOW_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Expose-Headers": "Content-Disposition,Content-Length",
    }


def response(status: int, body: str, headers: Optional[Dict[str, str]] = None,
             content_type: str = JSON_TYPE) -> Dict[str, Any]:
    hdrs = cors_headers()
    hdrs["Content-Type"] = content_type
    if headers:
        hdrs.update(headers)
    return {
        "statusCode": status,
        "headers": hdrs,
        "body": body,
        "isBase64Encoded": False,
    }


def json_response(payload: Any, status: int = 200,
                  headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False, default=_json_default)
    encoded = body.encode("utf-8")
    if len(encoded) > config.MAX_INLINE_RESPONSE_BYTES:
        return offload(encoded, "response.json", JSON_TYPE, headers, inline=True)
    return response(status, body, headers, JSON_TYPE)


def raw_json_response(payload_bytes: bytes, status: int = 200,
                      headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """Return already-serialised JSON bytes without a decode/encode round trip."""
    if len(payload_bytes) > config.MAX_INLINE_RESPONSE_BYTES:
        return offload(payload_bytes, "response.json", JSON_TYPE, headers, inline=True)
    return response(status, payload_bytes.decode("utf-8"), headers, JSON_TYPE)


def binary_response(data: bytes, content_type: str,
                    filename: str = "",
                    headers: Optional[Dict[str, str]] = None,
                    status: int = 200,
                    inline: bool = False) -> Dict[str, Any]:
    """Base64 proxy response, or a pre-signed redirect when too large."""
    hdrs = cors_headers()
    hdrs["Content-Type"] = content_type
    if filename:
        hdrs["Content-Disposition"] = '%s; filename="%s"' % (
            "inline" if inline else "attachment", filename,
        )
    if headers:
        hdrs.update(headers)

    if len(data) > config.MAX_INLINE_RESPONSE_BYTES:
        return offload(data, filename or "download.bin", content_type, headers, inline)

    return {
        "statusCode": status,
        "headers": hdrs,
        "body": base64.b64encode(data).decode("ascii"),
        "isBase64Encoded": True,
    }


def offload(data: bytes, filename: str, content_type: str,
            headers: Optional[Dict[str, str]] = None,
            inline: bool = False) -> Dict[str, Any]:
    """Write an oversized payload to S3 and 302 to a pre-signed URL.

    API Gateway rejects proxy responses over 6 MB, and large GIS exports blow
    straight past that. Without an artifact bucket configured this degrades to
    a 507 rather than an opaque gateway error.
    """
    if not config.ARTIFACT_BUCKET:
        return error_response(
            507,
            "Response of %d bytes exceeds the API Gateway limit and no "
            "ARTIFACT_BUCKET is configured for offloading." % len(data),
        )

    key = "responses/%s/%s/%s" % (
        time.strftime("%Y/%m/%d"), uuid.uuid4().hex, _safe_filename(filename),
    )
    uri = "s3://%s/%s" % (config.ARTIFACT_BUCKET, key)
    gisfs.write_bytes(uri, data, content_type)
    url = gisfs.presign(uri, filename="" if inline else _safe_filename(filename))

    hdrs = cors_headers()
    hdrs["Location"] = url
    hdrs["X-Offloaded-Bytes"] = str(len(data))
    if headers:
        hdrs.pop("Content-Type", None)
    return {
        "statusCode": 302,
        "headers": hdrs,
        "body": "",
        "isBase64Encoded": False,
    }


def redirect(url: str, status: int = 302) -> Dict[str, Any]:
    hdrs = cors_headers()
    hdrs["Location"] = url
    return {"statusCode": status, "headers": hdrs, "body": "", "isBase64Encoded": False}


def error_response(status: int, detail: str) -> Dict[str, Any]:
    return response(status, json.dumps({"detail": detail, "success": False}), None, JSON_TYPE)


def empty_binary(content_type: str, status: int = 404) -> Dict[str, Any]:
    hdrs = cors_headers()
    hdrs["Content-Type"] = content_type
    return {"statusCode": status, "headers": hdrs, "body": "", "isBase64Encoded": True}


def cache_headers(max_age: int, immutable: bool = False) -> Dict[str, str]:
    value = "public, max-age=%d" % max_age
    if immutable:
        value += ", immutable"
    else:
        value += ", stale-while-revalidate=604800"
    return {"Cache-Control": value}


def _safe_filename(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", name or "download.bin").strip("_")
    return cleaned or "download.bin"


def _json_default(obj: Any) -> Any:
    if isinstance(obj, (set, frozenset)):
        return list(obj)
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    return str(obj)


# ─── HANDLER WRAPPER ──────────────────────────────────────────────────────────

def entrypoint(dispatch: Callable[[Request], Dict[str, Any]]) -> Callable:
    """Wrap a dispatcher into a Lambda handler with uniform error handling."""

    def lambda_handler(event, context):
        if isinstance(event, dict) and event.get("source") == "aws.events":
            # Scheduled warmer ping — touch the container and return.
            return {"statusCode": 200, "body": "warm"}

        request = Request(event, context)
        if request.method == "OPTIONS":
            return response(204, "", None, JSON_TYPE)

        started = time.time()
        try:
            result = dispatch(request)
        except HttpError as exc:
            return error_response(exc.status, exc.detail)
        except Exception as exc:  # noqa: BLE001 - boundary handler
            print("[http] Unhandled error on %s %s: %s" % (request.method, request.path, exc))
            traceback.print_exc()
            detail = str(exc) if config.DEBUG else "Internal server error."
            return error_response(500, detail)

        if config.DEBUG:
            print("[http] %s %s -> %s in %.0fms" % (
                request.method, request.path,
                result.get("statusCode"), (time.time() - started) * 1000,
            ))
        return result

    return lambda_handler
