/**
 * shpParser.ts
 * ────────────
 * Pure client-side ESRI Shapefile (.shp) and dBASE (.dbf) binary parser.
 * Requires zero external dependencies.
 * Converts raw Shapefile ArrayBuffers directly into GeoJSON FeatureCollections.
 * Automatically handles WGS84 Lat/Long and reprojects UTM Zone 44N (Tamil Nadu) coordinates.
 */

export interface ShpParseResult {
  geojson: any;
  geomTypes: string[];
}

// Reproject UTM Zone 44N (EPSG:32644) meters to WGS84 [Longitude, Latitude]
function utm44NToLatLng(easting: number, northing: number): [number, number] {
  const a = 6378137.0; // WGS84 semi-major axis
  const f = 1 / 298.257223563;
  const e2 = 2 * f - f * f;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const k0 = 0.9996;
  const lon0 = (81.0 * Math.PI) / 180.0; // Central meridian for UTM Zone 44N

  const x = easting - 500000.0;
  const y = northing;

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));

  const phi1Rad =
    mu +
    ((3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32) * Math.sin(4 * mu) +
    ((151 * Math.pow(e1, 3)) / 96) * Math.sin(6 * mu);

  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1Rad) * Math.sin(phi1Rad));
  const T1 = Math.tan(phi1Rad) * Math.tan(phi1Rad);
  const C1 = (e2 / (1 - e2)) * Math.cos(phi1Rad) * Math.cos(phi1Rad);
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * Math.sin(phi1Rad) * Math.sin(phi1Rad), 1.5);
  const D = x / (N1 * k0);

  const latRad =
    phi1Rad -
    ((N1 * Math.tan(phi1Rad)) / R1) *
      ((D * D) / 2 -
        (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - (9 * e2) / (1 - e2)) * (Math.pow(D, 4) / 24) +
        (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - (252 * e2) / (1 - e2) - 3 * C1 * C1) *
          (Math.pow(D, 6) / 720));

  const lonRad =
    lon0 +
    (D -
      (1 + 2 * T1 + C1) * (Math.pow(D, 3) / 6) +
      (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + (8 * e2) / (1 - e2) + 24 * T1 * T1) *
        (Math.pow(D, 5) / 120)) /
      Math.cos(phi1Rad);

  return [Number((lonRad * (180 / Math.PI)).toFixed(7)), Number((latRad * (180 / Math.PI)).toFixed(7))];
}

/**
 * Parses an ESRI Shapefile (.shp) binary buffer into a GeoJSON FeatureCollection.
 */
