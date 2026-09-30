"""
backend/local_server.py
───────────────────────
Development server that speaks the same contract as API Gateway.

It builds a proxy event from each HTTP request and invokes the very same
``lambda_handler`` that runs in production, so what works here works deployed —
no FastAPI, no second code path. ``sam local start-api`` is the higher-fidelity
option; this one starts instantly and needs no Docker.

    python backend/local_server.py            # port 8000
    PORT=9000 python backend/local_server.py

The Vite dev server already proxies /api to http://127.0.0.1:8000.
"""

import base64
import json
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, unquote, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.router import Route  # noqa: E402

BINARY_TYPES = (
    "application/x-protobuf",
    "application/octet-stream",
    "application/zip",
    "application/vnd.google-earth.kmz",
    "application/dxf",
    "application/vnd.pmtiles",
)


def _load_functions() -> List[Tuple[List[Route], Any]]:
    """Import every deployed entrypoint and pair its routes with its handler."""
    from functions.ai_api import app as ai_app
    from functions.cart_api import app as cart_app
    from functions.clip_api import app as clip_app
    from functions.export_api import app as export_app
    from functions.geojson_api import app as geojson_app
    from functions.hierarchy_api import app as hierarchy_app
    from functions.spatial_api import app as spatial_app
    from functions.tiles_api import app as tiles_app

    modules = [
        hierarchy_app, cart_app, tiles_app, spatial_app,
        clip_app, geojson_app, export_app, ai_app,
    ]
    return [(m.router.routes, m.lambda_handler) for m in modules]


class GisRequestHandler(BaseHTTPRequestHandler):
    server_version = "GISLocalDev/1.0"
    protocol_version = "HTTP/1.1"
    functions: List[Tuple[List[Route], Any]] = []

    def do_HEAD(self):
        try:
            self._handle("HEAD")
        except Exception:
            traceback.print_exc()

    def do_GET(self):
        try:
            self._handle("GET")
        except Exception:
            traceback.print_exc()

    def do_POST(self):
        try:
            self._handle("POST")
        except Exception:
            traceback.print_exc()

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _handle(self, method: str):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        sys.stderr.write(f"[request] {method} {path}\n")
        sys.stderr.flush()

        if method == "GET" and path == "/":
            html = (
                "<!DOCTYPE html><html><head>"
                "<meta http-equiv='refresh' content='0; url=http://localhost:5173/' />"
                "<title>GIS Layer Navigator</title></head>"
                "<body style='font-family:system-ui,sans-serif;padding:40px;background:#0f172a;color:#f8fafc;text-align:center;'>"
                "<h2>GIS Layer Navigator API Server</h2>"
                "<p>The backend API is running on port 8000.</p>"
                "<p>Redirecting to the Map UI at <a style='color:#38bdf8;font-weight:bold;' href='http://localhost:5173/'>http://localhost:5173/</a> ...</p>"
                "<script>window.location.href='http://localhost:5173/';</script>"
                "</body></html>"
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self._send_cors()
            self.send_header("Content-Length", str(len(html)))
            self.end_headers()
            self.wfile.write(html)
            return

        match = self._match(method, path)
        if match is None:
            self._send_json(404, {"detail": "No route for %s %s" % (method, path)})
            return

        handler, resource, path_params = match
        body, is_b64 = self._read_body()

        event = {
            "resource": resource,
            "path": path,
            "httpMethod": method,
            "headers": {k: v for k, v in self.headers.items()},
            "queryStringParameters": {
                k: v[0] for k, v in parse_qs(parsed.query, keep_blank_values=True).items()
            },
            "multiValueQueryStringParameters": parse_qs(parsed.query, keep_blank_values=True),
            "pathParameters": path_params,
            "requestContext": {"stage": "local", "resourcePath": resource},
            "body": body,
            "isBase64Encoded": is_b64,
        }

        try:
            result = handler(event, _LocalContext())
            self._send_result(result)
        except Exception:
            traceback.print_exc()
            try:
                self._send_json(500, {"detail": "Handler raised; see server log."})
            except Exception:
                pass
            return

    def _match(self, method: str, path: str):
        lookup_method = "GET" if method == "HEAD" else method
        for routes, handler in self.functions:
            for route in routes:
                params = route.match(lookup_method, path)
                if params is not None:
                    return handler, route.template, params
        return None

    def _read_body(self) -> Tuple[Optional[str], bool]:
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return None, False
        data = self.rfile.read(length)
        content_type = (self.headers.get("Content-Type") or "").lower()
        if "json" in content_type or "text" in content_type or "urlencoded" in content_type:
            try:
                return data.decode("utf-8"), False
            except UnicodeDecodeError:
                pass
        return base64.b64encode(data).decode("ascii"), True

    def _send_result(self, result: Dict[str, Any]):
        status = int(result.get("statusCode") or 200)
        headers = result.get("headers") or {}
        raw = result.get("body") or ""
        payload = base64.b64decode(raw) if result.get("isBase64Encoded") else raw.encode("utf-8")

        self.send_response(status)
        is_head = (self.command == "HEAD")
        content_len = headers.get("Content-Length") or headers.get("content-length") or str(len(payload))
        for key, value in headers.items():
            if key.lower() == "content-length":
                continue
            self.send_header(key, str(value))
        self.send_header("Content-Length", str(content_len))
        self.end_headers()
        if payload and not is_head:
            self.wfile.write(payload)
        self.wfile.flush()

    def _send_json(self, status: int, payload: Dict[str, Any]):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._send_cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type,Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")

    def log_message(self, fmt, *fmt_args):
        sys.stderr.write("[local] %s\n" % (fmt % fmt_args))
        sys.stderr.flush()


class _LocalContext:
    """Minimal stand-in for the Lambda context object."""

    function_name = "local"
    memory_limit_in_mb = 3008
    aws_request_id = "local-dev"

    def get_remaining_time_in_millis(self) -> int:
        return 300000


def main() -> int:
    os.environ.setdefault("DEBUG", "true")
    os.environ.setdefault(
        "GIS_DATA_URI",
        os.getenv("GIS_DATA_URI", "s3://gis-layer-navigator-data-980610527749-dev/gis"),
    )
    os.environ.setdefault(
        "GIS_LOCAL_CACHE_DIR",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", ".tmpcache")),
    )

    GisRequestHandler.functions = _load_functions()
    route_count = sum(len(routes) for routes, _ in GisRequestHandler.functions)

    port = int(os.getenv("PORT", 8000))
    print("GIS Layer Navigator — local handler server")
    print("  data root : %s" % os.environ["GIS_DATA_URI"])
    print("  functions : %d, routes: %d" % (len(GisRequestHandler.functions), route_count))
    print("  listening : http://127.0.0.1:%d" % port)
    print("  frontend  : http://localhost:5173 (Vite proxies /api here)")

    ThreadingHTTPServer(("0.0.0.0", port), GisRequestHandler).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
