"use client";

import { useCallback, useEffect, useState } from "react";

import DropStudioStage from "./DropStudioStage";
import type { DropItem } from "./DropTile";
import {
  type DropCustomization,
  normalizeDropCustomizations,
  compactDropCustomizations,
} from "@/lib/board/dropCustomizations";
import { upsertPayDrop } from "@/lib/board/paydrops";
import {
  findLocalDropById,
  getCurrentUserId,
  getDropSignedUrl,
  loadDropForEdit,
  persistDropEdit,
  uploadDropMedia,
  BOARD_MEDIA_BUCKET,
} from "@/lib/board/boardDropEditStore";
import { persistActivityEdit } from "@/lib/board/activity";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  normalizeRichText,
  richToPlain,
  richTextFromPlain,
  sanitizeRichHtml,
  type RichTextValue,
} from "@/lib/board/richText";
import { RichTextField } from "./RichTextField";
import {
  DESCRIPT_SHARE_EVENT,
  descriptPlainText,
  type DescriptDoc,
} from "@/lib/board/descriptDocs";

type CaptureMode = "photo" | "video" | "audio" | "art" | "descript";

const LINK_TYPES = new Set(["Link", "News", "YouTube", "Music"]);

function studioModesForDropType(type: DropItem["type"]): CaptureMode[] {
  if (type === "Doc") return ["descript"];
  if (type === "Thought") return ["audio", "art", "descript"];
  if (type === "Pay") return ["photo", "video", "audio", "art", "descript"];
  if (type === "Media") return ["photo", "video", "art"];
  return ["photo", "video", "art"];
}

function descriptDestinationForDropType(type: DropItem["type"]): "doc" | "thought" | "pay" {
  if (type === "Thought") return "thought";
  if (type === "Pay") return "pay";
  return "doc";
}

function normalizeUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;
  try {
    const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    const u = new URL(withProto);
    return u.toString();
  } catch {
    return null;
  }
}

function parsePriceToCents(raw: string): number | null {
  const s = raw.trim().replace(/^\$/g, "");
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function isAudioFile(file: File) {
  return file.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name);
}

/**
 * One Board-wide drop editor. Mounted in the board layout so ANY Edit button
 * (feed, profile, console) can open it in place — it listens for a
 * `board:drop:edit` window event carrying the drop id, loads that drop, and
 * shows a centered window (not a full-page column). Ownership is enforced by the
 * store: saves rewrite the signed-in user's own boardDrops, so a drop you didn't
 * create can't be persisted even if the event fired.
 */
