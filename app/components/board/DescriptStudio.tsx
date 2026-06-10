// Drop Studio — Descript Mode. Apple Notes meets Board OS: start from blank,
// template, or import; write in a polished cockpit; auto-save locally; share
// into Drop Console as Thought, Doc, or Announcement.

"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  countCharacters,
  countWords,
  descriptPlainText,
  getDescriptOwnerId,
  newDescriptId,
  readDescriptDocs,
  readDescriptTheme,
  removeDescriptDoc,
  sanitizeDescriptHtml,
  saveDescriptDoc,
  saveDescriptTheme,
  type DescriptTheme,
  DESCRIPT_DOCS_UPDATED_EVENT,
  DESCRIPT_SHARE_EVENT,
  type DescriptDestination,
  type DescriptDoc,
  type DescriptSourceKind,
} from "@/lib/board/descriptDocs";
import { DESCRIPT_IMPORT_ACCEPT, importDescriptDocument } from "@/lib/board/descriptImport";
import {
  buildDescriptPages,
  scanDescriptHeadings,
  scrollToDescriptAnchor,
  type DescriptHeadingItem,
  type DescriptPageItem,
} from "@/lib/board/descriptNav";
import { DESCRIPT_TEMPLATES } from "@/lib/board/descriptTemplates";
import { normalizeInlineMarkup } from "@/lib/board/richText";

type ToolId =
  | "bold"
  | "italic"
  | "underline"
  | "heading"
  | "quote"
  | "bullet"
  | "numbered"
  | "alignLeft"
  | "alignCenter"
  | "alignRight";

type Phase = "launcher" | "editor";

/** Light “paper” theme overrides (injected into both launcher + editor styles). */
const DESCRIPT_DAY_CSS = `
  .descript.day .dBrand { color: #1a2430; }
  .descript.day .dSub { color: rgba(40, 50, 65, 0.58); }
  .descript.day .dTitle {
    background: #fff;
    color: #1a2430;
    border-color: rgba(0, 0, 0, 0.12);
  }
  .descript.day .dTitle::placeholder { color: rgba(40, 50, 65, 0.38); }
  .descript.day .dNavBtn,
  .descript.day .dGhost,
  .descript.day .dThemeBtn,
  .descript.day .dBack {
    color: #2a3448;
    background: rgba(0, 0, 0, 0.04);
    border-color: rgba(0, 0, 0, 0.12);
  }
  .descript.day .dNavBtn.on,
  .descript.day .dTool.on {
    color: #06121a;
    background: linear-gradient(180deg, #fff, #e8f4ff);
    border-color: rgba(80, 140, 220, 0.45);
  }
  .descript.day .dPageSelect {
    background: #fff;
    color: #1a2430;
    border-color: rgba(0, 0, 0, 0.14);
  }
  .descript.day .dOutline {
    background: #f8fafc;
    border-color: rgba(0, 0, 0, 0.1);
  }
  .descript.day .dOutlineItem { color: #2a3448; }
  .descript.day .dOutlineItem:hover { background: rgba(80, 140, 220, 0.12); }
  .descript.day .dOutlineEmpty { color: rgba(40, 50, 65, 0.5); }
  .descript.day .dToolbar {
    background: #f6f8fb;
    border-color: rgba(0, 0, 0, 0.1);
  }
  .descript.day .dTool {
    color: #2a3448;
    background: #fff;
    border-color: rgba(0, 0, 0, 0.12);
  }
  .descript.day .dTool:hover {
    background: #eef4ff;
    border-color: rgba(80, 140, 220, 0.4);
  }
  .descript.day .dBody {
    background: #fff;
    color: #1a2430;
    border-color: rgba(0, 0, 0, 0.12);
  }
  .descript.day .dBody:empty::before { color: rgba(40, 50, 65, 0.38); }
  .descript.day .dBody :global(h2) { color: #1a3a52; }
  .descript.day .dBody :global(blockquote) {
    color: #3a4a5c;
    border-left-color: rgba(80, 140, 220, 0.65);
  }
  .descript.day .dCounts { color: rgba(40, 50, 65, 0.55); }
  .descript.day .dLaunchPrimary,
  .descript.day .dLaunchSecondary,
  .descript.day .dTemplateCard,
  .descript.day .dDraftRow {
    background: #fff;
    color: #1a2430;
    border-color: rgba(0, 0, 0, 0.1);
  }
  .descript.day .dLaunchPrimary small,
  .descript.day .dLaunchSecondary small,
  .descript.day .dDraftMeta { color: rgba(40, 50, 65, 0.52); }
  .descript.day .dSectionLabel { color: rgba(40, 50, 65, 0.45); }
  .descript.day .dDraftOpen { color: #1a2430; }
  .descript.day .dShare {
    background: linear-gradient(180deg, #fff, #cfe8ff);
    color: #06121a;
  }
`;

