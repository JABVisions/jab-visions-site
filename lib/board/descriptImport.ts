"use client";

// Descript document import. The goal is to CONTINUE WORK inside Board, not just
// view files — so we extract readable text and hand back sanitizer-safe HTML that
// drops straight into the editor.
//
// Coverage:
//   .txt  — native (plain text → paragraphs)
//   .md   — native (lightweight Markdown → HTML)
//   .rtf  — native best-effort (strip RTF control words)
//   .docx — best-effort: needs a parser (mammoth/JSZip). Falls back gracefully
//           with a clear note so the user can paste, and there's a single clean
//           seam (extractDocx) to wire a real parser in later.
//   .pdf  — best-effort: same pattern (extractPdf seam for pdf.js / an API).

import JSZip from "jszip";
import { sanitizeDescriptHtml, descriptPlainText } from "@/lib/board/descriptDocs";

export type DescriptImportResult = {
  title: string;
  html: string;
  plainText: string;
  /** True when text was actually extracted; false when only a fallback applied. */
  ok: boolean;
  /** Human-readable status for the UI (success or "couldn't extract" guidance). */
  note: string;
  format: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fileExt(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

function titleFromFileName(name: string): string {
  return (name || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[._-]+/g, " ")
    .trim()
    .slice(0, 200);
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Plain text → paragraphs (blank lines split paragraphs, single newlines → <br>). */
function plainTextToHtml(text: string): string {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return blocks
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => `<p>${escapeHtml(b).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Minimal, safe Markdown → HTML (headings, bold/italic, lists, quote, paras). */
function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<i>$2</i>")
      .replace(/__([^_]+)__/g, "<u>$1</u>");

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const level = Math.min(3, h[1].length);
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      closeList();
      out.push(`<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }
    const ul = /^[-*+]\s+(.*)$/.exec(line);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join("");
}

/** RTF best-effort: drop groups/control words, unescape, collapse to text. */
function rtfToText(rtf: string): string {
  let s = rtf;
  s = s.replace(/\\par[d]?/g, "\n");
  s = s.replace(/\\'[0-9a-fA-F]{2}/g, " "); // hex-escaped chars → space
  s = s.replace(/\\[a-zA-Z]+-?\d* ?/g, ""); // control words
  s = s.replace(/[{}]/g, ""); // groups
  s = s.replace(/\\\n/g, "\n").replace(/\\/g, "");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

/** Extract plain text from Word document.xml inside a .docx zip. */
function docxXmlToText(xml: string): string {
  const lines: string[] = [];
  for (const chunk of xml.split(/<\/w:p>/i)) {
    const texts = [...chunk.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/gi)].map(
      (m) => m[1]
    );
    const line = texts.join("").trim();
    if (line) lines.push(line);
  }
  return lines.join("\n");
}

async function extractDocx(file: File): Promise<string | null> {
  try {
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")?.async("string");
    if (!xml) return null;
    const text = docxXmlToText(xml).trim();
    return text || null;
  } catch {
    return null;
  }
}

/** Seam for a future PDF text extractor (pdf.js or a server endpoint). */
async function extractPdf(_file: File): Promise<string | null> {
  return null;
}

export async function importDescriptDocument(file: File): Promise<DescriptImportResult> {
  const ext = fileExt(file.name) || (file.type.split("/")[1] ?? "");
  const title = titleFromFileName(file.name);
  const base = { title, format: ext || file.type || "document" };

  try {
    if (ext === "txt" || file.type === "text/plain") {
      const text = await readText(file);
      const html = sanitizeDescriptHtml(plainTextToHtml(text));
      return { ...base, html, plainText: descriptPlainText(html), ok: true, note: "Imported text — keep writing." };
    }

    if (ext === "md" || ext === "markdown" || file.type === "text/markdown") {
      const text = await readText(file);
      const html = sanitizeDescriptHtml(markdownToHtml(text));
      return { ...base, html, plainText: descriptPlainText(html), ok: true, note: "Imported Markdown — keep writing." };
    }

    if (ext === "rtf" || file.type === "application/rtf" || file.type === "text/rtf") {
      const text = rtfToText(await readText(file));
      const html = sanitizeDescriptHtml(plainTextToHtml(text));
      return { ...base, html, plainText: descriptPlainText(html), ok: true, note: "Imported RTF (best effort) — review formatting." };
    }

    if (ext === "docx") {
      const text = await extractDocx(file);
      if (text) {
        const html = sanitizeDescriptHtml(plainTextToHtml(text));
        return { ...base, html, plainText: descriptPlainText(html), ok: true, note: "Imported Word doc." };
      }
      return { ...base, html: "", plainText: "", ok: false, note: "Word (.docx) text extraction isn't wired up yet — open the file and paste your text here to keep working." };
    }

    if (ext === "pdf" || file.type === "application/pdf") {
      const text = await extractPdf(file);
      if (text) {
        const html = sanitizeDescriptHtml(plainTextToHtml(text));
        return { ...base, html, plainText: descriptPlainText(html), ok: true, note: "Imported PDF text (best effort)." };
      }
      return { ...base, html: "", plainText: "", ok: false, note: "PDF text extraction isn't wired up yet — paste the text here to keep working." };
    }

    // Unknown: try reading as text, else give a clean fallback.
    const text = await readText(file).catch(() => "");
    if (text && /[\w]/.test(text)) {
      const html = sanitizeDescriptHtml(plainTextToHtml(text));
      return { ...base, html, plainText: descriptPlainText(html), ok: true, note: "Imported as text." };
    }
    return { ...base, html: "", plainText: "", ok: false, note: "Couldn't read that file type — paste your text here to keep working." };
  } catch {
    return { ...base, html: "", plainText: "", ok: false, note: "Couldn't read that file — paste your text here to keep working." };
  }
}

export const DESCRIPT_IMPORT_ACCEPT =
  ".txt,.md,.markdown,.rtf,.docx,.pdf,text/plain,text/markdown,application/rtf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
