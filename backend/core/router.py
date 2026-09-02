"""
backend/core/router.py
──────────────────────
Path + method dispatch inside a grouped Lambda function.

Each endpoint still lives in its own handler module with its own API Gateway
resource; the router only decides which handler a given event belongs to once
the request has already reached the function that owns that group. Matching is
by API Gateway ``resource`` (the route template, e.g. ``/api/tiles/{proxy+}``)
and falls back to the concrete path so ``sam local`` and the dev server work
identically.
"""

import re
from typing import Any, Callable, Dict, List, Optional, Tuple

from core.http import HttpError, Request, entrypoint

Handler = Callable[[Request], Dict[str, Any]]


class Route:
    __slots__ = ("method", "template", "handler", "_regex", "_names")

    def __init__(self, method: str, template: str, handler: Handler):
        self.method = method.upper()
        self.template = template
        self.handler = handler
        self._regex, self._names = _compile(template)

    def match(self, method: str, path: str) -> Optional[Dict[str, str]]:
        if method.upper() != self.method:
            return None
        m = self._regex.match(path or "/")
        if not m:
            return None
        return {name: m.group(name) for name in self._names}

    def __repr__(self) -> str:
        return "<Route %s %s>" % (self.method, self.template)


def _compile(template: str) -> Tuple[Any, List[str]]:
    """Turn ``/api/tiles/{proxy+}`` into a regex with named groups."""
    parts = [p for p in template.strip("/").split("/") if p != ""]
    names: List[str] = []
    pieces: List[str] = []
    for part in parts:
        if part.startswith("{") and part.endswith("}"):
            raw = part[1:-1]
            greedy = raw.endswith("+")
            name = raw[:-1] if greedy else raw
            names.append(name)
            pieces.append("(?P<%s>.+)" % name if greedy else "(?P<%s>[^/]+)" % name)
        else:
            pieces.append(re.escape(part))
    pattern = "^/" + "/".join(pieces) + "/?$" if pieces else "^/?$"
    return re.compile(pattern), names


class Router:
    """Ordered route table; the first match wins, so register literals first."""

    def __init__(self, name: str = ""):
        self.name = name
        self.routes: List[Route] = []

    def add(self, method: str, template: str, handler: Handler) -> "Router":
        self.routes.append(Route(method, template, handler))
        return self

    def get(self, template: str, handler: Handler) -> "Router":
        return self.add("GET", template, handler)

    def post(self, template: str, handler: Handler) -> "Router":
        return self.add("POST", template, handler)

    def resolve(self, request: Request) -> Tuple[Handler, Dict[str, str]]:
        # 1. Exact API Gateway resource template — unambiguous when present.
        resource = request.event.get("resource") or (
            (request.event.get("requestContext") or {}).get("resourcePath")
        )
        if resource:
            for route in self.routes:
                if route.template == resource and route.method == request.method:
                    return route.handler, dict(request.path_params or {})

        # 2. Fall back to matching the concrete path (sam local / dev server).
        path = _strip_stage(request)
        for route in self.routes:
            params = route.match(request.method, path)
            if params is not None:
                return route.handler, params

        raise HttpError(404, "No route for %s %s" % (request.method, path))

    def dispatch(self, request: Request) -> Dict[str, Any]:
        handler, params = self.resolve(request)
        if params:
            merged = dict(request.path_params or {})
            merged.update({k: v for k, v in params.items() if v is not None})
            request.path_params = merged
        return handler(request)

    def as_lambda_handler(self) -> Callable:
        return entrypoint(self.dispatch)

    def templates(self) -> List[str]:
        return ["%s %s" % (r.method, r.template) for r in self.routes]


def _strip_stage(request: Request) -> str:
    """Remove an API Gateway stage prefix (``/dev/api/...``) from the path."""
    path = request.path or "/"
    stage = ((request.event.get("requestContext") or {}).get("stage") or "").strip()
    if stage and stage not in ("$default",):
        prefix = "/" + stage
        if path == prefix:
            return "/"
        if path.startswith(prefix + "/"):
            return path[len(prefix):]
    return path
