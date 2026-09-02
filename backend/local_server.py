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
    functions: List[Tuple[List[Route], Any]] = []

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _handle(self, method: str):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        match = self._match(method, path)
        if match is None:
            self._send_json(404, {"detail": "No route for %s %s" % (method, path)})
            return

        handler, resource, path_params = match
        body = self._read_body()

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
            "isBase64Encoded": False,
        }

        try:
            result = handler(event, _LocalContext())
        except Exception:
            traceback.print_exc()
            self._send_json(500, {"detail": "Handler raised; see server log."})
            return

        self._send_result(result)

    def _match(self, method: str, path: str):
        for routes, handler in self.functions:
            for route in routes:
                params = route.match(method, path)
                if params is not None:
                    return handler, route.template, params
        return None

    def _read_body(self) -> Optional[str]:
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return None
        return self.rfile.read(length).decode("utf-8", errors="replace")

    def _send_result(self, result: Dict[str, Any]):
        status = int(result.get("statusCode") or 200)
        headers = result.get("headers") or {}
        raw = result.get("body") or ""
        payload = base64.b64decode(raw) if result.get("isBase64Encoded") else raw.encode("utf-8")

        self.send_response(status)
        for key, value in headers.items():
            self.send_header(key, str(value))
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if payload:
            self.wfile.write(payload)

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
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data")),
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