export function parseShpBuffer(buffer: ArrayBuffer, dbfProperties?: Record<string, any>[]): ShpParseResult {
  const view = new DataView(buffer);
  if (buffer.byteLength < 100) {
    throw new Error('Shapefile is too small (< 100 bytes)');
  }

  const fileCode = view.getInt32(0, false);
  if (fileCode !== 9994) {
    throw new Error(`Invalid ESRI Shapefile header code: ${fileCode}`);
  }

  const fileLength = view.getInt32(24, false) * 2;
  const xmin = view.getFloat64(36, true);
  const ymin = view.getFloat64(44, true);
  const xmax = view.getFloat64(52, true);
  const ymax = view.getFloat64(60, true);

  // Check if coordinates are projected in UTM meters or already geographic Lat/Lng
  const isUTM = Math.abs(xmin) > 180 || Math.abs(xmax) > 180 || Math.abs(ymin) > 90 || Math.abs(ymax) > 90;

  const toCoord = (x: number, y: number): [number, number] => {
    if (isUTM) {
      return utm44NToLatLng(x, y);
    }
    return [Number(x.toFixed(7)), Number(y.toFixed(7))];
  };

  const features: any[] = [];
  const geomTypesSet = new Set<string>();
  let offset = 100;
  const maxByte = Math.min(buffer.byteLength, fileLength);
  let recordIndex = 0;

  while (offset < maxByte - 8) {
    const recordNumber = view.getInt32(offset, false);
    const contentLength = view.getInt32(offset + 4, false) * 2;
    offset += 8;

    if (offset + contentLength > buffer.byteLength) break;
    const shapeType = view.getInt32(offset, true);

    const props = (dbfProperties && dbfProperties[recordIndex]) || { id: recordNumber };

    // Point, PointZ, PointM
    if (shapeType === 1 || shapeType === 11 || shapeType === 21) {
      const x = view.getFloat64(offset + 4, true);
      const y = view.getFloat64(offset + 12, true);
      geomTypesSet.add('Point');
      features.push({
        type: 'Feature',
        properties: props,
        geometry: {
          type: 'Point',
          coordinates: toCoord(x, y),
        },
      });
    }
    // PolyLine, PolyLineZ, PolyLineM
    else if (shapeType === 3 || shapeType === 13 || shapeType === 23) {
      const numParts = view.getInt32(offset + 36, true);
      const numPoints = view.getInt32(offset + 40, true);
      const parts: number[] = [];
      for (let p = 0; p < numParts; p++) {
        parts.push(view.getInt32(offset + 44 + p * 4, true));
      }
      const pointsOffset = offset + 44 + numParts * 4;
      const lines: [number, number][][] = [];

      for (let p = 0; p < numParts; p++) {
        const startIdx = parts[p];
        const endIdx = p === numParts - 1 ? numPoints : parts[p + 1];
        const lineCoords: [number, number][] = [];
        for (let i = startIdx; i < endIdx; i++) {
          const px = view.getFloat64(pointsOffset + i * 16, true);
          const py = view.getFloat64(pointsOffset + i * 16 + 8, true);
          lineCoords.push(toCoord(px, py));
        }
        lines.push(lineCoords);
      }

      geomTypesSet.add(lines.length === 1 ? 'LineString' : 'MultiLineString');
      features.push({
        type: 'Feature',
        properties: props,
        geometry: lines.length === 1
          ? { type: 'LineString', coordinates: lines[0] }
          : { type: 'MultiLineString', coordinates: lines },
      });
    }
    // Polygon, PolygonZ, PolygonM
    else if (shapeType === 5 || shapeType === 15 || shapeType === 25) {
      const numParts = view.getInt32(offset + 36, true);
      const numPoints = view.getInt32(offset + 40, true);
      const parts: number[] = [];
      for (let p = 0; p < numParts; p++) {
        parts.push(view.getInt32(offset + 44 + p * 4, true));
      }
      const pointsOffset = offset + 44 + numParts * 4;
      const rings: [number, number][][] = [];

      for (let p = 0; p < numParts; p++) {
        const startIdx = parts[p];
        const endIdx = p === numParts - 1 ? numPoints : parts[p + 1];
        const ringCoords: [number, number][] = [];
        for (let i = startIdx; i < endIdx; i++) {
          const px = view.getFloat64(pointsOffset + i * 16, true);
          const py = view.getFloat64(pointsOffset + i * 16 + 8, true);
          ringCoords.push(toCoord(px, py));
        }
        // Ensure polygon ring is closed
        if (ringCoords.length > 0) {
          const first = ringCoords[0];
          const last = ringCoords[ringCoords.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            ringCoords.push([first[0], first[1]]);
          }
        }
        rings.push(ringCoords);
      }

      geomTypesSet.add(rings.length === 1 ? 'Polygon' : 'MultiPolygon');
      features.push({
        type: 'Feature',
        properties: props,
        geometry: rings.length === 1
          ? { type: 'Polygon', coordinates: rings }
          : { type: 'MultiPolygon', coordinates: [rings] },
      });
    }

    offset += contentLength;
    recordIndex++;
  }

  return {
    geojson: {
      type: 'FeatureCollection',
      features,
    },
    geomTypes: Array.from(geomTypesSet),
  };
}
