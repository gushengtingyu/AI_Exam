const DEFAULT_MAX_UPLOAD_MB = 15;
const MAX_UPLOAD_MB_LIMIT = 100;

export function maxUploadMb() {
  const configured = Number(process.env.MAX_UPLOAD_MB);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_MAX_UPLOAD_MB;
  return Math.min(MAX_UPLOAD_MB_LIMIT, Math.max(1, configured));
}

export function maxUploadBytes() {
  return maxUploadMb() * 1024 * 1024;
}
