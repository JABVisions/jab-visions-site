"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  RICH_TEXT_LIMITS,
  normalizeInlineMarkup,
  sanitizeRichHtml,
  richTextStyle,
  type RichTextValue,
} from "@/lib/board/richText";

const SIZE_OPTIONS = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48];
const FONT_OPTIONS = [
  { label: "Default", value: "" },
  { label: "Serif", value: 'Georgia, "Times New Roman", serif' },
  { label: "Mono", value: '"SF Mono", Menlo, Consolas, monospace' },
  { label: "Rounded", value: '"Avenir Next", "Nunito", "Helvetica Neue", sans-serif' },
  { label: "Display", value: 'Impact, "Arial Black", sans-serif' },
];
const MAX_HISTORY = 48;

type SavedRange = { start: number; end: number };

function resolveRangeOffsets(root: HTMLElement, range: Range): SavedRange | null {
  const startRange = document.createRange();
  startRange.selectNodeContents(root);
  startRange.setEnd(range.startContainer, range.startOffset);
  const endRange = document.createRange();
  endRange.selectNodeContents(root);
  endRange.setEnd(range.endContainer, range.endOffset);
  return {
    start: startRange.toString().length,
    end: endRange.toString().length,
  };
}

function restoreRangeOffsets(root: HTMLElement, saved: SavedRange): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let cursor = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const len = node.textContent?.length ?? 0;
    if (!startNode && cursor + len >= saved.start) {
      startNode = node;
      startOffset = saved.start - cursor;
    }
    if (!endNode && cursor + len >= saved.end) {
      endNode = node;
      endOffset = saved.end - cursor;
      break;
    }
    cursor += len;
  }

  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

/**
 * Inline rich-text editor for a drop's title or description.
 * Bold / Italic / Underline and typography controls apply to the current selection.
 */
