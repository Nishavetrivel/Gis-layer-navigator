import io, json, os, zipfile
from shapely.geometry import shape, mapping, box, Point, LineString, Polygon, MultiPolygon
import shapefile

clip_box = box(79.0, 11.0, 79.5, 11.5)

schools_file = r'data\cart_layers\generic_viewer_schools.geojson'
with open(schools_file, 'r', encoding='utf-8') as f:
    s_data = json.load(f)

clipped_schools = []
for feat in s_data.get('features', []):
    geom = feat.get('geometry')
    if geom and geom.get('type') == 'Point':
        pt = shape(geom)
        if clip_box.contains(pt):
            clipped_schools.append(feat)

print('Clipped Schools:', len(clipped_schools), 'points')

roads_file = r'data\cart_layers\tnrd_roads.geojson'
with open(roads_file, 'r', encoding='utf-8') as f:
    r_data = json.load(f)

clipped_roads = []
for feat in r_data.get('features', []):
    geom = feat.get('geometry')
    if geom:
        line_geom = shape(geom)
        if line_geom.intersects(clip_box):
            inter = line_geom.intersection(clip_box)
            if not inter.is_empty:
                new_feat = dict(feat)
                new_feat['geometry'] = mapping(inter)
                clipped_roads.append(new_feat)

print('Clipped Roads:', len(clipped_roads), 'line segments')

zip_buffer = io.BytesIO()
with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.writestr('schools_clipped.geojson', json.dumps({'type': 'FeatureCollection', 'features': clipped_schools}, indent=2))
    
    shp_buf = io.BytesIO()
    shx_buf = io.BytesIO()
    dbf_buf = io.BytesIO()
    
    with shapefile.Writer(shp=shp_buf, shx=shx_buf, dbf=dbf_buf) as w:
        w.field('name', 'C', size=100)
        w.field('id', 'N')
        for i, feat in enumerate(clipped_schools[:50]):
            c = feat['geometry']['coordinates']
            w.point(c[0], c[1])
            name = str((feat.get('properties') or {}).get('name') or f'School_{i}')[:99]
            w.record(name=name, id=i)
            
    zf.writestr('schools_clipped.shp', shp_buf.getvalue())
    zf.writestr('schools_clipped.shx', shx_buf.getvalue())
    zf.writestr('schools_clipped.dbf', dbf_buf.getvalue())
    zf.writestr('schools_clipped.prj', 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]')

print('Zip buffer size:', len(zip_buffer.getvalue()), 'bytes')
