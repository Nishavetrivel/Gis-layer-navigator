import { CartLayerDefinition } from './types';

export const CART_LAYERS_CONFIG: (CartLayerDefinition & {
  defaultFilePath?: string;
  category: 'water' | 'infrastructure' | 'education' | 'amenities' | 'transport' | 'emergency';
})[] = [
  {
    id: 'generic_viewer_all_water_bodies',
    name: 'generic_viewer_all_water_bodies',
    title: 'Water Bodies',
    geom_type: 'polygon',
    color: '#0284c7', // Sky Blue for Water Bodies
    clustered: false,
    symbol: 'polygon',
    opacity: 0.65,
    category: 'water',
    defaultFilePath: 'data/layers/generic_viewer_all_water_bodies.geojson',
  },
  {
    id: 'generic_viewer_schools',
    name: 'generic_viewer_schools',
    title: 'Schools',
    geom_type: 'point',
    color: '#16a34a',
    clustered: true,
    symbol: 'circle',
    opacity: 0.95,
    category: 'education',
    defaultFilePath: 'data/layers/generic_viewer_schools.geojson',
  },
  {
    id: 'tnrd_roads',
    name: 'tnrd_roads',
    title: 'TNRD Roads',
    geom_type: 'line',
    color: '#64748b', // Grey for TNRD Roads
    clustered: false,
    symbol: 'line',
    opacity: 0.9,
    category: 'transport',
    defaultFilePath: 'data/layers/tnrd_roads.geojson',
  },
  {
    id: 'generic_viewer_river',
    name: 'generic_viewer_river',
    title: 'Rivers',
    geom_type: 'line',
    color: '#38bdf8', // Sky Blue for Rivers
    clustered: false,
    symbol: 'line',
    opacity: 0.95,
    category: 'water',
    defaultFilePath: 'data/layers/generic_viewer_river.geojson',
  },
  {
    id: 'generic_viewer_state_highways',
    name: 'generic_viewer_state_highways',
    title: 'State Highways',
    geom_type: 'line',
    color: '#475569', // Dark Slate Grey for State Highways
    clustered: false,
    symbol: 'line',
    opacity: 0.9,
    category: 'transport',
    defaultFilePath: 'data/layers/generic_viewer_state_highways.geojson',
  },
  {
    id: 'generic_viewer_anganwadi_centres',
    name: 'generic_viewer_anganwadi_centres',
    title: 'Anganwadi Centres',
    geom_type: 'point',
    color: '#7e4b85',
    clustered: true,
    symbol: 'circle',
    opacity: 0.95,
    category: 'education',
    defaultFilePath: 'data/layers/generic_viewer_anganwadi_centres.geojson',
  },
  {
    id: 'generic_viewer_village_panchayat_office',
    name: 'generic_viewer_village_panchayat_office',
    title: 'Village Panchayat Offices',
    geom_type: 'point',
    color: '#ea8416',
    clustered: true,
    symbol: 'circle',
    opacity: 0.95,
    category: 'amenities',
    defaultFilePath: 'data/layers/generic_viewer_village_panchayat_office.geojson',
  },
  {
    id: 'generic_viewer_tasmac_location_gis',
    name: 'generic_viewer_tasmac_location_gis',
    title: 'TASMAC Locations',
    geom_type: 'point',
    color: '#cf5b36',
    clustered: true,
    symbol: 'circle',
    opacity: 0.95,
    category: 'amenities',
    defaultFilePath: 'data/layers/generic_viewer_tasmac_location_gis.geojson',
  },
  {
    id: 'generic_viewer_petrol_bunks',
    name: 'generic_viewer_petrol_bunks',
    title: 'Petrol Bunks',
    geom_type: 'point',
    color: '#99be3f',
    clustered: true,
    symbol: 'circle',
    opacity: 0.95,
    category: 'amenities',
    defaultFilePath: 'data/layers/generic_viewer_petrol_bunks.geojson',
  },
  {
    id: 'generic_viewer_mines',
    name: 'generic_viewer_mines',
    title: 'Mines & Quarries',
    geom_type: 'polygon',
    color: '#d3a129',
    clustered: false,
    symbol: 'polygon',
    opacity: 0.55,
    category: 'infrastructure',
    defaultFilePath: 'data/layers/generic_viewer_mines.geojson',
  },
  {
    id: 'generic_viewer_national_highways',
    name: 'generic_viewer_national_highways',
    title: 'National Highways',
    geom_type: 'line',
    color: '#94a3b8', // Cool Slate Grey for National Highways
    clustered: false,
    symbol: 'line',
    opacity: 0.9,
    category: 'transport',
    defaultFilePath: 'data/layers/generic_viewer_national_highways.geojson',
  },
  {
    id: 'generic_viewer_engineering_college',
    name: 'generic_viewer_engineering_college',
    title: 'Engineering Colleges',
    geom_type: 'point',
    color: '#6b7280',
    clustered: true,
    symbol: 'circle',
    opacity: 0.95,
    category: 'education',
    defaultFilePath: 'data/layers/generic_viewer_engineering_college.geojson',
  },
  {
    id: 'generic_viewer_fire_stations',
    name: 'generic_viewer_fire_stations',
    title: 'Fire Stations',
    geom_type: 'point',
    color: '#94594c',
    clustered: true,
    symbol: 'circle',
    opacity: 0.95,
    category: 'emergency',
    defaultFilePath: 'data/layers/generic_viewer_fire_stations.geojson',
  },
  {
    id: 'generic_viewer_tn_railway',
    name: 'generic_viewer_tn_railway',
    title: 'Railways',
    geom_type: 'line',
    color: '#719b48',
    clustered: false,
    symbol: 'line',
    opacity: 0.9,
    category: 'transport',
    defaultFilePath: 'data/layers/generic_viewer_tn_railway.geojson',
  },
  {
    id: 'tnrd_tnrd_tourist_point',
    name: 'tnrd_tnrd_tourist_point',
    title: 'Tourist Points',
    geom_type: 'point',
    color: '#6b3e75',
    clustered: true,
    symbol: 'circle',
    opacity: 0.95,
    category: 'amenities',
    defaultFilePath: 'data/layers/tnrd_tnrd_tourist_point.geojson',
  },
];