export function RichTextField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  minHeight = 44,
}: {
  value: RichTextValue;
  onChange: (next: RichTextValue) => void;
  placeholder?: string;
  ariaLabel?: string;
  minHeight?: number;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastHtmlRef = useRef<string>("");
  const savedRangeRef = useRef<SavedRange | null>(null);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const applyingHistoryRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 1);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const emit = useCallback(
    (patch: Partial<RichTextValue>) => {
      onChange({
        html: value.html,
        fontSize: value.fontSize,
        letterSpacing: value.letterSpacing,
        lineHeight: value.lineHeight,
        ...patch,
      });
    },
    [onChange, value]
  );

  const applyHtml = useCallback(
    (html: string, recordHistory: boolean) => {
      const el = editorRef.current;
      if (!el) return;
      const normalized = normalizeInlineMarkup(html);
      const clean = sanitizeRichHtml(normalized);
      el.innerHTML = clean;
      lastHtmlRef.current = clean;
      emit({ html: clean });
      if (recordHistory && !applyingHistoryRef.current) {
        const stack = undoStackRef.current;
        if (stack[stack.length - 1] !== clean) {
          stack.push(clean);
          if (stack.length > MAX_HISTORY) stack.shift();
          redoStackRef.current = [];
        }
        syncHistoryFlags();
      }
    },
    [emit, syncHistoryFlags]
  );

  const saveSelection = useCallback(() => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    savedRangeRef.current = resolveRangeOffsets(el, range);
  }, []);

  const restoreSelection = useCallback(() => {
    const el = editorRef.current;
    const saved = savedRangeRef.current;
    if (!el || !saved) return false;
    const range = restoreRangeOffsets(el, saved);
    if (!range) return false;
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }, []);

  const focusEditor = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    restoreSelection();
  }, [restoreSelection]);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    applyHtml(el.innerHTML, true);
  }, [applyHtml]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const incoming = value.html || "";
    if (incoming !== lastHtmlRef.current && document.activeElement !== el) {
      el.innerHTML = incoming;
      lastHtmlRef.current = incoming;
      if (!undoStackRef.current.length) {
        undoStackRef.current = [incoming];
        syncHistoryFlags();
      }
    }
  }, [value.html, syncHistoryFlags]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const initial = value.html || "";
    if (!undoStackRef.current.length) {
      undoStackRef.current = [initial];
      syncHistoryFlags();
    }
    const onSelectionChange = () => {
      if (document.activeElement === el) saveSelection();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [saveSelection, syncHistoryFlags, value.html]);

  const preserveToolbarEvent = useCallback(
    (event: React.SyntheticEvent) => {
      event.preventDefault();
      saveSelection();
    },
    [saveSelection]
  );

  function wrapSelection(tag: "b" | "i" | "u") {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return false;
    try {
      const wrapper = document.createElement(tag);
      range.surroundContents(wrapper);
      sel.removeAllRanges();
      const next = document.createRange();
      next.selectNodeContents(wrapper);
      sel.addRange(next);
      savedRangeRef.current = resolveRangeOffsets(el, next);
      return true;
    } catch {
      return false;
    }
  }

  const applyInlineStyle = useCallback(
    (styles: Record<string, string>) => {
      const el = editorRef.current;
      if (!el) return false;
      focusEditor();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return false;

      const entries = Object.entries(styles).filter(([, val]) => Boolean(val));
      if (!entries.length) return false;

      const span = document.createElement("span");
      for (const [key, val] of entries) {
        span.style.setProperty(key, val);
      }

      try {
        range.surroundContents(span);
      } catch {
        const extracted = range.extractContents();
        span.appendChild(extracted);
        range.insertNode(span);
      }

      sel.removeAllRanges();
      const next = document.createRange();
      next.selectNodeContents(span);
      sel.addRange(next);
      savedRangeRef.current = resolveRangeOffsets(el, next);
      handleInput();
      return true;
    },
    [focusEditor, handleInput]
  );

  const exec = useCallback(
    (command: "bold" | "italic" | "underline") => {
      focusEditor();
      const tag = command === "bold" ? "b" : command === "italic" ? "i" : "u";
      if (!wrapSelection(tag)) {
        try {
          document.execCommand("styleWithCSS", false, "false");
        } catch {}
        document.execCommand(command);
      }
      handleInput();
    },
    [focusEditor, handleInput]
  );

  const applyFontSize = useCallback(
    (size: number | undefined) => {
      if (!size) return;
      applyInlineStyle({ "font-size": `${size}px` });
    },
    [applyInlineStyle]
  );

  const applyLetterSpacing = useCallback(
    (spacing: number) => {
      applyInlineStyle({ "letter-spacing": `${spacing}em` });
    },
    [applyInlineStyle]
  );

  const applyLineHeight = useCallback(
    (height: number) => {
      applyInlineStyle({ "line-height": String(height) });
    },
    [applyInlineStyle]
  );

  const applyFontFamily = useCallback(
    (family: string) => {
      if (!family) return;
      applyInlineStyle({ "font-family": family });
    },
    [applyInlineStyle]
  );

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length <= 1) return;
    applyingHistoryRef.current = true;
    const current = stack.pop()!;
    redoStackRef.current.push(current);
    const prev = stack[stack.length - 1] ?? "";
    applyHtml(prev, false);
    applyingHistoryRef.current = false;
    syncHistoryFlags();
    focusEditor();
  }, [applyHtml, focusEditor, syncHistoryFlags]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    applyingHistoryRef.current = true;
    undoStackRef.current.push(next);
    applyHtml(next, false);
    applyingHistoryRef.current = false;
    syncHistoryFlags();
    focusEditor();
  }, [applyHtml, focusEditor, syncHistoryFlags]);

  const editorStyle: React.CSSProperties = {
    minHeight,
    ...(richTextStyle(value) ?? {}),
  };

  return (
    <div className="rtf">
      <div className="rtf-toolbar" role="toolbar" aria-label="Text formatting">
        <div className="rtf-group">
          <button
            type="button"
            className="rtf-btn rtf-btn-round"
            title="Undo"
            aria-label="Undo"
            disabled={!canUndo}
            onMouseDown={preserveToolbarEvent}
            onPointerDown={preserveToolbarEvent}
            onClick={undo}
          >
            ↶
          </button>
          <button
            type="button"
            className="rtf-btn rtf-btn-round"
            title="Redo"
            aria-label="Redo"
            disabled={!canRedo}
            onMouseDown={preserveToolbarEvent}
            onPointerDown={preserveToolbarEvent}
            onClick={redo}
          >
            ↷
          </button>
        </div>

        <div className="rtf-group">
          <button
            type="button"
            className="rtf-btn"
            title="Bold"
            aria-label="Bold"
            onMouseDown={preserveToolbarEvent}
            onPointerDown={preserveToolbarEvent}
            onClick={() => exec("bold")}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className="rtf-btn"
            title="Italic"
            aria-label="Italic"
            onMouseDown={preserveToolbarEvent}
            onPointerDown={preserveToolbarEvent}
            onClick={() => exec("italic")}
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className="rtf-btn"
            title="Underline"
            aria-label="Underline"
            onMouseDown={preserveToolbarEvent}
            onPointerDown={preserveToolbarEvent}
            onClick={() => exec("underline")}
          >
            <span style={{ textDecoration: "underline" }}>U</span>
          </button>
        </div>

        <label className="rtf-ctl" title="Font (selection)">
          <span className="rtf-ctl-ico" aria-hidden>
            F
          </span>
          <select
            className="rtf-select"
            defaultValue=""
            onMouseDown={preserveToolbarEvent}
            onPointerDown={preserveToolbarEvent}
            onChange={(e) => {
              focusEditor();
              applyFontFamily(e.target.value);
              e.target.value = "";
            }}
            aria-label="Font family for selection"
          >
            <option value="">Font</option>
            {FONT_OPTIONS.filter((f) => f.value).map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <label className="rtf-ctl" title="Font size (selection)">
          <span className="rtf-ctl-ico" aria-hidden>
            A
          </span>
          <select
            className="rtf-select"
            defaultValue=""
            onMouseDown={preserveToolbarEvent}
            onPointerDown={preserveToolbarEvent}
            onChange={(e) => {
              focusEditor();
              const next = e.target.value ? Number(e.target.value) : undefined;
              if (next) applyFontSize(next);
              e.target.value = "";
            }}
            aria-label="Font size for selection"
          >
            <option value="">Size</option>
            {SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="rtf-ctl" title="Letter spacing (selection)">
          <span className="rtf-ctl-ico" aria-hidden>
            ↔
          </span>
          <input
            type="range"
            min={RICH_TEXT_LIMITS.letterSpacing.min}
            max={RICH_TEXT_LIMITS.letterSpacing.max}
            step={RICH_TEXT_LIMITS.letterSpacing.step}
            defaultValue={0}
            onMouseDown={preserveToolbarEvent}
            onPointerDown={preserveToolbarEvent}
            onChange={(e) => {
              focusEditor();
              applyLetterSpacing(Number(e.target.value));
            }}
            aria-label="Letter spacing for selection"
          />
        </label>

        <label className="rtf-ctl" title="Line spacing (selection)">
          <span className="rtf-ctl-ico" aria-hidden>
            ↕
          </span>
          <input
            type="range"
            min={RICH_TEXT_LIMITS.lineHeight.min}
            max={RICH_TEXT_LIMITS.lineHeight.max}
            step={RICH_TEXT_LIMITS.lineHeight.step}
            defaultValue={1.3}
            onMouseDown={preserveToolbarEvent}
            onPointerDown={preserveToolbarEvent}
            onChange={(e) => {
              focusEditor();
              applyLineHeight(Number(e.target.value));
            }}
            aria-label="Line spacing for selection"
          />
        </label>
      </div>

      <div
        ref={editorRef}
        className="rtf-editor"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        style={editorStyle}
        onInput={handleInput}
        onBlur={handleInput}
        onKeyDown={(e) => {
          const mod = e.metaKey || e.ctrlKey;
          if (mod && e.key.toLowerCase() === "z") {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
            return;
          }
          if (mod && e.key.toLowerCase() === "y") {
            e.preventDefault();
            redo();
            return;
          }
          if (e.key !== "Enter") return;
          e.preventDefault();
          document.execCommand("insertLineBreak");
          handleInput();
        }}
      />

      <style jsx>{`
        .rtf {
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 12px;
          background: #fff;
          overflow: hidden;
        }
        .rtf-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          padding: 7px 9px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.08);
          background: rgba(160, 110, 255, 0.06);
        }
        .rtf-group {
          display: inline-flex;
          gap: 4px;
        }
        .rtf-btn {
          min-width: 30px;
          height: 28px;
          padding: 0 8px;
          border-radius: 8px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: #fff;
          color: #2a2440;
          font-size: 14px;
          line-height: 1;
          cursor: pointer;
          touch-action: manipulation;
        }
        .rtf-btn-round {
          width: 28px;
          min-width: 28px;
          padding: 0;
          border-radius: 999px;
          font-size: 15px;
        }
        .rtf-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .rtf-btn:hover:not(:disabled) {
          background: #f1e9ff;
          border-color: rgba(126, 64, 255, 0.4);
        }
        .rtf-ctl {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          color: #6b6480;
        }
        .rtf-ctl-ico {
          font-weight: 800;
          color: #8a6bff;
        }
        .rtf-select {
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 8px;
          padding: 3px 6px;
          font-size: 12px;
          background: #fff;
          color: #2a2440;
        }
        .rtf-ctl input[type="range"] {
          width: 78px;
          accent-color: #7c3aed;
        }
        .rtf-editor {
          padding: 10px 12px;
          font-size: 14px;
          font-weight: 500;
          color: #1a1430;
          outline: none;
          word-break: break-word;
          white-space: pre-wrap;
        }
        .rtf-editor :global(b),
        .rtf-editor :global(strong) {
          font-weight: 800;
        }
        .rtf-editor :global(i),
        .rtf-editor :global(em) {
          font-style: italic;
        }
        .rtf-editor :global(u) {
          text-decoration: underline;
        }
        .rtf-editor:empty::before {
          content: attr(data-placeholder);
          color: #9a93ad;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

/**
 * Render a sanitized rich value (inline marks + field-level size/spacing).
 * Falls back to plain text when there's no rich value.
 */
export function RichText({
  value,
  plain,
  className,
  as: Tag = "div",
}: {
  value?: RichTextValue | null;
  plain?: string;
  className?: string;
  as?: React.ElementType;
}) {
  const html = value ? sanitizeRichHtml(value.html) : "";
  const renderStyle: React.CSSProperties = {
    ...(richTextStyle(value) ?? {}),
  };
  if (html) {
    return (
      <span className="boardRichInline">
        <Tag
          className={["boardRichInlineHost", className].filter(Boolean).join(" ")}
          style={renderStyle}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </span>
    );
  }
  if (plain) {
    return (
      <Tag
        className={["boardRichInlineHost", className].filter(Boolean).join(" ")}
        style={renderStyle}
      >
        {plain}
      </Tag>
    );
  }
  return null;
}