export default function BoardDropEditModal() {
  const [drop, setDrop] = useState<DropItem | null>(null);
  const [titleRich, setTitleRich] = useState<RichTextValue>({ html: "" });
  const [descRich, setDescRich] = useState<RichTextValue>({ html: "" });
  const [linkUrl, setLinkUrl] = useState("");
  const [payPrice, setPayPrice] = useState("");
  const [payLink, setPayLink] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [customizations, setCustomizations] = useState<DropCustomization>({});
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [studioMode, setStudioMode] = useState<CaptureMode | null>(null);
  const [studioInitialFile, setStudioInitialFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const open = useCallback((d: DropItem) => {
    setDrop(d);
    setTitleRich(normalizeRichText(d.titleRich) ?? richTextFromPlain(d.title || ""));
    setDescRich(
      normalizeRichText(d.descriptionRich) ??
        richTextFromPlain((d.type === "Thought" ? d.thoughtText : d.description) || "")
    );
    setLinkUrl(d.url || d.linkUrl || "");
    setPayPrice(d.priceCents ? (d.priceCents / 100).toFixed(2) : "");
    setPayLink(d.paymentLink || d.linkUrl || "");
    setVisibility(d.visibility ?? "public");
    setCustomizations(normalizeDropCustomizations(d.customizations) ?? {});
    setPendingFile(null);
    setStudioMode(null);
    setStudioInitialFile(null);
    setSaving(false);
  }, []);

  const close = useCallback(() => {
    setDrop(null);
    setPendingFile(null);
    setStudioMode(null);
    setStudioInitialFile(null);
    setSaving(false);
  }, []);

  // Load a drop's stored media (if any) and open Drop Studio on it. Takes the
  // target explicitly so it can be launched the moment a drop is opened — before
  // the `drop` state has committed — which is what the direct Drop Studio button
  // on a tile relies on.
  const openDescriptStudioFor = useCallback(() => {
    setStudioInitialFile(null);
    setStudioMode("descript");
  }, []);

  const openMediaStudioFor = useCallback(async (target: DropItem) => {
    let initial: File | null = null;
    // Prefer the stored file (signed URL); fall back to a direct media URL so
    // drops opened from the feed (which carry only a rendered URL, no storage
    // path) can still load their existing media into Drop Studio.
    let sourceUrl: string | null = null;
    if (target.bucket && target.storagePath) {
      sourceUrl = await getDropSignedUrl(target.bucket, target.storagePath).catch(() => null);
    }
    if (!sourceUrl && target.mediaUrl) sourceUrl = target.mediaUrl;

    if (sourceUrl) {
      try {
        const res = await fetch(sourceUrl);
        const blob = await res.blob();
        initial = new File([blob], target.fileName || "drop-media", {
          type: blob.type || target.mime || "application/octet-stream",
        });
      } catch {
        initial = null;
      }
    }
    setStudioInitialFile(initial);
    setStudioMode(
      target.mediaKind === "audio" ? "audio" : target.mediaKind === "video" ? "video" : "photo"
    );
  }, []);

  // Resolve the drop to edit (local cache → Supabase → surface fallback), then
  // backfill stored-media coordinates from the surface-provided drop when the
  // canonical record is missing them. A local/remote record that predates the
  // media upload (or a feed item whose media lives under a nested field) would
  // otherwise shadow the richer provided drop and hide the Drop Studio control.
  const resolveDrop = useCallback(
    async (dropId: string, provided: DropItem | undefined): Promise<DropItem | null> => {
      if (provided?.editSource === "announcement") return provided;

      let target: DropItem | null = findLocalDropById(dropId);
      if (!target) target = await loadDropForEdit(dropId);
      if (!target) target = provided ?? null;
      if (!target) return null;

      if (provided) {
        const needsStorage = !(target.bucket && target.storagePath);
        const canBackfillStorage = needsStorage && provided.bucket && provided.storagePath;
        const needsMediaUrl = !target.mediaUrl && !!provided.mediaUrl;
        if (canBackfillStorage || needsMediaUrl) {
          target = {
            ...target,
            bucket: canBackfillStorage ? provided.bucket : target.bucket,
            storagePath: canBackfillStorage ? provided.storagePath : target.storagePath,
            mediaUrl: target.mediaUrl ?? provided.mediaUrl,
            mediaKind: target.mediaKind ?? provided.mediaKind,
            fileName: target.fileName ?? provided.fileName,
            mime: target.mime ?? provided.mime,
            fileSize: target.fileSize ?? provided.fileSize,
          };
        }
      }
      return target;
    },
    []
  );

  // Listen for edit requests fired from anywhere on Board.
  useEffect(() => {
    async function onEdit(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      const dropId: string = detail.dropId || "";
      const provided: DropItem | undefined = detail.drop;

      const target = await resolveDrop(dropId, provided);
      if (target) open(target);
      else setToast("Couldn't find that drop to edit.");
    }
    window.addEventListener("board:drop:edit", onEdit as EventListener);
    return () => window.removeEventListener("board:drop:edit", onEdit as EventListener);
  }, [open, resolveDrop]);

  // Listen for "edit this drop's media in Drop Studio" requests fired straight
  // from a media drop's tile. Resolves the drop authoritatively (same as Edit),
  // opens the editor window, then launches Drop Studio on top of it so the owner
  // lands in the studio in one click. Non-media drops are rejected up front.
  useEffect(() => {
    async function onStudio(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      const dropId: string = detail.dropId || "";
      const provided: DropItem | undefined = detail.drop;

      const target = await resolveDrop(dropId, provided);
      if (!target) {
        setToast("Couldn't find that drop to edit.");
        return;
      }
      open(target);

      const hasMedia = !!((target.bucket && target.storagePath) || target.mediaUrl);

      if (target.type === "Doc" || target.type === "Thought" || target.type === "Pay") {
        if (!hasMedia) {
          openDescriptStudioFor();
          return;
        }
      } else if (!hasMedia) {
        setToast("This drop has no media to edit in Drop Studio.");
        return;
      }

      if (target.type === "Doc") {
        openDescriptStudioFor();
        return;
      }

      await openMediaStudioFor(target);
    }
    window.addEventListener("board:drop:studio", onStudio as EventListener);
    return () => window.removeEventListener("board:drop:studio", onStudio as EventListener);
  }, [open, openDescriptStudioFor, openMediaStudioFor, resolveDrop]);

  useEffect(() => {
    function onDescriptShare(event: Event) {
      const doc = (event as CustomEvent<DescriptDoc>).detail;
      if (!doc) return;
      const plain = doc.plainText?.trim() || descriptPlainText(doc.html);
      const cleanTitle = doc.title?.trim();
      if (cleanTitle) {
        setTitleRich(
          normalizeRichText({ html: sanitizeRichHtml(cleanTitle) }) ??
            richTextFromPlain(cleanTitle)
        );
      }
      if (doc.html || plain) {
        setDescRich(
          normalizeRichText({ html: sanitizeRichHtml(doc.html) }) ?? richTextFromPlain(plain)
        );
      }
      setStudioMode(null);
    }
    window.addEventListener(DESCRIPT_SHARE_EVENT, onDescriptShare as EventListener);
    return () => window.removeEventListener(DESCRIPT_SHARE_EVENT, onDescriptShare as EventListener);
  }, []);

  // Esc closes (only when Drop Studio isn't on top handling its own Esc).
  useEffect(() => {
    if (!drop) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !studioMode && !saving) close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drop, studioMode, saving, close]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  async function openMediaStudio() {
    if (!drop) return;
    await openMediaStudioFor(drop);
  }

  async function publicUrlForUpload(file: File, dropId: string) {
    const up = await uploadDropMedia(file, dropId);
    if (!up) return null;
    const sb = supabaseBrowser();
    const pub = sb.storage.from(up.bucket || BOARD_MEDIA_BUCKET).getPublicUrl(up.storagePath);
    return pub.data.publicUrl || null;
  }

  async function save() {
    if (!drop) return;
    setSaving(true);
    try {
      const ownerId = await getCurrentUserId();

      if (drop.editSource === "announcement" && drop.sourceActivityId) {
        const titleRichClean = normalizeRichText(titleRich);
        const descRichClean = normalizeRichText(descRich);
        const titlePlain = richToPlain(titleRich.html);
        const descPlain = richToPlain(descRich.html);

        let mediaUrl = drop.mediaUrl ?? null;
        let mediaKind = drop.mediaKind ?? "image";
        if (pendingFile) {
          const uploaded = await publicUrlForUpload(pendingFile, drop.sourceActivityId);
          if (!uploaded) throw new Error("Couldn't upload announcement media.");
          mediaUrl = uploaded;
          mediaKind = pendingFile.type.startsWith("video/")
            ? "video"
            : pendingFile.type.startsWith("audio/")
              ? "audio"
              : "image";
        }

        const annMediaType =
          mediaKind === "video" ? "video" : mediaKind === "audio" ? "audio" : "image";

        await persistActivityEdit(drop.sourceActivityId, {
          title: titlePlain || drop.title,
          body: descPlain || drop.description || "",
          href: annMediaType === "video" || annMediaType === "audio" ? mediaUrl : null,
          image_url: annMediaType === "image" ? mediaUrl : null,
          meta: {
            announcement_media_url: mediaUrl,
            announcement_media_type: annMediaType,
            customizations: compactDropCustomizations(customizations) ?? null,
            titleRich: titleRichClean,
            descriptionRich: descRichClean,
          },
        });

        window.dispatchEvent(
          new CustomEvent("board:drop:updated", {
            detail: {
              dropId: drop.sourceActivityId,
              drop: {
                ...drop,
                title: titlePlain || drop.title,
                titleRich: titleRichClean,
                description: descPlain || drop.description,
                descriptionRich: descRichClean,
                mediaUrl: mediaUrl ?? undefined,
                mediaKind,
                customizations: compactDropCustomizations(customizations) ?? drop.customizations,
              },
            },
          })
        );

        setToast("Announcement updated ✓");
        close();
        return;
      }

      let media: Partial<DropItem> = {
        bucket: drop.bucket,
        storagePath: drop.storagePath,
        mediaKind: drop.mediaKind,
        fileName: drop.fileName,
        mime: drop.mime,
        fileSize: drop.fileSize,
      };
      if (pendingFile) {
        const up = await uploadDropMedia(pendingFile, drop.id);
        if (up) {
          media = {
            bucket: up.bucket,
            storagePath: up.storagePath,
            mediaKind: isAudioFile(pendingFile)
              ? "audio"
              : pendingFile.type.startsWith("video/")
                ? "video"
                : "image",
            fileName: pendingFile.name,
            mime: pendingFile.type,
            fileSize: pendingFile.size,
          };
        } else {
          throw new Error("Couldn't upload the new media. Check you're signed in.");
        }
      }

      const isLink = LINK_TYPES.has(drop.type);
      const cents = drop.type === "Pay" ? parsePriceToCents(payPrice) : drop.priceCents;
      const cleanLink = payLink.trim() ? normalizeUrl(payLink) : null;

      // Rich title/description: store the formatted value AND a plain-text mirror
      // (used by feed titles, search, and any surface that hasn't adopted rich text).
      const titleRichClean = normalizeRichText(titleRich);
      const descRichClean = normalizeRichText(descRich);
      const titlePlain = richToPlain(titleRich.html);
      const descPlain = richToPlain(descRich.html);

      const updated: DropItem = {
        ...drop,
        title: titlePlain || drop.title,
        titleRich: titleRichClean,
        description: drop.type === "Thought" ? drop.description : descPlain || undefined,
        descriptionRich: descRichClean,
        thoughtText: drop.type === "Thought" ? descPlain || undefined : drop.thoughtText,
        visibility: drop.type === "Thought" ? visibility : drop.visibility,
        url: isLink ? (linkUrl.trim() ? normalizeUrl(linkUrl) ?? drop.url : drop.url) : drop.url,
        priceCents: drop.type === "Pay" ? cents ?? drop.priceCents : drop.priceCents,
        paymentLink: drop.type === "Pay" ? cleanLink ?? undefined : drop.paymentLink,
        linkUrl: drop.type === "Pay" ? cleanLink ?? drop.linkUrl : drop.linkUrl,
        customizations: compactDropCustomizations(customizations) ?? drop.customizations,
        ...media,
      };

      await persistDropEdit(updated);

      if (updated.type === "Pay") {
        upsertPayDrop(
          {
            id: updated.id,
            title: updated.title,
            description: updated.description || undefined,
            amountCents: updated.priceCents ?? 0,
            recipientUserId: updated.recipientUserId,
            recipientUsername: updated.recipientUsername,
            recipientDisplayName: updated.recipientDisplayName,
            recipientStripeAccountId: updated.recipientStripeAccountId,
            createdAt: updated.createdAt,
            updatedAt: Date.now(),
            provider: updated.payProvider ?? "stripe_connect",
            status:
              updated.payProvider === "stripe_connect" ? "gateway_setup_required" : "active",
            checkoutMode:
              updated.payProvider === "stripe_connect" ? "embedded_hosted" : "external_link",
            checkoutUrl: updated.paymentLink ?? undefined,
            gatewayLabel:
              updated.payProvider === "stripe_connect" ? "Stripe" : "External Payment Link",
            bucket: updated.bucket,
            storagePath: updated.storagePath,
            mediaKind:
              updated.mediaKind === "video"
                ? "video"
                : updated.mediaKind === "audio"
                  ? "audio"
                  : "image",
            mediaSource: updated.mediaSource ?? "upload",
          },
          ownerId
        );
      }

      setToast("Drop updated ✓");
      close();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Couldn't update drop.");
      setSaving(false);
    }
  }

  if (!drop && !toast) return null;

  const isLink = drop ? LINK_TYPES.has(drop.type) : false;
  const isDoc = drop?.type === "Doc";
  const isThought = drop?.type === "Thought";
  const isPay = drop?.type === "Pay";
  const hasStoredMedia = !!(drop && drop.bucket && drop.storagePath);
  // Show the Drop Studio Editor whenever the drop has editable media — a stored
  // file OR a direct media URL (feed drops only carry the latter). Doc Drops
  // always open Descript (no camera / voice / art modes).
  const hasMedia = !!(drop && (hasStoredMedia || drop.mediaUrl));

  return (
    <>
      {drop ? (
        <div
          className="bde-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) close();
          }}
        >
          <div className="bde-window">
            <div className="bde-head">
              <div className="bde-eyebrow">
                {drop.editSource === "announcement" ? "Announcement" : `${drop.type} Drop`}
              </div>
              <div className="bde-title-h">Edit Drop</div>
              <button
                className="bde-close"
                type="button"
                onClick={() => !saving && close()}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="bde-body">
              <label className="bde-label">Title</label>
              <RichTextField
                value={titleRich}
                onChange={setTitleRich}
                placeholder="Title"
                ariaLabel="Title"
                minHeight={52}
              />

              {isLink ? (
                <>
                  <label className="bde-label" htmlFor="bde-link">
                    Link
                  </label>
                  <input
                    id="bde-link"
                    className="bde-input"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </>
              ) : null}

              <label className="bde-label">
                {drop.type === "Thought" ? "Thought" : "Description"}
              </label>
              <RichTextField
                value={descRich}
                onChange={setDescRich}
                placeholder={drop.type === "Thought" ? "What's on your mind?" : "Add a description"}
                ariaLabel={drop.type === "Thought" ? "Thought" : "Description"}
                minHeight={72}
              />

              {drop.type === "Pay" ? (
                <div className="bde-pay-row">
                  <div className="bde-pay-col">
                    <label className="bde-label" htmlFor="bde-price">
                      Price (USD)
                    </label>
                    <input
                      id="bde-price"
                      className="bde-input"
                      value={payPrice}
                      onChange={(e) => setPayPrice(e.target.value)}
                      placeholder="25.00"
                      inputMode="decimal"
                    />
                  </div>
                  <div className="bde-pay-col">
                    <label className="bde-label" htmlFor="bde-paylink">
                      Payment link (optional)
                    </label>
                    <input
                      id="bde-paylink"
                      className="bde-input"
                      value={payLink}
                      onChange={(e) => setPayLink(e.target.value)}
                      placeholder="https://…"
                    />
                  </div>
                </div>
              ) : null}

              {drop.type === "Thought" ? (
                <div className="bde-visibility">
                  <span className="bde-label">Visibility</span>
                  <div className="bde-vis-group">
                    <button
                      type="button"
                      className={`bde-vis ${visibility === "public" ? "on" : ""}`}
                      onClick={() => setVisibility("public")}
                    >
                      Public
                    </button>
                    <button
                      type="button"
                      className={`bde-vis ${visibility === "private" ? "on" : ""}`}
                      onClick={() => setVisibility("private")}
                    >
                      Private
                    </button>
                  </div>
                </div>
              ) : null}

              {isDoc || isThought || isPay ? (
                <div className="bde-media-row">
                  <button type="button" className="bde-studio-btn" onClick={openDescriptStudioFor}>
                    🎬 Open Drop Studio
                  </button>
                  <span className="bde-media-note">
                    {isDoc
                      ? "Edit title and notes in Descript."
                      : isThought
                        ? "Write or refine your thought in Descript."
                        : "Draft your Pay Drop copy in Descript."}
                  </span>
                </div>
              ) : null}

              {hasMedia && !isDoc ? (
                <div className="bde-media-row">
                  <button type="button" className="bde-studio-btn" onClick={openMediaStudio}>
                    🎬 Drop Studio Editor
                  </button>
                  <span className="bde-media-note">
                    {pendingFile ? "New media ready — save to apply." : "Replace photo, video, or audio."}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="bde-actions">
              <button
                type="button"
                className="bde-cancel"
                onClick={() => !saving && close()}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="button" className="bde-save" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Drop Studio for media re-editing, layered above the window. A drop's
          media type is fixed once created — editing must stay on the SAME media
          (you can redraw, add stickers/text/filters, replace with the same kind),
          but you can't switch a photo drop into a video/audio/art drop and turn it
          into a different drop. So we lock the studio to the current media's mode. */}
      <DropStudioStage
        open={studioMode !== null}
        initialFile={studioInitialFile}
        initialMode={
          studioMode ?? (drop?.type === "Doc" ? "descript" : "photo")
        }
        allowedModes={drop ? studioModesForDropType(drop.type) : ["photo"]}
        descriptDestination={drop ? descriptDestinationForDropType(drop.type) : "doc"}
        value={customizations}
        onChange={setCustomizations}
        onComplete={(captured) => {
          setPendingFile(captured);
          setStudioMode(null);
        }}
        onClose={() => setStudioMode(null)}
      />

      {toast ? <div className="bde-toast">{toast}</div> : null}

      <style>{`
        .bde-overlay {
          position: fixed;
          inset: 0;
          z-index: 100040;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(8, 10, 18, 0.55);
          backdrop-filter: blur(6px);
        }
        .bde-window {
          width: 100%;
          max-width: 520px;
          max-height: 86vh;
          display: flex;
          flex-direction: column;
          background: linear-gradient(180deg, #ffffff, #fbf8ff);
          border: 1px solid rgba(160, 110, 255, 0.28);
          border-radius: 20px;
          box-shadow: 0 30px 80px rgba(20, 8, 40, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.6) inset;
          overflow: hidden;
        }
        .bde-head {
          position: relative;
          padding: 16px 18px 12px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }
        .bde-eyebrow {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #9b6bff;
        }
        .bde-title-h {
          font-size: 20px;
          font-weight: 800;
          color: #1a1430;
          margin-top: 2px;
        }
        .bde-close {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: #fff;
          color: #4a4458;
          font-size: 14px;
          cursor: pointer;
        }
        .bde-close:hover { background: #f3eefe; }
        .bde-body {
          padding: 14px 18px;
          overflow-y: auto;
        }
        .bde-label {
          display: block;
          font-size: 12px;
          font-weight: 700;
          color: #6b6480;
          margin: 12px 0 5px;
        }
        .bde-body > .bde-label:first-child { margin-top: 0; }
        .bde-input,
        .bde-textarea {
          width: 100%;
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 14px;
          color: #1a1430;
          background: #fff;
          outline: none;
        }
        .bde-input:focus,
        .bde-textarea:focus {
          border-color: rgba(160, 110, 255, 0.6);
          box-shadow: 0 0 0 3px rgba(160, 110, 255, 0.16);
        }
        .bde-textarea { resize: vertical; min-height: 70px; }
        .bde-pay-row { display: flex; gap: 10px; }
        .bde-pay-col { flex: 1; min-width: 0; }
        .bde-visibility { margin-top: 12px; }
        .bde-vis-group { display: flex; gap: 8px; }
        .bde-vis {
          flex: 1;
          padding: 9px 0;
          border-radius: 11px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: #fff;
          font-weight: 700;
          font-size: 13px;
          color: #6b6480;
          cursor: pointer;
        }
        .bde-vis.on {
          border-color: rgba(160, 110, 255, 0.7);
          background: #f1e9ff;
          color: #6a32d6;
        }
        .bde-media-row {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .bde-studio-btn {
          padding: 11px 14px;
          border-radius: 12px;
          border: 1px solid rgba(160, 110, 255, 0.4);
          background: linear-gradient(180deg, #f6f0ff, #efe6ff);
          color: #6a32d6;
          font-weight: 800;
          font-size: 14px;
          cursor: pointer;
        }
        .bde-studio-btn:hover { border-color: rgba(160, 110, 255, 0.8); }
        .bde-media-note { font-size: 12px; color: #8a839a; }
        .bde-actions {
          display: flex;
          gap: 10px;
          padding: 14px 18px;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          background: rgba(250, 248, 255, 0.8);
        }
        .bde-cancel,
        .bde-save {
          flex: 1;
          padding: 12px 0;
          border-radius: 13px;
          font-weight: 800;
          font-size: 14px;
          cursor: pointer;
        }
        .bde-cancel {
          border: 1px solid rgba(0, 0, 0, 0.14);
          background: #fff;
          color: #4a4458;
        }
        .bde-save {
          border: none;
          background: linear-gradient(180deg, #a06bff, #7c3aed);
          color: #fff;
          box-shadow: 0 8px 22px rgba(124, 58, 237, 0.35);
        }
        .bde-save:disabled,
        .bde-cancel:disabled { opacity: 0.6; cursor: default; }
        .bde-toast {
          position: fixed;
          left: 50%;
          bottom: 28px;
          transform: translateX(-50%);
          z-index: 100060;
          background: #1a1430;
          color: #fff;
          padding: 10px 18px;
          border-radius: 999px;
          font-weight: 700;
          font-size: 13px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }
        @media (max-width: 540px) {
          .bde-window { max-width: 100%; max-height: 90vh; }
          .bde-pay-row { flex-direction: column; }
        }
      `}</style>
    </>
  );
}
