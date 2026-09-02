"""
backend/functions/hierarchy_api/app.py
──────────────────────────────────────
Hierarchy & search API.

Read-only navigation endpoints: the district/taluk/village/parcel tree, layer
metadata, and global search. All are small JSON responses sharing one warm
official-names index, so they belong in one function.
"""

from core.router import Router
from handlers.hierarchy import districts
from handlers.hierarchy import metadata
from handlers.hierarchy import parcels
from handlers.hierarchy import search
from handlers.hierarchy import taluks
from handlers.hierarchy import villages

router = Router("hierarchy_api")
(
    router
    .get("/api/districts", districts.handle)
    .get("/api/taluks", taluks.handle)
    .get("/api/villages", villages.handle)
    .get("/api/parcels", parcels.handle)
    .get("/api/metadata", metadata.handle)
    .get("/api/search", search.handle)
)

lambda_handler = router.as_lambda_handler()
