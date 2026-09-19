"use client";

import { useEffect, useRef, useState } from "react";
import {
  isDropbookLinkSlide,
  parseDropbookManifest,
  type DropbookManifest,
  type DropbookSlide,
} from "@/lib/board/dropbookSlides";
import DescriptDropScreen from "./DescriptDropScreen";

const SWIPE_THRESHOLD_PX = 48;

export default function DropbookSlideScreen({
  src,
  title,
}: {
  src?: string | null;
  title: string;
}) {
  const [manifest, setManifest] = useState<DropbookManifest | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState("");
  const swipeStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  // Persistent audio: keep the latest audio-slide src in a hidden <audio>
  // element that is never unmounted, so playback survives page changes.
  const persistentAudioRef = useRef<HTMLAudioElement | null>(null);
  const [persistentAudioSrc, setPersistentAudioSrc] = useState<string | null>(null);

  useEffect(() => {
    setManifest(null);
    setActiveIndex(0);
    setError("");
    setPersistentAudioSrc(null);
    if (!src) {
      setError("This Dropbook file is not available.");
      return;
    }

    const controller = new AbortController();
    void fetch(src, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Dropbook download failed");
        return response.json();
      })
      .then((value) => {
        const parsed = parseDropbookManifest(value);
        if (!parsed) throw new Error("Dropbook format is invalid");
        setManifest(parsed);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError("This Dropbook could not be opened.");
      });

    return () => controller.abort();
  }, [src]);

  const slides = manifest?.slides ?? [];
  const activeSlide = slides[activeIndex];

  // When we land on an audio slide, hand its src to the persistent player.
  // When we leave an audio slide for a non-audio one, leave the src alone
  // (audio keeps playing). The user can pause manually via the controls.
  useEffect(() => {
    if (activeSlide?.kind === "audio" && activeSlide.src) {
      setPersistentAudioSrc(activeSlide.src);
    }
  }, [activeSlide]);

  function move(direction: -1 | 1) {
    if (slides.length < 2) return;
    setActiveIndex((current) => (current + direction + slides.length) % slides.length);
  }

  function isSwipeBlocked(target: EventTarget | null) {
    return (
      target instanceof HTMLElement &&
      Boolean(
        target.closest(
          "video, audio, textarea, input, a, button, iframe, .laminateDocument, .descriptLaminate"
        )
      )
    );
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (slides.length < 2) return;
    if (activeSlide?.kind === "descript") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (isSwipeBlocked(event.target)) return;
    swipeStartRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return;
    move(dx < 0 ? 1 : -1);
  }

  function onPointerCancel() {
    swipeStartRef.current = null;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    }
  }

  function renderLinkSlide(slide: DropbookSlide) {
    const destination = slide.url || slide.embedUrl;
    if (slide.embedUrl && (slide.kind === "youtube" || slide.kind === "music")) {
      return (
        <div className="dropbookSlideEmbed">
          {slide.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="dropbookSlideEmbedArt" src={slide.src} alt="" />
          ) : null}
          <iframe
            src={slide.embedUrl}
            title={slide.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            referrerPolicy={
              slide.embedUrl.includes("soundcloud.com")
                ? undefined
                : "strict-origin-when-cross-origin"
            }
          />
          <div className="dropbookSlideEmbedMeta">
            <span>
              {slide.kind === "youtube" ? "YouTube ▶" : "Music ♫"}
              {slide.provider ? ` · ${slide.provider}` : ""}
            </span>
            <h3>{slide.title}</h3>
            {destination ? (
              <a href={destination} target="_blank" rel="noreferrer">
                Open original
              </a>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div className="dropbookSlideLinkCard">
        {slide.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slide.src} alt="" />
        ) : (
          <div className="dropbookSlideLinkFallback" aria-hidden>
            🔗
          </div>
        )}
        <div className="dropbookSlideLinkMeta">
          <span>{slide.provider || "Link"}</span>
          <h3>{slide.title}</h3>
          {slide.text ? <p>{slide.text}</p> : null}
          {destination ? (
            <a href={destination} target="_blank" rel="noreferrer">
              Visit →
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  function renderSlideContent(slide: DropbookSlide, isActive: boolean) {
    if (slide.kind === "descript") {
      return (
        <div className="dropbookDescriptHost">
          <DescriptDropScreen
            title={slide.title}
            preview={slide.text}
            embedded
          />
        </div>
      );
    }
    if (isDropbookLinkSlide(slide.kind)) {
      return renderLinkSlide(slide);
    }
    if (slide.kind === "video" && slide.src) {
      return <video src={slide.src} controls playsInline preload="metadata" />;
    }
    if (slide.kind === "audio" && slide.src) {
      return (
        <div className="dropbookSlideAudio">
          <span aria-hidden>◉</span>
          <h3>{slide.title}</h3>
          {isActive ? (
            <p className="dropbookAudioHint">Playing from audio bar below ↓</p>
          ) : null}
        </div>
      );
    }
    if (slide.src) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={slide.src} alt={slide.title} />;
    }
    return (
      <div className="dropbookSlideColorPage">
        <span>DROPBOOK</span>
        <h3>{slide.title}</h3>
      </div>
    );
  }

  return (
    <section
      className="dropbookSlideDrop"
      aria-label={`Dropbook: ${title}`}
      tabIndex={slides.length > 1 ? 0 : undefined}
      onKeyDown={onKeyDown}
      style={{ "--dropbook-color": manifest?.bookColor ?? "#2563EB" } as React.CSSProperties}
    >
      <header className="dropbookSlideHeader">
        <span className="dropbookSlideSignal" aria-hidden />
        <span>DROPBOOK</span>
        <span className="dropbookSlideCount">
          {slides.length ? `${activeIndex + 1} / ${slides.length}` : "DROPBOOK"}
        </span>
      </header>

      <div
        className={`dropbookSlideViewport${
          activeSlide?.kind === "descript" ? " descriptActive" : ""
        }`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onWheel={
          activeSlide?.kind === "descript"
            ? (event) => event.stopPropagation()
            : undefined
        }
      >
        {slides.length > 0 ? (
          slides.map((slide, index) => {
            const isActive = index === activeIndex;
            return (
              <article
                key={slide.id}
                className="dropbookSlidePage"
                data-kind={slide.kind}
                aria-hidden={!isActive}
                style={{ display: isActive ? undefined : "none" }}
              >
                {renderSlideContent(slide, isActive)}
              </article>
            );
          })
        ) : (
          <div className="dropbookSlideLoading">{error || "Opening Dropbook…"}</div>
        )}
      </div>

      {persistentAudioSrc ? (
        <div className="dropbookPersistentAudio">
          <audio
            ref={persistentAudioRef}
            src={persistentAudioSrc}
            controls
            preload="metadata"
            aria-label="Dropbook audio"
          />
        </div>
      ) : null}

      {slides.length > 1 ? (
        <div className="dropbookSlideControls">
          <div className="dropbookSlideDots" aria-label="Dropbook pages">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                className={index === activeIndex ? "active" : ""}
                onClick={() => setActiveIndex(index)}
                aria-label={`Open page ${index + 1}: ${slide.title}`}
                aria-current={index === activeIndex ? "true" : undefined}
              />
            ))}
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .dropbookSlideDrop { margin-top: 10px; padding: 10px; border: 1px solid color-mix(in srgb, var(--dropbook-color) 58%, rgba(144,232,255,.5)); border-radius: 24px; background: radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--dropbook-color) 22%, transparent), transparent 42%), rgba(5,12,19,.94); box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 16px 38px rgba(4,13,22,.24); overflow: hidden; outline: none; }
        .dropbookSlideHeader { display:flex; align-items:center; gap:7px; padding:2px 4px 9px; color:rgba(220,252,255,.8); font-size:9px; font-weight:950; letter-spacing:.18em; }
        .dropbookSlideSignal { width:7px; height:7px; border-radius:99px; background:var(--dropbook-color); box-shadow:0 0 14px var(--dropbook-color); }
        .dropbookSlideCount { margin-left:auto; color:rgba(220,252,255,.48); }
        .dropbookSlideViewport { position:relative; aspect-ratio:4/5; max-height:440px; min-height:280px; border-radius:17px; overflow:hidden; background:color-mix(in srgb, var(--dropbook-color) 16%, #05090d); border:1px solid rgba(255,255,255,.14); touch-action: pan-y; cursor: grab; user-select: none; }
        .dropbookSlideViewport.descriptActive {
          overflow-x: hidden;
          overflow-y: scroll;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          touch-action: pan-y;
          cursor: default;
          user-select: text;
        }
        .dropbookSlidePage { position:absolute; inset:0; display:grid; place-items:center; overflow:hidden; min-width:0; min-height:0; }
        .dropbookSlidePage[data-kind="descript"] {
          position: relative;
          inset: auto;
          display: block;
          width: 100%;
          height: auto;
          min-height: 100%;
          overflow: visible;
        }
        .dropbookSlidePage img, .dropbookSlidePage video { width:100%; height:100%; object-fit:contain; background:#020609; pointer-events: auto; }
        .dropbookDescriptHost {
          position: relative;
          inset: auto;
          box-sizing: border-box;
          width: 100%;
          height: auto;
          min-width: 0;
          padding: 8px;
          overflow: visible;
        }
        .dropbookSlideAudio, .dropbookSlideColorPage { width:100%; height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:16px; padding:30px; color:white; text-align:center; background:radial-gradient(circle at 50% 32%, color-mix(in srgb, var(--dropbook-color) 46%, transparent), transparent 48%), #04080d; }
        .dropbookSlideAudio > span { font-size:52px; color:var(--dropbook-color); text-shadow:0 0 28px var(--dropbook-color); }
        .dropbookAudioHint { margin:0; font-size:10px; font-weight:700; letter-spacing:.06em; opacity:.6; color:rgba(220,252,255,.8); }
        .dropbookSlideColorPage span { font-size:10px; font-weight:900; letter-spacing:.28em; opacity:.7; }
        .dropbookSlideColorPage h3, .dropbookSlideAudio h3 { margin:0; font-size:24px; }
        .dropbookSlideEmbed, .dropbookSlideLinkCard { width:100%; height:100%; display:grid; grid-template-rows:minmax(0,1fr) auto; background:#04080d; color:#e8fbff; }
        .dropbookSlideEmbed { position:relative; }
        .dropbookSlideEmbed iframe { width:100%; height:100%; border:0; background:#000; pointer-events:auto; }
        .dropbookSlideEmbedArt { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:.18; pointer-events:none; }
        .dropbookSlideEmbedMeta, .dropbookSlideLinkMeta { position:relative; z-index:1; padding:12px 14px 14px; background:linear-gradient(180deg, transparent, rgba(4,8,13,.92) 28%); }
        .dropbookSlideEmbedMeta span, .dropbookSlideLinkMeta span { font-size:9px; font-weight:900; letter-spacing:.16em; text-transform:uppercase; color:rgba(220,252,255,.62); }
        .dropbookSlideEmbedMeta h3, .dropbookSlideLinkMeta h3 { margin:6px 0 8px; font-size:16px; line-height:1.25; }
        .dropbookSlideLinkMeta p { margin:0 0 10px; font-size:12px; line-height:1.45; color:rgba(220,252,255,.72); display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
        .dropbookSlideEmbedMeta a, .dropbookSlideLinkMeta a { color:#7ee2ff; font-size:11px; font-weight:800; text-decoration:none; }
        .dropbookSlideLinkCard img { width:100%; height:100%; object-fit:cover; }
        .dropbookSlideLinkFallback { display:grid; place-items:center; font-size:42px; background:radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--dropbook-color) 40%, transparent), #04080d); }
        .dropbookSlideLoading { height:100%; display:grid; place-items:center; padding:30px; color:rgba(220,252,255,.66); font-size:12px; font-weight:800; text-align:center; }
        .dropbookPersistentAudio { padding: 8px 4px 2px; display:flex; align-items:center; }
        .dropbookPersistentAudio audio { width:100%; border-radius:8px; }
        .dropbookSlideControls { display:flex; justify-content:center; align-items:center; padding-top:9px; }
        .dropbookSlideDots { display:flex; justify-content:center; align-items:center; gap:7px; }
        .dropbookSlideDots button { width:7px; height:7px; padding:0; border:0; border-radius:99px; background:rgba(220,252,255,.25); cursor:pointer; }
        .dropbookSlideDots button.active { width:20px; background:var(--dropbook-color); box-shadow:0 0 12px var(--dropbook-color); }
        @media (max-width:520px) { .dropbookSlideViewport { min-height:310px; max-height:390px; } }
      `}</style>
    </section>
  );
}
