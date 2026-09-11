export const DROPBOOK_MIME = "application/vnd.jab.dropbook+json";

export type DropbookSlideKind =
  | "cover"
  | "image"
  | "video"
  | "audio"
  | "descript"
  | "youtube"
  | "music"
  | "link";

export type DropbookSlide = {
  id: string;
  kind: DropbookSlideKind;
  title: string;
  /** Local media data URL, or remote preview image for link pages. */
  src?: string;
  /** Descript body or link description. */
  text?: string;
  /** External destination for youtube / music / link pages. */
  url?: string;
  /** Platform embed URL when available. */
  embedUrl?: string;
  provider?: string;
};

export type DropbookManifest = {
  format: "jab-dropbook";
  version: 1;
  createdAt: number;
  bookColor: string;
  slides: DropbookSlide[];
};

const SLIDE_KINDS = new Set<DropbookSlideKind>([
  "cover",
  "image",
  "video",
  "audio",
  "descript",
  "youtube",
  "music",
  "link",
]);

export function isDropbookLinkSlide(kind: DropbookSlideKind) {
  return kind === "youtube" || kind === "music" || kind === "link";
}

export function isDropbookSlideFile(value: {
  name?: unknown;
  type?: unknown;
  url?: unknown;
}): boolean {
  const name = typeof value.name === "string" ? value.name : "";
  const type = typeof value.type === "string" ? value.type : "";
  const url = typeof value.url === "string" ? value.url : "";
  return (
    type === DROPBOOK_MIME ||
    /\.dropbook\.json$/i.test(name) ||
    /\.dropbook\.json(?:$|[?#])/i.test(url)
  );
}

export function parseDropbookManifest(value: unknown): DropbookManifest | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<DropbookManifest>;
  if (input.format !== "jab-dropbook" || input.version !== 1 || !Array.isArray(input.slides)) {
    return null;
  }
  const slides = input.slides
    .filter((slide): slide is DropbookSlide => {
      if (!slide || typeof slide !== "object") return false;
      if (typeof slide.id !== "string" || typeof slide.title !== "string") return false;
      if (!SLIDE_KINDS.has(slide.kind)) return false;
      return true;
    })
    .map((slide) => ({
      id: slide.id,
      kind: slide.kind,
      title: slide.title,
      src: typeof slide.src === "string" ? slide.src : undefined,
      text: typeof slide.text === "string" ? slide.text : undefined,
      url: typeof slide.url === "string" ? slide.url : undefined,
      embedUrl: typeof slide.embedUrl === "string" ? slide.embedUrl : undefined,
      provider: typeof slide.provider === "string" ? slide.provider : undefined,
    }))
    .slice(0, 4);
  if (!slides.length) return null;
  return {
    format: "jab-dropbook",
    version: 1,
    createdAt: typeof input.createdAt === "number" ? input.createdAt : Date.now(),
    bookColor: typeof input.bookColor === "string" ? input.bookColor : "#2563EB",
    slides,
  };
}
