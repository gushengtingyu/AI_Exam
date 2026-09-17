import { NextResponse } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { notFound } from "@/lib/http";
import { readPrivateFile, writeProcessedFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCrop(request: Request) {
  const value = new URL(request.url).searchParams.get("crop");
  if (!value) return null;
  const numbers = value.split(",").map(Number);
  if (numbers.length !== 4 || numbers.some((number) => !Number.isFinite(number))) return null;
  const [rawX, rawY, rawWidth, rawHeight] = numbers;
  if (rawX < 0 || rawY < 0 || rawWidth <= 0 || rawHeight <= 0 || rawX > 1 || rawY > 1) return null;
  const padding = 0.012;
  const centerX = rawX + rawWidth / 2;
  const centerY = rawY + rawHeight / 2;
  const targetWidth = Math.max(rawWidth + padding * 2, 0.48);
  const targetHeight = Math.max(rawHeight + padding * 2, 0.12);
  const x = Math.max(0, Math.min(1 - targetWidth, centerX - targetWidth / 2));
  const y = Math.max(0, Math.min(1 - targetHeight, centerY - targetHeight / 2));
  const right = Math.min(1, x + targetWidth);
  const bottom = Math.min(1, y + targetHeight);
  return { x, y, width: right - x, height: bottom - y };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const image = await db.paperImage.findUnique({ where: { id } });
  if (!image) return notFound("图片不存在");
  try {
    const crop = parseCrop(request);
    let processed = Boolean(image.processedKey);
    let bytes = await readPrivateFile(image.processedKey || image.storageKey);
    if (crop) {
      const cropToken = [crop.x, crop.y, crop.width, crop.height].map((value) => Math.round(value * 100_000)).join("-");
      const cropKey = `evidence-crops/${image.id}/${cropToken}.jpg`;
      try {
        bytes = await readPrivateFile(cropKey);
      } catch {
        const metadata = await sharp(bytes).metadata();
        if (!metadata.width || !metadata.height) throw new Error("图片尺寸不可用");
        const left = Math.max(0, Math.floor(crop.x * metadata.width));
        const top = Math.max(0, Math.floor(crop.y * metadata.height));
        const width = Math.max(1, Math.min(metadata.width - left, Math.ceil(crop.width * metadata.width)));
        const height = Math.max(1, Math.min(metadata.height - top, Math.ceil(crop.height * metadata.height)));
        bytes = await sharp(bytes).extract({ left, top, width, height }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
        await writeProcessedFile(cropKey, bytes);
      }
      processed = true;
    }
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": processed ? "image/jpeg" : image.mimeType,
        "Cache-Control": crop ? "private, max-age=3600, immutable" : "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="evidence-${image.id}${processed ? ".jpg" : ""}"`,
      },
    });
  } catch {
    return notFound("图片文件不可用");
  }
}
