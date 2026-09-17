export class ProviderRequestError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly label: string,
    readonly status: number,
    readonly providerCode = "",
    readonly retryAfterMs: number | null = null,
    quotaExceeded = false,
  ) {
    const description = quotaExceeded ? "服务额度不足，请检查模型账户额度"
      : status === 429 ? "服务暂时繁忙或请求受限"
      : status === 0 ? "网络连接失败或请求超时"
      : status === 401 || status === 403 ? "服务认证或权限异常"
      : "服务请求失败";
    super(`${label}${description}（${status || "network"}${providerCode ? `，${providerCode}` : ""}）`);
    this.name = "ProviderRequestError";
    this.retryable = !quotaExceeded && (status === 0 || status === 408 || status === 429 || status >= 500);
  }
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value?.trim()) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1000 : null;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

export async function providerResponseError(label: string, response: Response) {
  const payload = await response.json().catch(() => null);
  const details = payload?.error;
  const rawCode = typeof details?.code === "string" ? details.code : "";
  // Keep the diagnostic code, never echo the provider's arbitrary response body.
  const code = /^[\w.-]{1,120}$/.test(rawCode) ? rawCode : "";
  const message = typeof details?.message === "string" ? details.message : "";
  const quota = [403, 429].includes(response.status)
    && (/quotaexceeded|insufficient_quota|arrears/i.test(code)
      || /exhausted.{0,40}quota|insufficient.{0,20}(balance|quota)|balance.{0,20}insufficient/i.test(message));
  return new ProviderRequestError(label, response.status, code, parseRetryAfter(response.headers.get("retry-after")), quota);
}

export function providerRetryDelay(error: ProviderRequestError, attempt: number, random = Math.random): number | null {
  if (!error.retryable || (error.retryAfterMs ?? 0) > 120_000) return null;
  const base = error.status === 429 ? 15_000 : 5_000;
  const backoff = Math.min(90_000, base * 2 ** Math.max(0, attempt - 1));
  return Math.max(error.retryAfterMs ?? 0, backoff + Math.floor(random() * 3_000));
}
