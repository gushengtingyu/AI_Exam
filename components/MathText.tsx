import katex from "katex";
import "katex/dist/katex.min.css";

type MathSegment = { value: string; math: boolean; display: boolean };

/** 把文本按 $...$（行内）、$$...$$、\(...\)、\[...\] 切成数学段与普通文本段 */
function splitMath(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  const pattern = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > lastIndex) segments.push({ value: text.slice(lastIndex, start), math: false, display: false });
    const display = match[1] !== undefined || match[3] !== undefined;
    const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
    segments.push({ value, math: true, display });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ value: text.slice(lastIndex), math: false, display: false });
  return segments;
}

function renderMath(value: string, display: boolean) {
  try {
    return katex.renderToString(value, { displayMode: display, throwOnError: false, strict: false, output: "html" });
  } catch {
    return null;
  }
}

/**
 * 题干、作答、解析里混着 LaTeX（如 $f(x)=e^x-ax$），直接当文本显示没人看得懂。
 * 这里用 KaTeX 渲染数学段；渲染失败时退回原文，不吞内容。
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  const source = text ?? "";
  if (!source) return null;
  const segments = splitMath(source);
  return (
    <span className={className}>
      {segments.map((segment, index) => {
        if (!segment.math) return <span key={index}>{segment.value}</span>;
        const html = renderMath(segment.value, segment.display);
        if (html === null) return <span key={index}>{segment.value}</span>;
        return <span key={index} className={segment.display ? "math-display" : "math-inline"} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </span>
  );
}