const DEST_LABELS: Record<DescriptDestination, string> = {
  doc: "Doc Drop",
  thought: "Thought",
  announcement: "Announcement",
  pay: "Pay Drop",
  work: "Work Drop",
};

function formatDraftTime(ts: number) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function DescriptStudio({
  onClose,
  onShared,
  startInEditor = false,
  defaultDestination = "doc",
}: {
  onClose?: () => void;
  onShared?: (doc: DescriptDoc) => void;
  /** Skip the launcher when reopening from a host that already picked a doc. */
  startInEditor?: boolean;
  /** Drop type chosen in Drop Console before opening Descript. */
  defaultDestination?: DescriptDestination;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const editorImportRef = useRef<HTMLInputElement>(null);
  const docIdRef = useRef<string>(newDescriptId());
  const ownerIdRef = useRef<string | null>(null);
  const noteTimerRef = useRef<number | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const sourceKindRef = useRef<DescriptSourceKind>("blank");
  const templateKeyRef = useRef<string | undefined>(undefined);
  /** HTML waiting to embed once the editor body mounts (fixes import race). */
  const pendingSeedRef = useRef<{ html: string; mode: "replace" | "append" } | null>(null);

  const [phase, setPhase] = useState<Phase>(startInEditor ? "editor" : "launcher");
  const [title, setTitle] = useState("");
  const [counts, setCounts] = useState({ words: 0, chars: 0 });
  const [note, setNote] = useState("");
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [destination, setDestination] = useState<DescriptDestination>(defaultDestination);
  const [drafts, setDrafts] = useState<DescriptDoc[]>([]);
  const [importing, setImporting] = useState(false);
  const [headings, setHeadings] = useState<DescriptHeadingItem[]>([]);
  const [pages, setPages] = useState<DescriptPageItem[]>([{ index: 0, label: "Start", anchorId: "" }]);
  const [pageIndex, setPageIndex] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [theme, setTheme] = useState<DescriptTheme>("night");

  useEffect(() => {
    setTheme(readDescriptTheme());
  }, []);

  useEffect(() => {
    setDestination(defaultDestination);
  }, [defaultDestination]);

  function toggleTheme() {
    setTheme((prev) => {
      const next: DescriptTheme = prev === "night" ? "day" : "night";
      saveDescriptTheme(next);
      return next;
    });
  }

  const refreshDrafts = useCallback(() => {
    setDrafts(readDescriptDocs().slice(0, 12));
  }, []);

  useEffect(() => {
    void getDescriptOwnerId().then((id) => {
      ownerIdRef.current = id;
    });
    refreshDrafts();
    const onUpdated = () => refreshDrafts();
    window.addEventListener(DESCRIPT_DOCS_UPDATED_EVENT, onUpdated as EventListener);
    return () => window.removeEventListener(DESCRIPT_DOCS_UPDATED_EVENT, onUpdated as EventListener);
  }, [refreshDrafts]);

  const refreshCounts = useCallback(() => {
    const text = bodyRef.current?.textContent ?? "";
    setCounts({ words: countWords(text), chars: countCharacters(text) });
  }, []);

  const refreshActive = useCallback(() => {
    if (typeof document === "undefined") return;
    const q = (cmd: string) => {
      try {
        return document.queryCommandState(cmd);
      } catch {
        return false;
      }
    };
    setActive({
      bold: q("bold"),
      italic: q("italic"),
      underline: q("underline"),
      bullet: q("insertUnorderedList"),
      numbered: q("insertOrderedList"),
    });
  }, []);

  useEffect(() => {
    const handler = () => refreshActive();
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [refreshActive]);

  const flashNote = useCallback((message: string) => {
    setNote(message);
    if (noteTimerRef.current) window.clearTimeout(noteTimerRef.current);
    noteTimerRef.current = window.setTimeout(() => setNote(""), 2400);
  }, []);

  const refreshNav = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const nextHeadings = scanDescriptHeadings(el);
    const nextPages = buildDescriptPages(el);
    setHeadings(nextHeadings);
    setPages(nextPages);
    setPageIndex((prev) => Math.min(prev, Math.max(0, nextPages.length - 1)));
  }, []);

  function applySeedToBody(html: string, mode: "replace" | "append") {
    const el = bodyRef.current;
    if (!el) return false;
    const clean = sanitizeDescriptHtml(html);
    if (mode === "append" && el.innerHTML.trim()) {
      el.innerHTML = `${el.innerHTML}<p><br></p>${clean}`;
    } else {
      el.innerHTML = clean;
    }
    refreshCounts();
    refreshNav();
    return true;
  }

  // Apply pending import/template HTML after the editor body is in the DOM.
  useLayoutEffect(() => {
    if (phase !== "editor" || !pendingSeedRef.current) return;
    const { html, mode } = pendingSeedRef.current;
    const applied = applySeedToBody(html, mode);
    if (applied) pendingSeedRef.current = null;
  }, [phase]);

  function queueSeed(html: string, mode: "replace" | "append" = "replace") {
    pendingSeedRef.current = { html, mode };
    if (phase === "editor") {
      window.requestAnimationFrame(() => {
        if (pendingSeedRef.current) {
          const applied = applySeedToBody(
            pendingSeedRef.current.html,
            pendingSeedRef.current.mode
          );
          if (applied) pendingSeedRef.current = null;
        }
      });
    }
  }

  function openEditor(opts: {
    id?: string;
    title?: string;
    html?: string;
    sourceKind?: DescriptSourceKind;
    templateKey?: string;
  }) {
    docIdRef.current = opts.id ?? newDescriptId();
    sourceKindRef.current = opts.sourceKind ?? "blank";
    templateKeyRef.current = opts.templateKey;
    setTitle(opts.title ?? "");
    setPageIndex(0);
    setOutlineOpen(false);
    setDestination(defaultDestination);
    queueSeed(opts.html ?? "", "replace");
    setPhase("editor");
  }

  function beginBlank() {
    openEditor({ sourceKind: "blank" });
  }

  function beginTemplate(key: string) {
    const t = DESCRIPT_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    openEditor({
      title: "",
      html: t.seedHtml,
      sourceKind: "template",
      templateKey: t.key,
    });
    window.setTimeout(() => {
      const input = document.querySelector<HTMLTextAreaElement>(".dTitle");
      if (input && !title) input.placeholder = t.titleHint;
    }, 0);
  }

  async function embedImportedFile(
    file: File | undefined,
    opts?: { intoEditor?: boolean; append?: boolean }
  ) {
    if (!file) return;
    setImporting(true);
    try {
      const result = await importDescriptDocument(file);
      if (!result.html && !result.ok) {
        flashNote(result.note);
        if (opts?.intoEditor) openEditor({ sourceKind: "upload" });
        return;
      }
      if (opts?.intoEditor && phase === "editor") {
        queueSeed(result.html, opts.append ? "append" : "replace");
        if (result.title && !title.trim()) setTitle(result.title);
        sourceKindRef.current = "upload";
        flashNote(result.note);
      } else {
        openEditor({
          title: result.title,
          html: result.html,
          sourceKind: "upload",
        });
        flashNote(result.note);
      }
    } catch {
      flashNote("Couldn't import that file");
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
      if (editorImportRef.current) editorImportRef.current.value = "";
    }
  }

  function deleteDraft(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Delete this Descript draft?")) return;
    removeDescriptDoc(id);
    refreshDrafts();
    flashNote("Draft deleted");
  }

  function jumpToPage(index: number) {
    const page = pages[index];
    if (!page) return;
    setPageIndex(index);
    scrollToDescriptAnchor(bodyRef.current, page.anchorId);
  }

  function jumpToHeading(id: string) {
    scrollToDescriptAnchor(bodyRef.current, id);
    setOutlineOpen(false);
  }

  function resumeDraft(doc: DescriptDoc) {
    openEditor({
      id: doc.id,
      title: doc.title,
      html: doc.html,
      sourceKind: doc.sourceKind,
      templateKey: doc.templateKey,
    });
    setDestination(doc.destination ?? defaultDestination);
  }

  function focusBody() {
    bodyRef.current?.focus();
  }

  function runCommand(command: string, value?: string) {
    focusBody();
    try {
      document.execCommand("styleWithCSS", false, "false");
    } catch {}
    try {
      document.execCommand(command, false, value);
    } catch {}
    const el = bodyRef.current;
    if (el) {
      const normalized = normalizeInlineMarkup(el.innerHTML);
      if (normalized !== el.innerHTML) el.innerHTML = normalized;
    }
    refreshCounts();
    refreshActive();
  }

  function toggleBlock(tag: "H2" | "BLOCKQUOTE") {
    focusBody();
    let current = "";
    try {
      current = String(document.queryCommandValue("formatBlock") || "").toUpperCase();
    } catch {}
    const next = current === tag ? "P" : tag;
    try {
      document.execCommand("formatBlock", false, next);
    } catch {}
    refreshCounts();
  }

  function onTool(tool: ToolId) {
    switch (tool) {
      case "bold":
        return runCommand("bold");
      case "italic":
        return runCommand("italic");
      case "underline":
        return runCommand("underline");
      case "heading":
        return toggleBlock("H2");
      case "quote":
        return toggleBlock("BLOCKQUOTE");
      case "bullet":
        return runCommand("insertUnorderedList");
      case "numbered":
        return runCommand("insertOrderedList");
      case "alignLeft":
        return runCommand("justifyLeft");
      case "alignCenter":
        return runCommand("justifyCenter");
      case "alignRight":
        return runCommand("justifyRight");
    }
  }

  function buildDoc() {
    const html = sanitizeDescriptHtml(bodyRef.current?.innerHTML ?? "");
    const plainText = descriptPlainText(html);
    return { html, plainText };
  }

  function save(silent = false): DescriptDoc | null {
    const { html, plainText } = buildDoc();
    const cleanTitle = title.trim();
    if (!cleanTitle && !plainText.trim()) {
      if (!silent) flashNote("Add a title or some words first");
      return null;
    }
    const doc = saveDescriptDoc({
      id: docIdRef.current,
      title: cleanTitle || "Untitled Descript",
      html,
      plainText,
      userId: ownerIdRef.current,
      sourceKind: sourceKindRef.current,
      templateKey: templateKeyRef.current,
      destination,
    });
    if (doc) {
      docIdRef.current = doc.id;
      if (!silent) flashNote("Saved to Descript drafts 🗂");
      refreshDrafts();
    } else if (!silent) {
      flashNote("Couldn't save (storage full?)");
    }
    return doc;
  }

  // Auto-save while editing (Apple Notes-style continuity).
  useEffect(() => {
    if (phase !== "editor") return;
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      const { plainText } = buildDoc();
      if (title.trim() || plainText.trim()) save(true);
    }, 4000);
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    };
  }, [phase, title, counts.chars]);

  function shareToBoard() {
    const doc = save();
    if (!doc) return;
    const payload = { ...doc, destination };
    try {
      window.dispatchEvent(new CustomEvent(DESCRIPT_SHARE_EVENT, { detail: payload }));
    } catch {}
    onShared?.(payload);
    flashNote(`Sent to Drop Console as ${DEST_LABELS[destination] ?? "drop"} ✓`);
    onClose?.();
  }

  const TOOLS: { id: ToolId; label: string; glyph: string; group: number }[] = [
    { id: "bold", label: "Bold", glyph: "B", group: 0 },
    { id: "italic", label: "Italic", glyph: "I", group: 0 },
    { id: "underline", label: "Underline", glyph: "U", group: 0 },
    { id: "heading", label: "Heading", glyph: "H", group: 1 },
    { id: "quote", label: "Quote", glyph: "❝", group: 1 },
    { id: "bullet", label: "Bullet list", glyph: "•", group: 2 },
    { id: "numbered", label: "Numbered list", glyph: "1.", group: 2 },
    { id: "alignLeft", label: "Align left", glyph: "⇤", group: 3 },
    { id: "alignCenter", label: "Align center", glyph: "↔", group: 3 },
    { id: "alignRight", label: "Align right", glyph: "⇥", group: 3 },
  ];

  if (phase === "launcher") {
    return (
      <div className={`descript ${theme}`}>
        <div className="dHead">
          <div className="dBrand">
            <span className="dDot" aria-hidden />
            DESCRIPT
          </div>
          <div className="dHeadRight">
            <span className="dSub">Apple Notes meets Board OS</span>
            <button
              type="button"
              className="dThemeBtn"
              onClick={toggleTheme}
              aria-label={theme === "day" ? "Switch to night mode" : "Switch to day mode"}
              title={theme === "day" ? "Night mode" : "Day mode"}
            >
              {theme === "day" ? "🌙" : "☀️"}
            </button>
          </div>
        </div>

        <div className="dLauncher">
          <div className="dLaunchRow">
            <button type="button" className="dLaunchPrimary" onClick={beginBlank}>
              <span className="dLaunchGlyph" aria-hidden>
                ✦
              </span>
              <span>
                <strong>New Descript</strong>
                <small>Blank page — start writing</small>
              </span>
            </button>
            <button
              type="button"
              className="dLaunchSecondary"
              disabled={importing}
              onClick={() => importRef.current?.click()}
            >
              <span className="dLaunchGlyph" aria-hidden>
                📥
              </span>
              <span>
                <strong>{importing ? "Importing…" : "Import file"}</strong>
                <small>.txt · .md · .rtf · .docx</small>
              </span>
            </button>
            <input
              ref={importRef}
              type="file"
              accept={DESCRIPT_IMPORT_ACCEPT}
              className="dHiddenInput"
              disabled={importing}
              onChange={(e) => void embedImportedFile(e.target.files?.[0])}
            />
          </div>

          <div className="dSectionLabel">Templates</div>
          <div className="dTemplateGrid">
            {DESCRIPT_TEMPLATES.filter((t) => t.key !== "blank").map((t) => (
              <button
                key={t.key}
                type="button"
                className="dTemplateCard"
                onClick={() => beginTemplate(t.key)}
              >
                <span className="dTemplateGlyph" aria-hidden>
                  {t.glyph}
                </span>
                <span className="dTemplateName">{t.label}</span>
              </button>
            ))}
          </div>

          {drafts.length > 0 ? (
            <>
              <div className="dSectionLabel">Recent drafts</div>
              <div className="dDraftList">
                {drafts.map((doc) => (
                  <div key={doc.id} className="dDraftRow">
                    <button
                      type="button"
                      className="dDraftOpen"
                      onClick={() => resumeDraft(doc)}
                    >
                      <span className="dDraftTitle">{doc.title || "Untitled Descript"}</span>
                      <span className="dDraftMeta">
                        {formatDraftTime(doc.updatedAt)} · {countWords(doc.plainText)} words
                      </span>
                    </button>
                    <button
                      type="button"
                      className="dDraftDelete"
                      aria-label={`Delete ${doc.title || "draft"}`}
                      title="Delete draft"
                      onClick={(e) => deleteDraft(doc.id, e)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {onClose ? (
          <div className="dFoot">
            <button type="button" className="dGhost" onClick={onClose}>
              Close
            </button>
          </div>
        ) : null}

        <style jsx>{`
          .descript {
            flex: 1 1 auto;
            min-height: 0;
            min-width: 0;
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 14px 12px;
          }
          @media (min-width: 520px) {
            .descript {
              padding: 16px 14px;
            }
          }
          .dHead {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
            min-width: 0;
          }
          .dHeadRight {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            min-width: 0;
          }
          .dThemeBtn {
            flex: 0 0 auto;
            width: 34px;
            height: 34px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.16);
            background: rgba(255, 255, 255, 0.06);
            font-size: 16px;
            line-height: 1;
            cursor: pointer;
          }
          .dThemeBtn:hover {
            border-color: rgba(126, 226, 255, 0.45);
            background: rgba(126, 226, 255, 0.12);
          }
          .dBrand {
            display: inline-flex;
            align-items: center;
            gap: 9px;
            font-size: 12px;
            font-weight: 950;
            letter-spacing: 0.14em;
            color: rgba(255, 255, 255, 0.92);
            min-width: 0;
          }
          .dDot {
            width: 9px;
            height: 9px;
            border-radius: 999px;
            background: radial-gradient(circle at 35% 30%, #fff, #7ee2ff);
            box-shadow: 0 0 12px rgba(126, 226, 255, 0.8);
          }
          .dSub {
            font-size: 11px;
            color: rgba(236, 255, 251, 0.55);
          }
          .dLauncher {
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            display: flex;
            flex-direction: column;
            gap: 14px;
          }
          .dLaunchRow {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }
          @media (max-width: 520px) {
            .dLaunchRow {
              grid-template-columns: 1fr;
            }
          }
          .dLaunchPrimary,
          .dLaunchSecondary {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 16px;
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.16);
            background: rgba(255, 255, 255, 0.06);
            color: #eef9ff;
            cursor: pointer;
            text-align: left;
          }
          .dLaunchPrimary strong,
          .dLaunchSecondary strong {
            display: block;
            font-size: 14px;
            font-weight: 900;
          }
          .dLaunchPrimary small,
          .dLaunchSecondary small {
            display: block;
            margin-top: 2px;
            font-size: 11px;
            color: rgba(236, 255, 251, 0.5);
            font-weight: 700;
          }
          .dLaunchPrimary:hover,
          .dLaunchSecondary:hover {
            border-color: rgba(126, 226, 255, 0.45);
            background: rgba(126, 226, 255, 0.1);
          }
          .dLaunchGlyph {
            font-size: 22px;
            line-height: 1;
          }
          .dHiddenInput {
            display: none;
          }
          .dSectionLabel {
            font-size: 10px;
            font-weight: 950;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: rgba(236, 255, 251, 0.45);
            margin-top: 4px;
          }
          .dTemplateGrid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
            gap: 8px;
          }
          .dTemplateCard {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            padding: 12px 8px;
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(6, 12, 18, 0.45);
            color: rgba(238, 249, 255, 0.9);
            cursor: pointer;
          }
          .dTemplateCard:hover {
            border-color: rgba(126, 226, 255, 0.4);
            background: rgba(126, 226, 255, 0.08);
          }
          .dTemplateGlyph {
            font-size: 20px;
          }
          .dTemplateName {
            font-size: 11px;
            font-weight: 800;
            text-align: center;
            line-height: 1.2;
          }
          .dDraftList {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .dDraftRow {
            display: flex;
            align-items: stretch;
            gap: 6px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.04);
            overflow: hidden;
          }
          .dDraftRow:hover {
            border-color: rgba(126, 226, 255, 0.35);
          }
          .dDraftOpen {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 2px;
            padding: 11px 14px;
            border: none;
            background: transparent;
            color: #eef9ff;
            cursor: pointer;
            text-align: left;
          }
          .dDraftDelete {
            flex: 0 0 auto;
            width: 40px;
            border: none;
            border-left: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(255, 80, 100, 0.08);
            color: rgba(255, 180, 190, 0.9);
            font-size: 14px;
            cursor: pointer;
          }
          .dDraftDelete:hover {
            background: rgba(255, 80, 100, 0.22);
            color: #fff;
          }
          .dDraftTitle {
            font-size: 13px;
            font-weight: 800;
          }
          .dDraftMeta {
            font-size: 11px;
            color: rgba(236, 255, 251, 0.48);
            font-weight: 700;
          }
          .dFoot {
            flex: 0 0 auto;
            display: flex;
            justify-content: flex-end;
          }
          .dGhost {
            border-radius: 999px;
            padding: 9px 15px;
            font-size: 12px;
            font-weight: 900;
            color: rgba(255, 255, 255, 0.86);
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
          cursor: pointer;
        }
        ${DESCRIPT_DAY_CSS}
        `}</style>
      </div>
    );
  }

  return (
    <div className={`descript ${theme}`}>
      <div className="dHead">
        <div className="dBrand">
          <button type="button" className="dBack" onClick={() => setPhase("launcher")} aria-label="Back to Descript home">
            ←
          </button>
          <span className="dDot" aria-hidden />
          DESCRIPT
        </div>
        <div className="dHeadRight">
          <span className="dSub">Auto-saves while you write</span>
          <button
            type="button"
            className="dThemeBtn"
            onClick={toggleTheme}
            aria-label={theme === "day" ? "Switch to night mode" : "Switch to day mode"}
            title={theme === "day" ? "Night mode" : "Day mode"}
          >
            {theme === "day" ? "🌙" : "☀️"}
          </button>
        </div>
      </div>

      <textarea
        className="dTitle"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Document title"
        maxLength={200}
        rows={2}
        aria-label="Document title"
      />

      <div className="dNavRow">
        <button
          type="button"
          className={`dNavBtn ${outlineOpen ? "on" : ""}`}
          onClick={() => setOutlineOpen((v) => !v)}
          aria-expanded={outlineOpen}
        >
          ☰ Headings {headings.length ? `(${headings.length})` : ""}
        </button>
        {pages.length > 1 ? (
          <div className="dPageJump">
            <button
              type="button"
              className="dNavBtn"
              disabled={pageIndex <= 0}
              onClick={() => jumpToPage(pageIndex - 1)}
              aria-label="Previous page"
            >
              ‹
            </button>
            <select
              className="dPageSelect"
              value={pageIndex}
              onChange={(e) => jumpToPage(Number(e.target.value))}
              aria-label="Jump to page"
            >
              {pages.map((p) => (
                <option key={p.index} value={p.index}>
                  {`Page ${p.index + 1}: ${p.label}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="dNavBtn"
              disabled={pageIndex >= pages.length - 1}
              onClick={() => jumpToPage(pageIndex + 1)}
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="dNavBtn"
          disabled={importing}
          onClick={() => editorImportRef.current?.click()}
        >
          {importing ? "…" : "📥 Import"}
        </button>
        <input
          ref={editorImportRef}
          type="file"
          accept={DESCRIPT_IMPORT_ACCEPT}
          className="dHiddenInput"
          onChange={(e) =>
            void embedImportedFile(e.target.files?.[0], { intoEditor: true, append: true })
          }
        />
      </div>

      {outlineOpen && headings.length > 0 ? (
        <div className="dOutline" role="navigation" aria-label="Document headings">
          {headings.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`dOutlineItem level${h.level}`}
              onClick={() => jumpToHeading(h.id)}
            >
              {h.text}
            </button>
          ))}
        </div>
      ) : outlineOpen ? (
        <div className="dOutlineEmpty">Add headings (H) to build an outline.</div>
      ) : null}

      <div className="dToolbar" role="toolbar" aria-label="Formatting">
        {[0, 1, 2, 3].map((group) => (
          <div className="dToolGroup" key={group}>
            {TOOLS.filter((t) => t.group === group).map((t) => (
              <button
                key={t.id}
                type="button"
                className={`dTool ${active[t.id] ? "on" : ""} ${
                  t.id === "bold" ? "b" : t.id === "italic" ? "i" : t.id === "underline" ? "u" : ""
                }`}
                title={t.label}
                aria-label={t.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onTool(t.id)}
              >
                {t.glyph}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div
        ref={bodyRef}
        className="dBody"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Document body"
        data-placeholder="Start writing… scripts, lyrics, essays, journals, articles."
        onInput={() => {
          refreshCounts();
          refreshNav();
        }}
        onKeyUp={refreshActive}
        onMouseUp={refreshActive}
      />

      <div className="dFoot">
        <div className="dCounts" aria-live="polite">
          <span>{counts.words} words</span>
          <span className="dDotSep" aria-hidden>
            ·
          </span>
          <span>{counts.chars} chars</span>
          {note ? <span className="dNote">{note}</span> : null}
        </div>
        <div className="dActions">
          {onClose ? (
            <button type="button" className="dGhost" onClick={onClose}>
              Close
            </button>
          ) : null}
          <button type="button" className="dGhost" onClick={() => save()}>
            🗂 Save
          </button>
          <button type="button" className="dShare" onClick={shareToBoard}>
            Share to Board →
          </button>
        </div>
      </div>

      <style jsx>{`
        .descript {
          flex: 1 1 auto;
          min-height: 0;
          min-width: 0;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 10px 12px;
        }
        @media (min-width: 520px) {
          .descript {
            padding: 12px 14px;
            gap: 10px;
          }
        }
        .dHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          min-width: 0;
        }
        @media (max-height: 740px) {
          .dSub {
            display: none;
          }
        }
        .dHeadRight {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          min-width: 0;
        }
        .dThemeBtn {
          flex: 0 0 auto;
          width: 34px;
          height: 34px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.06);
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
        }
        .dThemeBtn:hover {
          border-color: rgba(126, 226, 255, 0.45);
          background: rgba(126, 226, 255, 0.12);
        }
        .dBrand {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.14em;
          color: rgba(255, 255, 255, 0.92);
          min-width: 0;
        }
        .dBack {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.9);
          font-size: 14px;
          cursor: pointer;
          line-height: 1;
        }
        .dBack:hover {
          background: rgba(126, 226, 255, 0.16);
        }
        .dDot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: radial-gradient(circle at 35% 30%, #fff, #7ee2ff);
          box-shadow: 0 0 12px rgba(126, 226, 255, 0.8);
        }
        .dSub {
          font-size: 11px;
          color: rgba(236, 255, 251, 0.55);
        }
        .dTitle {
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.06);
          color: #f3fbff;
          padding: 12px 14px;
          font-size: 17px;
          font-weight: 800;
          outline: none;
          resize: vertical;
          min-height: 52px;
          line-height: 1.35;
          font-family: inherit;
        }
        .dTitle::placeholder {
          color: rgba(236, 255, 251, 0.38);
          font-weight: 700;
        }
        .dTitle:focus {
          border-color: rgba(126, 226, 255, 0.6);
          box-shadow: 0 0 0 3px rgba(126, 226, 255, 0.16);
        }
        .dHiddenInput {
          display: none;
        }
        .dNavRow {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          min-width: 0;
          max-width: 100%;
        }
        .dNavBtn {
          border-radius: 999px;
          padding: 7px 12px;
          font-size: 11px;
          font-weight: 800;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.05);
          color: rgba(236, 255, 251, 0.82);
          cursor: pointer;
        }
        .dNavBtn.on,
        .dNavBtn:hover:not(:disabled) {
          border-color: rgba(126, 226, 255, 0.45);
          background: rgba(126, 226, 255, 0.12);
        }
        .dNavBtn:disabled {
          opacity: 0.35;
          cursor: default;
        }
        .dPageJump {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .dPageSelect {
          max-width: min(220px, 48vw);
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(6, 12, 18, 0.7);
          color: #eef9ff;
          font-size: 11px;
          font-weight: 700;
          padding: 6px 8px;
        }
        .dOutline {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 140px;
          overflow-y: auto;
          padding: 8px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(6, 12, 18, 0.45);
        }
        .dOutlineItem {
          text-align: left;
          border: none;
          background: transparent;
          color: rgba(236, 255, 251, 0.85);
          font-size: 12px;
          font-weight: 700;
          padding: 5px 8px;
          border-radius: 8px;
          cursor: pointer;
        }
        .dOutlineItem.level2 {
          padding-left: 16px;
        }
        .dOutlineItem.level3 {
          padding-left: 28px;
          font-size: 11px;
        }
        .dOutlineItem:hover {
          background: rgba(126, 226, 255, 0.12);
        }
        .dOutlineEmpty {
          font-size: 11px;
          color: rgba(236, 255, 251, 0.45);
          padding: 6px 2px;
        }
        .dToolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 8px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.05);
          max-width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .dToolGroup {
          display: inline-flex;
          gap: 4px;
          padding-right: 8px;
          margin-right: 4px;
          border-right: 1px solid rgba(255, 255, 255, 0.12);
        }
        .dToolGroup:last-child {
          border-right: 0;
          padding-right: 0;
          margin-right: 0;
        }
        .dTool {
          min-width: 32px;
          height: 32px;
          padding: 0 8px;
          border-radius: 9px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.06);
          color: rgba(245, 252, 255, 0.86);
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .dTool.b {
          font-weight: 950;
        }
        .dTool.i {
          font-style: italic;
        }
        .dTool.u {
          text-decoration: underline;
        }
        .dTool:hover {
          background: rgba(126, 226, 255, 0.16);
          border-color: rgba(126, 226, 255, 0.4);
        }
        .dTool.on {
          color: #06121a;
          background: radial-gradient(circle at 30% 20%, #fff, #7ee2ff);
          border-color: rgba(255, 255, 255, 0.55);
        }
        .dBody {
          flex: 1 1 auto;
          min-height: 0;
          min-width: 0;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          overflow-x: auto;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background:
            radial-gradient(circle at 12% 0%, rgba(126, 226, 255, 0.08), transparent 40%),
            rgba(6, 12, 18, 0.55);
          color: #eef9ff;
          padding: 14px 14px 16px;
          font-size: 15px;
          font-weight: 500;
          line-height: 1.6;
          outline: none;
          word-wrap: break-word;
          overflow-wrap: break-word;
          word-break: break-word;
        }
        .dBody :global(b),
        .dBody :global(strong) {
          font-weight: 800;
        }
        .dBody :global(i),
        .dBody :global(em) {
          font-style: italic;
        }
        .dBody :global(u) {
          text-decoration: underline;
        }
        .dBody :global(*) {
          max-width: 100%;
          overflow-wrap: break-word;
          word-break: break-word;
        }
        .dBody:focus {
          border-color: rgba(126, 226, 255, 0.5);
          box-shadow: 0 0 0 3px rgba(126, 226, 255, 0.14);
        }
        .dBody:empty::before {
          content: attr(data-placeholder);
          color: rgba(236, 255, 251, 0.34);
        }
        .dBody :global(h1),
        .dBody :global(h2),
        .dBody :global(h3) {
          margin: 0.4em 0 0.3em;
          font-weight: 900;
          line-height: 1.25;
        }
        .dBody :global(h2) {
          font-size: 1.32em;
          color: #d7f6ff;
        }
        .dBody :global(blockquote) {
          margin: 0.5em 0;
          padding: 6px 14px;
          border-left: 3px solid rgba(126, 226, 255, 0.6);
          color: rgba(226, 248, 255, 0.82);
          font-style: italic;
        }
        .dBody :global(ul),
        .dBody :global(ol) {
          margin: 0.4em 0;
          padding-left: 1.5em;
        }
        .dFoot {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .dCounts {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: rgba(236, 255, 251, 0.6);
        }
        .dDotSep {
          opacity: 0.5;
        }
        .dNote {
          margin-left: 6px;
          color: rgba(150, 255, 240, 0.95);
          text-shadow: 0 0 12px rgba(120, 255, 234, 0.4);
        }
        .dActions {
          display: inline-flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .dGhost {
          border-radius: 999px;
          padding: 9px 15px;
          font-size: 12px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.86);
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          cursor: pointer;
        }
        .dGhost:hover {
          background: rgba(126, 226, 255, 0.16);
        }
        .dShare {
          border-radius: 999px;
          padding: 9px 18px;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.08em;
          color: #06121a;
          background: radial-gradient(circle at 30% 20%, #fff, #7ee2ff);
          border: 1px solid rgba(255, 255, 255, 0.5);
          box-shadow: 0 0 18px rgba(126, 226, 255, 0.45);
          cursor: pointer;
        }
        ${DESCRIPT_DAY_CSS}
      `}</style>
    </div>
  );
}
