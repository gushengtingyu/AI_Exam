import { NextResponse } from "next/server";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, notFound } from "@/lib/http";
import { deletePrivateFile, savePrivateFile } from "@/lib/storage";
import { maxUploadBytes, maxUploadMb } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const formatTypes: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heif: "image/heif",
};

class UploadValidationError extends Error {}

type PreparedUpload = { name: string; buffer: Buffer; mimeType: string; size: number };

/** 横向大版判定：宽高比超过该值视为 A3 横版（左右两页），从中间分半 */
const LANDSCAPE_RATIO = 1.2;
const PDF_RENDER_DPI = 200;
const pdfRuntime = globalThis as unknown as { pdfImportBusy?: boolean };

/**
 * 把一个上传文件展开成若干张图片：
 * - 普通图片：校验格式后原样返回
 * - PDF：逐页渲染为 PNG；横向大版从中间分半（左右各一页），纵向页整页导出
 */
async function expandFileToUploads(file: File): Promise<PreparedUpload[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    const metadata = await sharp(buffer).metadata();
    const mimeType = formatTypes[metadata.format || ""];
    if (!mimeType) throw new Error(`不支持的图片格式：${file.name}`);
    return [{ name: file.name, buffer, mimeType, size: buffer.length }];
  }

  if (pdfRuntime.pdfImportBusy) throw new UploadValidationError("正在处理其他 PDF，请稍后重试");
  pdfRuntime.pdfImportBusy = true;
  try {
    const mupdf = await import("mupdf");
    const doc = mupdf.Document.openDocument(buffer, "application/pdf");
    try {
      const pageCount = doc.countPages();
      if (pageCount < 1 || pageCount > 40) throw new UploadValidationError("每次最多导入 40 页 PDF，请拆分后上传");
      const stem = file.name.replace(/\.pdf$/i, "");
      const uploads: PreparedUpload[] = [];
      let renderedBytes = 0;
      for (let index = 0; index < pageCount; index += 1) {
        const page = doc.loadPage(index);
        try {
          const bounds = page.getBounds();
          const pageWidth = bounds[2] - bounds[0];
          const pageHeight = bounds[3] - bounds[1];
          if (!Number.isFinite(pageWidth * pageHeight) || pageWidth <= 0 || pageHeight <= 0) throw new UploadValidationError("PDF 页面尺寸无效");
          const scale = Math.min(PDF_RENDER_DPI / 72, Math.sqrt(6_000_000 / (pageWidth * pageHeight)));
          const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB);
          let png: Buffer;
          try { png = Buffer.from(pixmap.asPNG()); } finally { pixmap.destroy(); }
          renderedBytes += png.length;
          if (renderedBytes > 48 * 1024 * 1024) throw new UploadValidationError("PDF 图片内容较大，请拆分后上传");
          if (pageWidth / pageHeight > LANDSCAPE_RATIO) {
            const meta = await sharp(png).metadata();
            const width = meta.width ?? 0;
            const height = meta.height ?? 0;
            if (width < 40) throw new UploadValidationError(`${file.name} 第 ${index + 1} 页尺寸异常`);
            const half = Math.floor(width / 2);
            const left = await sharp(png).extract({ left: 0, top: 0, width: half - 3, height }).png().toBuffer();
            const right = await sharp(png).extract({ left: half + 3, top: 0, width: width - half - 3, height }).png().toBuffer();
            uploads.push({ name: `${stem}_p${index + 1}_L.png`, buffer: left, mimeType: "image/png", size: left.length });
            uploads.push({ name: `${stem}_p${index + 1}_R.png`, buffer: right, mimeType: "image/png", size: right.length });
          } else {
            uploads.push({ name: `${stem}_p${index + 1}.png`, buffer: png, mimeType: "image/png", size: png.length });
          }
        } finally { page.destroy(); }
      }
      return uploads;
    } finally { doc.destroy(); }
  } finally { pdfRuntime.pdfImportBusy = false; }
}

