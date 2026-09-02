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

/** Empty string in dev (Vite proxy), full API Gateway URL in production. */
export const API_BASE: string =
  ((import.meta.env.VITE_API_BASE_URL as string) ?? '').replace(/\/$/, '');

/**
 * Prefix a /api/... path with the API base URL when running in production.
 * In development this returns the path unchanged (Vite proxy handles it).
 */
export function apiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}
