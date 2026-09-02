import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { VectorTile } = require('@mapbox/vector-tile');
const Pbf = require('pbf');

async function run() {
  try {
    const PbfClass = Pbf.PbfReader || Pbf;
    const res = await fetch('http://localhost:8000/api/tiles/generic_viewer_schools/10/734/487.pbf');
    const buf = await res.arrayBuffer();
    const tile = new VectorTile(new PbfClass(new Uint8Array(buf)));
    console.log('Tile layers found:', Object.keys(tile.layers));
    const layer = tile.layers['generic_viewer_schools'];
    if (layer) {
      console.log('Features count:', layer.length);
      const feat0 = layer.feature(0);
      console.log('Feat 0 props:', feat0.properties);
      console.log('Feat 0 geom:', feat0.loadGeometry());
    }
  } catch (e) {
    console.error('Error decoding:', e);
  }
}

run();
