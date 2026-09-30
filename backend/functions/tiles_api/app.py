"""
backend/functions/tiles_api/app.py
──────────────────────────────────
Vector tile API.

Mapbox Vector Tiles and TileJSON metadata.

Both tile routes are catch-alls: API Gateway path parameters must span a whole
segment, so `{y}.pbf` cannot be a template of its own. `/api/tiles/{id}/metadata`
lands on the same resource, so it is separated here by the shape of the path.
"""

from core.http import entrypoint
from core.router import Router
from handlers.tiles import fmb_tile
from handlers.tiles import pmtiles_tile
from handlers.tiles import vector_tile
from handlers.tiles import tile_metadata

router = Router("tiles_api")
(
    router
    .get("/api/tiles/{proxy+}", vector_tile.handle)
    .get("/api/fmb-tiles/{proxy+}", fmb_tile.handle)
    .get("/api/pmtiles/{proxy+}", pmtiles_tile.handle)
)

# The metadata route shares the /api/tiles/{proxy+} resource, so it is matched
# here by shape rather than by a separate API Gateway template.
def _dispatch(request):
    segments = request.proxy_segments()
    if segments and segments[-1] == "metadata":
        return tile_metadata.handle(request)
    return router.dispatch(request)


lambda_handler = entrypoint(_dispatch)
