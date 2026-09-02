/**
 * frontend/types.ts
 * ─────────────────
 * Shared TypeScript type definitions for GIS Layer Navigator.
 */

export type GisLevel = 'district' | 'taluk' | 'village' | 'parcel';

export type BasemapStyle =
  | 'street-view'
  | 'google-street'
  | 'satellite-hybrid'
  | 'esri-satellite'
  | 'esri-topo'
  | 'vector-light'
  | 'vector-dark';

export interface DistrictItem {
  code: string;
  name: string;
  state?: string;
  bbox?: string | number[];
  file_path?: string;
  geojson_path?: string;
}

export interface TalukItem {
  code: string;
  district_code: string;
  taluk_code?: string;
  name: string;
  bbox?: string | number[];
  file_path?: string;
  geojson_path?: string;
}

export interface VillageItem {
  code: string;
  taluk_code: string;
  village_code?: string;
  district_code: string;
  name: string;
  bbox?: string | number[];
  file_path?: string;
  geojson_path?: string;
}

export interface ParcelItem {
  code: string;
  survey_no: string;
  base_survey?: string;
  subdivision?: string;
  village_code: string;
  taluk_code: string;
  district_code: string;
  name: string;
  land_type?: string;
  area_acres?: number;
  bbox?: string | number[];
  file_path?: string;
  geojson_path?: string;
}

export interface ActiveGisLayer {
  level: GisLevel;
  code: string;
  name: string;
  file_type?: 'fmb' | 'vector';
  geojson: any;
  base_geojson?: any;
  bbox: [number, number, number, number];
  visible: boolean;
  opacity: number;
  color?: string;
  showLabels?: boolean;
}

export interface GisMetadata {
  code: string;
  name: string;
  level: string;
  survey_no: string;
  land_type: string;
  area_acres: string | number;
  spatial_reference: string;
  datum: string;
  bbox: number[];
  file_formats: string[];
  file_path: string;
  geojson_path: string;
  updated_at: string;
}

export interface SearchResult {
  code: string;
  name: string;
  level: GisLevel;
  parent_code?: string;
  district_code?: string;
  district_name?: string;
  taluk_code?: string;
  taluk_name?: string;
  village_code?: string;
  village_name?: string;
  survey_no?: string;
  location_text?: string;
  bbox?: string | number[];
  geojson_path?: string;
  shp_path?: string;
  has_vector?: boolean;
  score?: number;
}

export type DrawMode = 'idle' | 'polygon' | 'rectangle';

export interface ExtractedLayerResult {
  geojson: any;
  featureCount: number;
  totalAreaAcres: number;
  totalAreaSqMeters: number;
  layerLevels: GisLevel[];
  polygonGeojson: any;
  featureNames: string[];
  centroid?: [number, number];
}

export type CartGeomType = 'point' | 'line' | 'polygon';

export interface CartLayerDefinition {
  id: string;
  name: string;
  title: string;
  geom_type: CartGeomType;
  color: string;
  clustered: boolean;
  symbol: 'circle' | 'line' | 'polygon';
  opacity?: number;
  available?: boolean;
  feature_count?: number;
}

export interface CartLayerState {
  id: string;
  visible: boolean;
  loading: boolean;
  geojson?: any;
  error?: string;
}

export interface SpatialClipPreviewResponse {
  success: boolean;
  counts: Record<string, number>;
  total_features: number;
  geojson: any;
}

export interface BreadcrumbItem {
  code: string;
  name: string;
}

export interface BreadcrumbState {
  districtName?: string;
  talukName?: string;
  villageName?: string;
  parcelName?: string;
}

export interface MultiBreadcrumbState {
  districts: BreadcrumbItem[];
  taluks: BreadcrumbItem[];
  villages: BreadcrumbItem[];
  parcels: BreadcrumbItem[];
}
