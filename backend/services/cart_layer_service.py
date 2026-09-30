"""
backend/services/cart_layer_service.py
─────────────────────────────────────
Thematic Cart Overlay layers configuration, discovery, and definition registry.
"""

from typing import Dict, Any, List, Optional

from core import config, gisfs

CART_LAYER_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "id": "generic_viewer_all_water_bodies",
        "name": "generic_viewer_all_water_bodies",
        "title": "generic_viewer_all_water_bodies",
        "geom_type": "polygon",
        "color": "#0284c7",
        "clustered": False,
        "symbol": "polygon",
        "opacity": 0.55
    },
    {
        "id": "generic_viewer_schools",
        "name": "generic_viewer_schools",
        "title": "generic_viewer_schools",
        "geom_type": "point",
        "color": "#16a34a",
        "clustered": True,
        "symbol": "circle",
        "opacity": 0.95
    },
    {
        "id": "tnrd_roads",
        "name": "tnrd_roads",
        "title": "tnrd_roads",
        "geom_type": "line",
        "color": "#d6b88d",
        "clustered": False,
        "symbol": "line",
        "opacity": 0.9
    },
    {
        "id": "generic_viewer_river",
        "name": "generic_viewer_river",
        "title": "generic_viewer_river",
        "geom_type": "line",
        "color": "#9ca3af",
        "clustered": False,
        "symbol": "line",
        "opacity": 0.9
    },
    {
        "id": "generic_viewer_state_highways",
        "name": "generic_viewer_state_highways",
        "title": "generic_viewer_state_highways",
        "geom_type": "line",
        "color": "#4d8b55",
        "clustered": False,
        "symbol": "line",
        "opacity": 0.9
    },
    {
        "id": "generic_viewer_anganwadi_centres",
        "name": "generic_viewer_anganwadi_centres",
        "title": "generic_viewer_anganwadi_centres",
        "geom_type": "point",
        "color": "#7e4b85",
        "clustered": True,
        "symbol": "circle",
        "opacity": 0.95
    },
    {
        "id": "generic_viewer_village_panchayat_office",
        "name": "generic_viewer_village_panchayat_office",
        "title": "generic_viewer_village_panchayat_office",
        "geom_type": "point",
        "color": "#ea8416",
        "clustered": True,
        "symbol": "circle",
        "opacity": 0.95
    },
    {
        "id": "generic_viewer_tasmac_location_gis",
        "name": "generic_viewer_tasmac_location_gis",
        "title": "generic_viewer_tasmac_location_gis",
        "geom_type": "point",
        "color": "#cf5b36",
        "clustered": True,
        "symbol": "circle",
        "opacity": 0.95
    },
    {
        "id": "generic_viewer_petrol_bunks",
        "name": "generic_viewer_petrol_bunks",
        "title": "generic_viewer_petrol_bunks",
        "geom_type": "point",
        "color": "#99be3f",
        "clustered": True,
        "symbol": "circle",
        "opacity": 0.95
    },
    {
        "id": "generic_viewer_mines",
        "name": "generic_viewer_mines",
        "title": "generic_viewer_mines",
        "geom_type": "polygon",
        "color": "#d3a129",
        "clustered": False,
        "symbol": "polygon",
        "opacity": 0.55
    },
    {
        "id": "generic_viewer_national_highways",
        "name": "generic_viewer_national_highways",
        "title": "generic_viewer_national_highways",
        "geom_type": "line",
        "color": "#c8ad7f",
        "clustered": False,
        "symbol": "line",
        "opacity": 0.9
    },
    {
        "id": "generic_viewer_engineering_college",
        "name": "generic_viewer_engineering_college",
        "title": "generic_viewer_engineering_college",
        "geom_type": "point",
        "color": "#6b7280",
        "clustered": True,
        "symbol": "circle",
        "opacity": 0.95
    },
    {
        "id": "generic_viewer_fire_stations",
        "name": "generic_viewer_fire_stations",
        "title": "generic_viewer_fire_stations",
        "geom_type": "point",
        "color": "#94594c",
        "clustered": True,
        "symbol": "circle",
        "opacity": 0.95
    },
    {
        "id": "generic_viewer_tn_railway",
        "name": "generic_viewer_tn_railway",
        "title": "generic_viewer_tn_railway",
        "geom_type": "line",
        "color": "#719b48",
        "clustered": False,
        "symbol": "line",
        "opacity": 0.9
    },
    {
        "id": "tnrd_tnrd_tourist_point",
        "name": "tnrd_tnrd_tourist_point",
        "title": "tnrd_tnrd_tourist_point",
        "geom_type": "point",
        "color": "#6b3e75",
        "clustered": True,
        "symbol": "circle",
        "opacity": 0.95
    }
]

#: Canonical relative location of each layer under the cart-layers prefix.
CART_LAYER_PATHS: Dict[str, str] = {
    defn["id"]: "cart_layers/%s.geojson" % defn["id"]
    for defn in CART_LAYER_DEFINITIONS
}

cart_layer_cache: Dict[str, Any] = {}

_config_paths_cache: Optional[Dict[str, str]] = None
_resolved_layer_uris: Dict[str, Optional[str]] = {}


def get_cart_layer_config_paths() -> Dict[str, str]:
    """Optional ``cart_layers_config.json`` mapping layer ids to explicit URIs."""
    global _config_paths_cache
    if _config_paths_cache is not None:
        return _config_paths_cache
    result: Dict[str, str] = {}
    try:
        if gisfs.exists(config.CART_LAYERS_CONFIG_URI):
            parsed = gisfs.read_json(config.CART_LAYERS_CONFIG_URI)
            if isinstance(parsed, dict):
                result = {str(k): str(v) for k, v in parsed.items()}
    except Exception as e:
        print("[cart_layer_service] Error reading cart_layers_config.json:", e)
    _config_paths_cache = result
    return result


def find_cart_layer_file(layer_id: str) -> Optional[str]:
    """Resolve a layer id to a storage URI, memoised per container."""
    if not layer_id:
        return None
    if layer_id in _resolved_layer_uris:
        return _resolved_layer_uris[layer_id]

    resolved = _resolve_cart_layer_file(layer_id)
    _resolved_layer_uris[layer_id] = resolved
    return resolved


def _resolve_cart_layer_file(layer_id: str) -> Optional[str]:
    # 1. Explicit override from the config map.
    overrides = get_cart_layer_config_paths()
    override = overrides.get(layer_id)
    if override and gisfs.exists(override):
        return override

    # 2. Conventional locations, cheapest first.
    search_dirs = [
        config.CART_LAYERS_URI,
        config.child_uri(config.GIS_DATA_URI, "layers"),
        config.GIS_DATA_URI,
    ]
    extensions = [".geojson", ".json", ".shp", ".GeoJSON", ".JSON", ".SHP"]
    for d in search_dirs:
        for ext in extensions:
            candidate = gisfs.join(d, layer_id + ext)
            if gisfs.exists(candidate):
                return candidate

    # 3. Last resort: one recursive sweep of the cart-layers prefix.
    try:
        for uri in gisfs.glob_files(config.CART_LAYERS_URI, (".geojson", ".json", ".shp")):
            stem = gisfs.splitext(gisfs.basename(uri))[0]
            if stem.lower() == layer_id.lower():
                return uri
    except Exception as e:
        print("[cart_layer_service] Recursive lookup failed for %s: %s" % (layer_id, e))

    return None


def cart_layer_uri(layer_id: str) -> str:
    """Conventional URI for a layer, whether or not the object exists yet."""
    return gisfs.join(config.CART_LAYERS_URI, layer_id + ".geojson")
