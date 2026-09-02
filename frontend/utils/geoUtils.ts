/**
 * frontend/utils/geoUtils.ts
 * ──────────────────────────
 * Bounding box calculations, coordinate processing, and geographic extent constants.
 */

export const TAMIL_NADU_BOUNDS: [[number, number], [number, number]] = [
  [76.15, 8.05],  // Southwest: Kanyakumari / Western Ghats limit
  [80.35, 13.55], // Northeast: Pulicat / Tiruvallur border
];

export const TAMIL_NADU_MAX_BOUNDS: [[number, number], [number, number]] = [
  [71.0, 5.5],  // Southwest envelope allowing extra zoom out
  [85.5, 16.5], // Northeast envelope allowing extra zoom out
];

export const TAMIL_NADU_CENTER: [number, number] = [78.65, 11.12];

/**
 * Calculates the bounding box [minLng, minLat, maxLng, maxLat] of a GeoJSON Feature.
 */
export function getFeatureBBox(feature: any): [number, number, number, number] | null {
  if (!feature || !feature.geometry) return null;
  const geom = feature.geometry;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const processCoord = (coord: [number, number]) => {
    if (!coord || typeof coord[0] !== 'number' || typeof coord[1] !== 'number') return;
    const [lng, lat] = coord;
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  };

  const processCoords = (coords: any) => {
    if (!coords || !Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') {
      processCoord(coords as [number, number]);
    } else {
      coords.forEach(processCoords);
    }
  };

  if (geom.coordinates) {
    processCoords(geom.coordinates);
  }

  if (minLng === Infinity || minLat === Infinity || isNaN(minLng) || isNaN(minLat)) return null;
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Computes bounding box for an entire GeoJSON FeatureCollection or geometry object.
 */
export function computeGeoJSONBounds(geojson: any): [number, number, number, number] | null {
  if (!geojson) return null;
  if (geojson.bbox && Array.isArray(geojson.bbox) && geojson.bbox.length === 4) {
    return geojson.bbox as [number, number, number, number];
  }

  const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  features.forEach((feat: any) => {
    const bbox = getFeatureBBox(feat);
    if (bbox) {
      if (bbox[0] < minLng) minLng = bbox[0];
      if (bbox[1] < minLat) minLat = bbox[1];
      if (bbox[2] > maxLng) maxLng = bbox[2];
      if (bbox[3] > maxLat) maxLat = bbox[3];
    }
  });

  if (minLng === Infinity || minLat === Infinity) return null;
  return [minLng, minLat, maxLng, maxLat];
}
