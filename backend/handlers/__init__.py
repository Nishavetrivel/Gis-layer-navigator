"""
backend/handlers
────────────────
One module per HTTP endpoint. Each exposes a ``handle(request) -> response``
function; grouped Lambda entrypoints under ``backend/functions`` wire them to
their API Gateway resources through ``core.router``.

    hierarchy/  /api/districts, /api/taluks, /api/villages, /api/parcels,
                /api/metadata, /api/search
    cart/       /api/cart-layers, /api/cart-layers/list, /api/cart-layer/{id}
    tiles/      /api/tiles/..., /api/fmb-tiles/...
    spatial/    /api/spatial/resolve, /api/spatial/viewport,
                /api/spatial/clip/preview, /api/spatial/clip/download
    geo/        /api/geojson, /api/auto-zoom-layer
    export/     /api/export, /api/download/..., /api/download-zip,
                /api/export-polygon
    ai/         /api/ai/chat
"""
