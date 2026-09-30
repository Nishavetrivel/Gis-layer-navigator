/**
 * api.ts
 * ──────
 * Central API URL helper.
 *
 * In development (Vite dev server) VITE_API_BASE_URL is empty and the
 * Vite proxy forwards /api/* to the backend, so relative paths work.
 *
 * In production (Amplify / any CDN host) VITE_API_BASE_URL is set to the
 * deployed API Gateway stage URL and all fetch calls must be absolute.
 */

const isDevOrLocal = Boolean(
  (import.meta as any)?.env?.DEV ||
  (typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0'
  ))
);

const FALLBACK_API_GATEWAY = 'https://len52tbo7c.execute-api.ap-south-1.amazonaws.com/dev';

/**
 * In development (Vite dev server), API_BASE is empty so requests route through
 * Vite's proxy (/api/*), preventing CORS 500 preflight failures.
 * In production builds, use the deployed API Gateway URL.
 */
export const API_BASE: string = isDevOrLocal ? '' : (((import.meta as any)?.env?.VITE_API_BASE_URL as string) || FALLBACK_API_GATEWAY).replace(/\/$/, '');

const S3_PMTILES_BASE = 'https://gis-layer-nav.s3.ap-south-1.amazonaws.com/cadastral/cadas_pmtiles/cadas_pmtiles';

/**
 * Get the streaming URL for a district's cadastral PMTiles archive.
 * S3 has CORS enabled ('*') and natively supports HTTP byte-range requests.
 */
export function getPmtilesUrl(distCode: string): string {
  const clean = (distCode || '').replace(/\D/g, '').padStart(2, '0');
  return `${S3_PMTILES_BASE}/d${clean}_cadastral.pmtiles`;
}

/**
 * Prefix a /api/... path with the API base URL.
 */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

