from backend.mvt_service import vector_tile_manager, tile_to_bbox
import math

lat, lng = 11.12, 78.65
for z in range(5, 14):
    n = 2 ** z
    x = int((lng + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    pbf = vector_tile_manager.get_tile('generic_viewer_schools', z, x, y)
    print(f'Zoom {z}: tile ({z}, {x}, {y}) -> {len(pbf)} bytes')