// Helper to generate realistic sample GeoJSON points/lines/polygons across Tamil Nadu
// for immediate interactive testing and clustering visualization before user provides paths
export function generateSampleGeoJSONForLayer(layerId: string): any {
  // Tamil Nadu center/bounds approximate: lng 77.0 to 80.2, lat 8.3 to 13.5
  const layer = CART_LAYERS_CONFIG.find((l) => l.id === layerId);
  if (!layer) return { type: 'FeatureCollection', features: [] };

  const clusters = [
    { center: [78.1198, 9.9252], count: 35, name: 'Madurai Cluster' },
    { center: [80.2707, 13.0827], count: 50, name: 'Chennai Region' },
    { center: [76.9558, 11.0168], count: 40, name: 'Coimbatore Hub' },
    { center: [78.7047, 10.7905], count: 30, name: 'Trichy Cluster' },
    { center: [78.1460, 11.6643], count: 25, name: 'Salem Region' },
    { center: [77.7274, 8.7139], count: 20, name: 'Tirunelveli Area' },
    { center: [79.1378, 12.9165], count: 20, name: 'Vellore Area' },
  ];

  if (layer.geom_type === 'point') {
    const features: any[] = [];
    let idCounter = 1;

    clusters.forEach((cl) => {
      for (let i = 0; i < cl.count; i++) {
        // distribute points around center
        const spread = 0.35;
        const lng = +(cl.center[0] + (Math.sin(i * 13.7 + idCounter) * spread) * (0.3 + (i % 7) * 0.1)).toFixed(6);
        const lat = +(cl.center[1] + (Math.cos(i * 19.3 + idCounter) * spread) * (0.3 + (i % 5) * 0.1)).toFixed(6);

        features.push({
          type: 'Feature',
          id: idCounter,
          properties: {
            id: idCounter,
            layer_id: layer.id,
            layer_name: layer.name,
            title: `${layer.title} #${idCounter}`,
            location: cl.name,
            status: 'Active',
            category: layer.category,
            updated_at: '2026-08',
          },
          geometry: {
            type: 'Point',
            coordinates: [lng, lat],
          },
        });
        idCounter++;
      }
    });

    return { type: 'FeatureCollection', features };
  }

  if (layer.geom_type === 'line') {
    const features: any[] = [];
    // Major corridors across TN
    const corridors = [
      // Chennai to Madurai
      [[80.27, 13.08], [79.65, 12.68], [79.32, 11.94], [78.70, 10.79], [78.12, 9.92]],
      // Chennai to Coimbatore
      [[80.27, 13.08], [79.14, 12.92], [78.58, 12.52], [78.15, 11.66], [77.58, 11.24], [76.96, 11.02]],
      // Madurai to Kanyakumari
      [[78.12, 9.92], [77.96, 9.17], [77.73, 8.71], [77.54, 8.08]],
      // Coimbatore to Trichy
      [[76.96, 11.02], [77.40, 11.10], [77.90, 10.95], [78.70, 10.79]],
      // Salem to Karur & Dindigul
      [[78.15, 11.66], [78.08, 10.96], [77.98, 10.37], [78.12, 9.92]],
    ];

    corridors.forEach((line, idx) => {
      features.push({
        type: 'Feature',
        id: idx + 1,
        properties: {
          id: idx + 1,
          name: `${layer.title} Segment ${idx + 1}`,
          layer_id: layer.id,
          type: layer.name,
        },
        geometry: {
          type: 'LineString',
          coordinates: line,
        },
      });
    });

    return { type: 'FeatureCollection', features };
  }

  if (layer.geom_type === 'polygon') {
    const features: any[] = [];
    const polygonCenters = [
      [78.5, 10.5],
      [79.2, 11.3],
      [77.8, 9.8],
      [80.0, 12.8],
      [77.2, 11.2],
    ];

    polygonCenters.forEach((center, idx) => {
      const size = 0.08 + (idx % 3) * 0.04;
      const poly = [
        [center[0] - size, center[1] - size],
        [center[0] + size, center[1] - size * 0.8],
        [center[0] + size * 1.2, center[1] + size],
        [center[0] - size * 0.7, center[1] + size * 1.1],
        [center[0] - size, center[1] - size],
      ];

      features.push({
        type: 'Feature',
        id: idx + 1,
        properties: {
          id: idx + 1,
          name: `${layer.title} Zone ${idx + 1}`,
          layer_id: layer.id,
          area_acres: (size * 1000).toFixed(1),
        },
        geometry: {
          type: 'Polygon',
          coordinates: [poly],
        },
      });
    });

    return { type: 'FeatureCollection', features };
  }

  return { type: 'FeatureCollection', features: [] };
}
