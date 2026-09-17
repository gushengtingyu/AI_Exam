import { readFile } from "node:fs/promises";
import path from "node:path";

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) return [];
    return [[match[1], match[2].replace(/^(?:"(.*)"|'(.*)')$/, "$1$2")]];
  }));
}

const imagePath = process.argv[2];
if (!imagePath) throw new Error("Usage: node scripts/probe-vision-provider.mjs <image-path>");

const env = parseEnv(await readFile(path.resolve(".env"), "utf8"));
const provider = (env.VISION_PROVIDER || "openai-compatible").replace(/[^a-z0-9]+/gi, "_").toUpperCase();
const apiKey = provider === "OPENAI_COMPATIBLE" ? env.VISION_API_KEY : env[`${provider}_API_KEY`];
const baseUrl = provider === "OPENAI_COMPATIBLE" ? env.VISION_BASE_URL : env[`${provider}_BASE_URL`];
const model = provider === "OPENAI_COMPATIBLE"
  ? env.VISION_MODEL
  : env[`${provider}_VISION_MODEL`] || env[`${provider}_MODEL`];
if (!apiKey || !baseUrl || !model) throw new Error("Vision provider configuration is incomplete");

const image = await readFile(path.resolve(imagePath));
const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    max_tokens: 256,
    temperature: 0,
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image.toString("base64")}` } },
        { type: "text", text: "只返回 JSON：识别图片是否为试卷，并给出可见题目数量估计。字段为 is_exam、question_count_estimate、summary。" },
      ],
    }],
  }),
  signal: AbortSignal.timeout(90_000),
});

const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  const message = payload?.error?.message || payload?.message || "Provider request failed";
  throw new Error(`${response.status}: ${message}`);
}
const content = payload?.choices?.[0]?.message?.content;
console.log(JSON.stringify({ provider: provider.toLowerCase(), model, status: response.status, content }, null, 2));