function uploadResponse(analysisId: string, paperId: string, image: { id: string; fileName: string; pageOrder: number }, replay: boolean) {
  return {
    analysis_id: analysisId,
    job_id: null,
    report_id: null,
    status: "uploaded",
    paper_id: paperId,
    idempotent_replay: replay,
    images: [{ image_id: image.id, file_name: image.fileName, page_order: image.pageOrder }],
  };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const savedKeys: string[] = [];
  let analysisId = "";
  let paperId = "";
  const requestKey = request.headers.get("Idempotency-Key")?.trim() || null;
  try {
    const { id } = await context.params;
    analysisId = id;
    const form = await request.formData();
    paperId = String(form.get("paper_id") || "");
    const kind = String(form.get("kind") || "paper");
    // 共用素材：多人同卷时试卷与权威答案只上传一份，标记后所有学生共用
    const shared = String(form.get("shared") || "") === "true";
    const rawPageOrder = form.get("page_order");
    const requestedPageOrder = rawPageOrder === null || String(rawPageOrder).trim() === ""
      ? null
      : Number(String(rawPageOrder));
    if (requestKey && requestKey.length > 200) {
      return NextResponse.json({ error: "validation_error", message: "Idempotency-Key 最多 200 个字符" }, { status: 400 });
    }
    if (!paperId) return NextResponse.json({ error: "validation_error", message: "缺少 paper_id" }, { status: 400 });
    if (requestedPageOrder !== null && (!Number.isInteger(requestedPageOrder) || requestedPageOrder < 0 || requestedPageOrder >= 80)) {
      return NextResponse.json({ error: "validation_error", message: "page_order 必须是 0–79 的整数" }, { status: 400 });
    }
    if (!new Set(["paper", "answer_key"]).has(kind)) {
      return NextResponse.json({ error: "validation_error", message: "kind 仅支持 paper 或 answer_key" }, { status: 400 });
    }
    const paper = await db.paper.findFirst({ where: { id: paperId, analysisId: id }, select: { id: true } });
    if (!paper) return notFound("试卷不存在或不属于该任务");
    if (requestKey) {
      const existing = await db.paperImage.findUnique({
        where: { uploadRequestId: requestKey },
        include: { paper: { select: { analysisId: true } } },
      });
      if (existing) {
        if (existing.paperId !== paperId || existing.paper.analysisId !== id) {
          return NextResponse.json({ error: "idempotency_conflict", message: "该 Idempotency-Key 已用于其他图片上传" }, { status: 409 });
        }
        return NextResponse.json(uploadResponse(id, paperId, existing, true), { headers: { "X-Idempotent-Replay": "true" } });
      }
    }
    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) return NextResponse.json({ error: "validation_error", message: "请选择图片" }, { status: 400 });
    if (requestKey && files.length !== 1) {
      return NextResponse.json({ error: "validation_error", message: "带 Idempotency-Key 的上传每次只能包含一张图片" }, { status: 400 });
    }
    const currentImageCount = await db.paperImage.count({ where: { paperId } });
    if (currentImageCount + files.length > 80) {
      return NextResponse.json({ error: "validation_error", message: "每套试卷最多上传 80 张图片" }, { status: 400 });
    }
    const currentMaxOrder = await db.paperImage.aggregate({ where: { paperId }, _max: { pageOrder: true } });
    const firstPageOrder = requestedPageOrder ?? ((currentMaxOrder._max.pageOrder ?? -1) + 1);
    const maxBytes = maxUploadBytes();
    const maxMb = maxUploadMb();
    const prepared: PreparedUpload[] = [];
    for (const file of files) {
      if (file.size > maxBytes) throw new Error(`${file.name} 超过 ${maxMb}MB`);
      prepared.push(...await expandFileToUploads(file));
      if (prepared.reduce((total, item) => total + item.size, 0) > 48 * 1024 * 1024) throw new UploadValidationError("本次图片内容较大，请分批上传");
    }
    if (currentImageCount + prepared.length > 80) {
      return NextResponse.json({ error: "validation_error", message: `PDF 展开后共 ${currentImageCount + prepared.length} 页，超过每套试卷 80 页的上限（PDF 横向大页会按左右分半计数）` }, { status: 400 });
    }
    if (firstPageOrder + prepared.length > 80) {
      return NextResponse.json({ error: "validation_error", message: "page_order 超出每套试卷 80 页的范围" }, { status: 400 });
    }
    const saved: Array<{ name: string; size: number; mimeType: string; storageKey: string }> = [];
    for (const item of prepared) {
      const storageKey = await savePrivateFile(id, item.name, item.buffer);
      savedKeys.push(storageKey);
      saved.push({ name: item.name, size: item.size, mimeType: item.mimeType, storageKey });
    }
    const created = await db.$transaction(async (tx) => {
      const existingCount = await tx.paperImage.count({ where: { paperId } });
      if (existingCount + saved.length > 80) throw new UploadValidationError("每套试卷最多上传 80 张图片");
      const pageOrders = saved.map((_, index) => firstPageOrder + index);
      const occupied = await tx.paperImage.findFirst({ where: { paperId, pageOrder: { in: pageOrders } }, select: { pageOrder: true } });
      if (occupied) throw new UploadValidationError(`第 ${occupied.pageOrder + 1} 页已存在，请刷新任务后重试`);
      const records = [];
      for (let index = 0; index < saved.length; index += 1) {
        const { name, size, mimeType, storageKey } = saved[index];
        const image = await tx.paperImage.create({
          data: {
            uploadRequestId: index === 0 ? requestKey : null,
            paperId,
            kind,
            shared,
            fileName: name,
            storageKey,
            mimeType,
            size,
            pageOrder: firstPageOrder + index,
          },
        });
        records.push({ image_id: image.id, file_name: image.fileName, page_order: image.pageOrder });
      }
      return records;
    });
    return NextResponse.json({ analysis_id: id, job_id: null, report_id: null, status: "uploaded", paper_id: paperId, idempotent_replay: false, images: created }, { headers: { "X-Idempotent-Replay": "false" } });
  } catch (error) {
    await Promise.allSettled(savedKeys.map((key) => deletePrivateFile(key)));
    if (analysisId && paperId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      if (requestKey) {
        const existing = await db.paperImage.findUnique({ where: { uploadRequestId: requestKey } });
        if (existing?.paperId === paperId) {
          return NextResponse.json(uploadResponse(analysisId, paperId, existing, true), { headers: { "X-Idempotent-Replay": "true" } });
        }
      }
      return NextResponse.json({ error: "upload_conflict", message: "图片页序或上传请求已存在，请刷新任务后重试" }, { status: 409 });
    }
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: "validation_error", message: error.message }, { status: 400 });
    }
    return apiError(error, "图片上传失败");
  }
}
