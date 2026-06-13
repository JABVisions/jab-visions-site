export type LinkPreview = {
  url: string;
  provider: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
  embedUrl: string | null;
  type: "video" | "music" | "link";
};

const previewInflight = new Map<string, Promise<LinkPreview | null>>();

export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  const clean = url.trim();
  if (!clean) return null;

  const existing = previewInflight.get(clean);
  if (existing) return existing;

  const request = (async () => {
    try {
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(clean)}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });

      if (!res.ok) return null;

      const data = (await res.json()) as LinkPreview;
      if (!data?.url) return null;
      return data;
    } finally {
      previewInflight.delete(clean);
    }
  })();

  previewInflight.set(clean, request);
  return request;
}
