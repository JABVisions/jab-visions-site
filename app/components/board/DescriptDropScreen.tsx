"use client";

import { useEffect, useState } from "react";
import { descriptPlainText } from "@/lib/board/descriptDocs";

export default function DescriptDropScreen({
  title,
  src,
  preview,
  embedded = false,
}: {
  title: string;
  src?: string | null;
  preview?: string | null;
  /** Fill a parent frame (e.g. Dropbook slide) instead of standalone card chrome spacing. */
  embedded?: boolean;
}) {
  const savedPreview = preview?.trim() ?? "";
  const [documentText, setDocumentText] = useState(savedPreview);

  useEffect(() => {
    setDocumentText(savedPreview);

    if (!src) return;

    const controller = new AbortController();

    async function loadDocumentText() {
      try {
        const response = await fetch(src!, { signal: controller.signal });
        if (!response.ok) return;

        const html = await response.text();
        const text = descriptPlainText(html);
        if (text) setDocumentText(text);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    void loadDocumentText();
    return () => controller.abort();
  }, [savedPreview, src]);

  return (
    <section
      className={`descriptLaminate${embedded ? " embedded" : ""}`}
      aria-label={`Descript document: ${title}`}
    >
      <div className="laminateGlow" aria-hidden />
      <header className="laminateHeader">
        <span className="laminateSignal" aria-hidden />
        <span>DESCRIPT</span>
        <span className="laminateType">LAMINATED DOCUMENT</span>
      </header>

      <div className="laminateScreen">
        <article className="laminateDocument">
          <span className="documentLabel">DESCRIPT FILE</span>
          <h3>{title}</h3>
          <span className="documentRule" aria-hidden />
          <p>{documentText || "Preparing the Descript file…"}</p>
        </article>
        <div className="laminateSheen" aria-hidden />
      </div>

      {src && !embedded ? (
        <a className="laminateOpen" href={src} target="_blank" rel="noreferrer">
          Open full Descript ↗
        </a>
      ) : null}

      <style jsx>{`
        .descriptLaminate {
          position: relative;
          isolation: isolate;
          margin-top: 10px;
          overflow: hidden;
          border: 1px solid rgba(144, 232, 255, 0.52);
          border-radius: 22px;
          background: linear-gradient(145deg, rgba(235, 252, 255, 0.78), rgba(125, 186, 214, 0.28));
          padding: 10px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92), 0 14px 34px rgba(12, 39, 57, 0.18);
          color: #182630;
        }
        .descriptLaminate.embedded {
          margin: 0;
          width: 100%;
          height: auto;
          box-sizing: border-box;
          border-radius: 14px;
          overflow: visible;
        }
        .laminateGlow {
          position: absolute;
          inset: -35%;
          z-index: -1;
          background: radial-gradient(circle at 28% 18%, rgba(255, 255, 255, 0.9), transparent 30%), radial-gradient(circle at 78% 85%, rgba(78, 218, 255, 0.28), transparent 34%);
          filter: blur(18px);
        }
        .laminateHeader {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 2px 5px 9px;
          color: rgba(12, 45, 61, 0.78);
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 0.18em;
        }
        .laminateSignal {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #66e5ff;
          box-shadow: 0 0 12px rgba(64, 218, 255, 0.9);
        }
        .laminateType { margin-left: auto; color: rgba(12, 45, 61, 0.42); font-size: 8px; }
        .laminateScreen {
          position: relative;
          height: clamp(260px, 54vw, 430px);
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.86);
          border-radius: 15px;
          background: #fffef8;
          box-shadow: inset 0 0 0 1px rgba(16, 55, 73, 0.1), inset 0 0 28px rgba(95, 205, 240, 0.08);
          min-width: 0;
        }
        /* Embedded: let the paper grow with the document; parent Dropbook viewport scrolls. */
        .descriptLaminate.embedded .laminateScreen {
          height: auto;
          min-height: 220px;
          overflow: visible;
        }
        .laminateDocument {
          box-sizing: border-box;
          width: 100%;
          max-width: 100%;
          height: 100%;
          overflow: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          padding: clamp(24px, 6vw, 42px) clamp(20px, 5vw, 36px);
          color: #182630;
          text-align: left;
          scrollbar-width: thin;
          scrollbar-color: rgba(40, 117, 145, 0.26) transparent;
          pointer-events: auto;
          touch-action: pan-y;
        }
        .descriptLaminate.embedded .laminateDocument {
          height: auto;
          overflow: visible;
        }
        .documentLabel {
          display: block;
          margin-bottom: 14px;
          color: rgba(25, 92, 116, 0.52);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.2em;
        }
        .laminateDocument h3 {
          margin: 0;
          max-width: 100%;
          font: 800 clamp(20px, 5vw, 28px)/1.2 Georgia, serif;
          color: #182630;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .documentRule {
          display: block;
          width: 42px;
          height: 2px;
          margin: 17px 0;
          background: rgba(60, 177, 210, 0.45);
        }
        .laminateDocument p {
          margin: 0;
          max-width: 100%;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
          font-size: clamp(14px, 3.5vw, 16px);
          line-height: 1.75;
          color: rgba(24, 38, 48, 0.78);
        }
        .laminateSheen {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(118deg, rgba(255, 255, 255, 0.36), transparent 20%, transparent 72%, rgba(175, 236, 255, 0.16));
          mix-blend-mode: screen;
        }
        .descriptLaminate.embedded .laminateSheen {
          display: none;
        }
        .laminateOpen {
          display: inline-flex;
          margin: 9px 5px 1px;
          color: rgba(10, 64, 84, 0.76);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-decoration: none;
          text-transform: uppercase;
        }
        @media (max-width: 520px) {
          .laminateType { display: none; }
          .laminateScreen { height: 330px; }
          .descriptLaminate.embedded .laminateScreen { height: auto; }
        }
      `}</style>
    </section>
  );
}
