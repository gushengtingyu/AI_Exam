const DEFAULT_STALE_MS = 10 * 60_000;

export function jobStaleAfterMs() {
  const configured = Number(process.env.JOB_STALE_AFTER_MS);
  if (!Number.isFinite(configured)) return DEFAULT_STALE_MS;
  return Math.min(24 * 60 * 60_000, Math.max(2 * 60_000, Math.round(configured)));
}

export function isJobStale(job: { status: string; updatedAt: Date } | null | undefined, now = Date.now()) {
  return Boolean(
    job &&
      ["queued", "running"].includes(job.status) &&
      now - job.updatedAt.getTime() > jobStaleAfterMs(),
  );
}
