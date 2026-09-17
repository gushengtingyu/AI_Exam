import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";

const source = readFileSync(new URL("../../lib/ai/provider-errors.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { providerResponseError, providerRetryDelay, parseRetryAfter, ProviderRequestError } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("429 overload honors Retry-After and retries with increasing delays", async () => {
  const error = await providerResponseError("豆包", Response.json({ error: { code: "ServerOverloaded", message: "private payload" } }, { status: 429, headers: { "Retry-After": "40" } }));
  assert.equal(error.providerCode, "ServerOverloaded");
  assert.equal(error.retryable, true);
  assert.equal(error.message.includes("private payload"), false);
  assert.equal(providerRetryDelay(error, 1, () => 0), 40_000);
  assert.equal(providerRetryDelay(error, 3, () => 0), 60_000);
});

test("quota exhaustion and authentication errors are not retried", async () => {
  for (const code of ["QuotaExceeded", "AccountQuotaExceeded", "insufficient_quota"]) {
    const error = await providerResponseError("豆包", Response.json({ error: { code } }, { status: 429 }));
    assert.equal(providerRetryDelay(error, 1), null);
    assert.match(error.message, /额度不足/);
  }
  assert.equal(providerRetryDelay(new ProviderRequestError("API", 401), 1), null);
});

test("TPM limits are transient and malformed bodies still retain HTTP status", async () => {
  const error = await providerResponseError("豆包", Response.json({ error: { code: "RateLimitExceeded.EndpointTPMExceeded" } }, { status: 429 }));
  assert.equal(providerRetryDelay(error, 1, () => 0), 15_000);
  const malformed = await providerResponseError("API", new Response("not json", { status: 503 }));
  assert.equal(malformed.status, 503);
  assert.equal(providerRetryDelay(malformed, 1, () => 0), 5_000);
});

test("Retry-After dates work and long waits are never shortened", () => {
  const now = Date.parse("2026-09-10T00:00:00Z");
  assert.equal(parseRetryAfter("Thu, 10 Sep 2026 00:01:00 GMT", now), 60_000);
  assert.equal(parseRetryAfter("invalid", now), null);
  assert.equal(parseRetryAfter("-1", now), null);
  assert.equal(providerRetryDelay(new ProviderRequestError("API", 429, "", 300_000), 1), null);
});

test("actual provider preserves 429 details and accepts a successful retry without network access", async (t) => {
  const errorModule = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
  const providerSource = readFileSync(new URL("../../lib/ai/provider.ts", import.meta.url), "utf8")
    .replace('"@/lib/ai/provider-errors"', JSON.stringify(errorModule))
    .replace('"zod"', JSON.stringify(import.meta.resolve("zod")));
  const providerJs = ts.transpileModule(providerSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { OpenAiCompatibleProvider } = await import(`data:text/javascript;base64,${Buffer.from(providerJs).toString("base64")}`);
  const settings = { VISION_PROVIDER: "custom", VISION_API_KEY: "test-only", VISION_BASE_URL: "https://provider.invalid", VISION_MODEL: "test" };
  const original = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => ++requests === 1
    ? Response.json({ error: { code: "RequestBurstTooFast" } }, { status: 429, headers: { "Retry-After": "20" } })
    : Response.json({ choices: [{ message: { content: "{}" } }] }));
  try {
    Object.assign(process.env, settings);
    const provider = new OpenAiCompatibleProvider();
    await assert.rejects(provider.runNode("question_extraction", {}, z.object({})), error => {
      assert(error instanceof ProviderRequestError);
      assert.equal(error.providerCode, "RequestBurstTooFast");
      assert.equal(providerRetryDelay(error, 1, () => 0), 20_000);
      return true;
    });
    assert.deepEqual(await provider.runNode("question_extraction", {}, z.object({})), {});
    assert.equal(requests, 2);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
