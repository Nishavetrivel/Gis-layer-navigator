/**
 * frontend/utils/downloadUtils.ts
 * ───────────────────────────────
 * Client-side file download helpers and filename sanitization.
 */

/**
 * Triggers a native browser file download from a Blob object.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

/**
 * Sanitizes a string to make it safe for use in filenames across operating systems.
 */
export function sanitizeDownloadFilename(name: string): string {
  if (!name) return 'Export';
  return name.trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
}
