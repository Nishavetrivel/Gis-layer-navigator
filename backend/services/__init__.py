"""
backend/services
────────────────
Service layer for GIS Layer Navigator:
- geometry_service: Shapefile/DBF binary parsers, bounding box calculations & file caching.
- cart_layer_service: Thematic cart layer configurations, definitions & discovery.
- geojson_builder: Hierarchical boundary merging and normalization.
- spatial_clip_service: Spatial polygon clipping & feature aggregation.
- hierarchy_resolver: Continuous zoom viewport & point-in-polygon spatial resolver.
"""
