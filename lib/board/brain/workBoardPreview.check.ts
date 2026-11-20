import {
  libraryDropFromAssetRow,
  libraryDropFromBoardDrop,
  storedLinkThumbnail,
  workBoardLinkUrl,
} from "./workBoardPreview";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const portfolioLink = libraryDropFromAssetRow(
  {
    id: "link-1",
    kind: "link",
    title: "Portfolio",
    description: "Selected work",
    created_at: "2026-11-20T16:00:00.000Z",
    payload: {
      library: { isPortfolio: true },
      url: "https://example.com/portfolio",
    },
  },
  "portfolio"
);

assert(portfolioLink, "a public link drop stays in the portfolio");
assert(portfolioLink.kind === "link", "link assets stay link drops");
assert(portfolioLink.mediaUrl == null, "a page address is not treated as the thumbnail file");
assert(portfolioLink.url === "https://example.com/portfolio", "the page address is kept for the drop link");
assert(workBoardLinkUrl(portfolioLink) === "https://example.com/portfolio", "link drops expose an external url");
assert(storedLinkThumbnail(portfolioLink) == null, "a bare page address is not used as its own thumbnail");

const previewed = libraryDropFromBoardDrop({
  id: "board-link",
  title: "Portfolio",
  type: "Link Drop",
  mediaKind: "image",
  visibility: "public",
  url: "https://example.com/portfolio",
  linkUrl: "https://example.com/portfolio",
  previewImage: "https://cdn.example.com/og.jpg",
});

assert(previewed?.kind === "link", "a link drop with an image preview stays a link drop");
assert(previewed?.mediaUrl == null, "the preview image is not stored as playable media");
assert(storedLinkThumbnail(previewed!) === "https://cdn.example.com/og.jpg", "the saved preview is the thumbnail");
assert(workBoardLinkUrl(previewed!) === "https://example.com/portfolio", "the drop link still opens the page");

const directImage = libraryDropFromAssetRow(
  {
    id: "poster",
    kind: "link",
    title: "Poster",
    payload: {
      library: { isAsset: true },
      url: "https://cdn.example.com/poster.png",
    },
  },
  "assets"
);

assert(directImage?.mediaUrl == null, "an image address stays on the link, not the media slot");
assert(storedLinkThumbnail(directImage!) === "https://cdn.example.com/poster.png", "a direct image link is its own thumbnail");

const vision = libraryDropFromAssetRow(
  {
    id: "vision-1",
    kind: "media",
    title: "Still",
    payload: {
      library: { isPortfolio: true },
      mediaType: "image",
      url: "https://cdn.example.com/still.jpg",
    },
  },
  "portfolio"
);

assert(vision?.kind === "media", "vision drops stay media");
assert(vision?.mediaUrl === "https://cdn.example.com/still.jpg", "vision drops still show their image");
assert(workBoardLinkUrl(vision!) == null, "vision drops do not become external link cards");

console.log("work board link drop checks passed");
