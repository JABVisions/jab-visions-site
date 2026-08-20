// Descript starter templates. Each template PRECONFIGURES the existing editor
// (title hint + seed body HTML) — it does NOT create a separate editor. Seed
// HTML uses only the tags the Descript sanitizer allows (h2/h3, p, ul/ol/li,
// blockquote, b/i/u) so it round-trips cleanly.

export type DescriptTemplateKey =
  | "blank"
  | "screenplay"
  | "lyrics"
  | "journal"
  | "article"
  | "proposal"
  | "story-outline"
  | "meeting-notes"
  | "production-notes";

export type DescriptTemplate = {
  key: DescriptTemplateKey;
  label: string;
  glyph: string;
  /** Placeholder shown in the title field. */
  titleHint: string;
  /** Seed body HTML (sanitizer-safe). Empty for blank. */
  seedHtml: string;
};

export const DESCRIPT_TEMPLATES: DescriptTemplate[] = [
  {
    key: "blank",
    label: "Blank",
    glyph: "📄",
    titleHint: "Untitled Descript",
    seedHtml: "",
  },
  {
    key: "screenplay",
    label: "Screenplay",
    glyph: "🎬",
    titleHint: "Scene / Script title",
    seedHtml:
      "<h2>INT. LOCATION — DAY</h2>" +
      "<p>Action line. Describe what we see.</p>" +
      "<p><b>CHARACTER</b></p>" +
      "<p>Dialogue goes here.</p>" +
      "<p><i>(beat)</i></p>",
  },
  {
    key: "lyrics",
    label: "Song Lyrics",
    glyph: "🎵",
    titleHint: "Song title",
    seedHtml:
      "<h3>Verse 1</h3><p>…</p>" +
      "<h3>Chorus</h3><p>…</p>" +
      "<h3>Verse 2</h3><p>…</p>" +
      "<h3>Bridge</h3><p>…</p>",
  },
  {
    key: "journal",
    label: "Journal Entry",
    glyph: "📓",
    titleHint: "How today felt",
    seedHtml:
      "<blockquote>One line that captures today.</blockquote>" +
      "<p><b>On my mind:</b></p><p>…</p>" +
      "<p><b>Grateful for:</b></p><ul><li>…</li></ul>",
  },
  {
    key: "article",
    label: "Article",
    glyph: "📰",
    titleHint: "Headline",
    seedHtml:
      "<p><i>Standfirst — one sentence that hooks the reader.</i></p>" +
      "<h2>Section heading</h2><p>…</p>" +
      "<h2>Section heading</h2><p>…</p>",
  },
  {
    key: "proposal",
    label: "Proposal",
    glyph: "📨",
    titleHint: "Proposal for…",
    seedHtml:
      "<h2>Overview</h2><p>…</p>" +
      "<h2>The ask</h2><p>…</p>" +
      "<h2>Deliverables</h2><ul><li>…</li></ul>" +
      "<h2>Timeline & budget</h2><p>…</p>",
  },
  {
    key: "story-outline",
    label: "Story Outline",
    glyph: "🗺️",
    titleHint: "Working title",
    seedHtml:
      "<h2>Logline</h2><p>…</p>" +
      "<h2>Act I</h2><ol><li>…</li></ol>" +
      "<h2>Act II</h2><ol><li>…</li></ol>" +
      "<h2>Act III</h2><ol><li>…</li></ol>",
  },
  {
    key: "meeting-notes",
    label: "Meeting Notes",
    glyph: "🗒️",
    titleHint: "Meeting — date",
    seedHtml:
      "<p><b>Attendees:</b> …</p>" +
      "<h3>Discussion</h3><ul><li>…</li></ul>" +
      "<h3>Decisions</h3><ul><li>…</li></ul>" +
      "<h3>Action items</h3><ol><li>…</li></ol>",
  },
  {
    key: "production-notes",
    label: "Production Notes",
    glyph: "🎚️",
    titleHint: "Project — production notes",
    seedHtml:
      "<h3>Status</h3><p>…</p>" +
      "<h3>To do</h3><ul><li>…</li></ul>" +
      "<h3>Assets / references</h3><ul><li>…</li></ul>" +
      "<h3>Notes</h3><p>…</p>",
  },
];

export function getDescriptTemplate(key: string): DescriptTemplate | undefined {
  return DESCRIPT_TEMPLATES.find((t) => t.key === key);
}
