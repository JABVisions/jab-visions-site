"use client";

import React, { useEffect, useRef } from "react";
import {
  RICH_TEXT_LIMITS,
  normalizeInlineMarkup,
  sanitizeRichHtml,
  richTextStyle,
  type RichTextValue,
} from "@/lib/board/richText";

const SIZE_OPTIONS = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48];

/**
 * Inline rich-text editor for a drop's title or description.
 * - Bold / Italic / Underline apply to the current selection (inline marks).
 * - Size / letter spacing / line spacing are field-level (whole field).
 * Emits a sanitized RichTextValue on every change.
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

  // Seed / re-seed the editable DOM from props when it differs and the field
  // isn't being actively edited (avoids clobbering the caret while typing).
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const incoming = value.html || "";
    if (incoming !== lastHtmlRef.current && document.activeElement !== el) {
      el.innerHTML = incoming;
      lastHtmlRef.current = incoming;
    }
  }, [value.html]);

  function emit(patch: Partial<RichTextValue>) {
    onChange({
      html: value.html,
      fontSize: value.fontSize,
      letterSpacing: value.letterSpacing,
      lineHeight: value.lineHeight,
      ...patch,
    });
  }

  function handleInput() {
    const el = editorRef.current;
    if (!el) return;
    const normalized = normalizeInlineMarkup(el.innerHTML);
    const html = sanitizeRichHtml(normalized);
    if (html !== el.innerHTML) {
      el.innerHTML = html;
    }
    lastHtmlRef.current = html;
    emit({ html });
  }

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
      return true;
    } catch {
      return false;
    }
  }

  function exec(command: "bold" | "italic" | "underline") {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const tag = command === "bold" ? "b" : command === "italic" ? "i" : "u";
    if (!wrapSelection(tag)) {
      try {
        document.execCommand("styleWithCSS", false, "false");
      } catch {}
      document.execCommand(command);
    }
    handleInput();
  }

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
            className="rtf-btn"
            title="Bold"
            aria-label="Bold"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("bold")}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className="rtf-btn"
            title="Italic"
            aria-label="Italic"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("italic")}
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className="rtf-btn"
            title="Underline"
            aria-label="Underline"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("underline")}
          >
            <span style={{ textDecoration: "underline" }}>U</span>
          </button>
        </div>

        <label className="rtf-ctl" title="Font size">
          <span className="rtf-ctl-ico" aria-hidden>
            A
          </span>
          <select
            className="rtf-select"
            value={value.fontSize ?? ""}
            onChange={(e) =>
              emit({ fontSize: e.target.value ? Number(e.target.value) : undefined })
            }
            aria-label="Font size"
          >
            <option value="">Size</option>
            {SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="rtf-ctl" title="Letter spacing">
          <span className="rtf-ctl-ico" aria-hidden>
            ↔
          </span>
          <input
            type="range"
            min={RICH_TEXT_LIMITS.letterSpacing.min}
            max={RICH_TEXT_LIMITS.letterSpacing.max}
            step={RICH_TEXT_LIMITS.letterSpacing.step}
            value={value.letterSpacing ?? 0}
            onChange={(e) => emit({ letterSpacing: Number(e.target.value) })}
            aria-label="Letter spacing"
          />
        </label>

        <label className="rtf-ctl" title="Line spacing">
          <span className="rtf-ctl-ico" aria-hidden>
            ↕
          </span>
          <input
            type="range"
            min={RICH_TEXT_LIMITS.lineHeight.min}
            max={RICH_TEXT_LIMITS.lineHeight.max}
            step={RICH_TEXT_LIMITS.lineHeight.step}
            value={value.lineHeight ?? 1.3}
            onChange={(e) => emit({ lineHeight: Number(e.target.value) })}
            aria-label="Line spacing"
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
          if (e.key !== "Enter") return;
          // Insert a real line break (<br>) so Enter skips to the next line and
          // survives sanitization (which keeps <br> but strips block wrappers).
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
        }
        .rtf-btn:hover {
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
