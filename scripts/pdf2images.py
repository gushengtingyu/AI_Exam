#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pdf2images.py · 试卷/答案 PDF 转图片批量工具
==============================================
把扫描版试卷 PDF 转成适配「学期卷析」上传的图片：
  - 横向大页（A3 横版，如 1094x754pt）= 左右两页 → **从中间切一刀分为两张**
  - 纵向页（A4，如 541x754pt）= 单页 → 整页导出一张
自动识别页面方向，无需手动指定模式。

用法：
  python pdf2images.py 输入.pdf                    # 输出到 输入_图片/ 目录
  python pdf2images.py 输入.pdf -o 输出目录
  python pdf2images.py 输入目录/ -o 输出目录        # 批量处理目录下所有 PDF
  python pdf2images.py 输入.pdf --dpi 220          # 调整渲染精度（默认 200）

依赖：PyMuPDF（已安装）；Pillow 可选（仅用于更高精度切分）。
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit("[错误] 需要 PyMuPDF：pip install pymupdf")

# 横纵判定阈值：宽/高 > 该值视为横向双页大版
LANDSCAPE_RATIO = 1.2


def convert_pdf(pdf_path: Path, out_dir: Path, dpi: int = 200, split_gap: int = 6) -> list[Path]:
    """转换单个 PDF，返回生成的图片路径列表。"""
    doc = fitz.open(pdf_path)
    stem = pdf_path.stem
    out_dir.mkdir(parents=True, exist_ok=True)
    produced: list[Path] = []
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)

    for page_index in range(len(doc)):
        page = doc[page_index]
        rect = page.rect
        is_landscape = (rect.width / rect.height) > LANDSCAPE_RATIO
        pix = page.get_pixmap(matrix=mat, alpha=False)

        if is_landscape:
            # 横向大版：从中间切两半（左右各一页），中间留 split_gap 像素避免切到字
            w, h = pix.width, pix.height
            half = w // 2
            boxes = [
                fitz.Rect(0, 0, half - split_gap // 2, h),                 # 左半
                fitz.Rect(half + split_gap // 2, 0, w, h),                 # 右半
            ]
            labels = ["L", "R"]
            for box, label in zip(boxes, labels):
                # 用 PyMuPDF 重新渲染裁剪区域，保持清晰度
                clip = fitz.Rect(
                    box.x0 / zoom, box.y0 / zoom, box.x1 / zoom, box.y1 / zoom
                )
                sub = page.get_pixmap(matrix=mat, clip=clip, alpha=False)
                out = out_dir / f"{stem}_p{page_index + 1}_{label}.png"
                sub.save(str(out))
                produced.append(out)
        else:
            out = out_dir / f"{stem}_p{page_index + 1}.png"
            pix.save(str(out))
            produced.append(out)

    doc.close()
    return produced


def main() -> int:
    ap = argparse.ArgumentParser(
        description="试卷/答案 PDF → 图片（横向大页自动中间分半，纵向页整页导出）"
    )
    ap.add_argument("input", help="PDF 文件或包含 PDF 的目录")
    ap.add_argument("-o", "--out", help="输出目录（默认：<输入名>_图片/）")
    ap.add_argument("--dpi", type=int, default=200, help="渲染精度，默认 200（扫描卷建议 180-240）")
    args = ap.parse_args()

    src = Path(args.input)
    if src.is_dir():
        pdfs = sorted(src.glob("*.pdf"))
        if not pdfs:
            sys.exit(f"[错误] {src} 下没有 PDF")
        out_root = Path(args.out) if args.out else src / "图片"
    elif src.suffix.lower() == ".pdf":
        pdfs = [src]
        out_root = Path(args.out) if args.out else src.parent / f"{src.stem}_图片"
    else:
        sys.exit(f"[错误] {src} 不是 PDF 文件或目录")

    total = 0
    for pdf in pdfs:
        produced = convert_pdf(pdf, out_root, dpi=args.dpi)
        landscape_note = ""
        try:
            doc = fitz.open(pdf)
            page0 = doc[0]
            if page0.rect.width / page0.rect.height > LANDSCAPE_RATIO:
                landscape_note = "（横向大版→已中间分半）"
            doc.close()
        except Exception:
            pass
        print(f"✓ {pdf.name}: {len(produced)} 张{landscape_note}")
        for p in produced:
            print(f"    {p.name}")
        total += len(produced)

    print(f"\n完成：{len(pdfs)} 个 PDF → {total} 张图片 → {out_root.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
