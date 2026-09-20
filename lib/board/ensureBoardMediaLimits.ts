import { createClient } from "@supabase/supabase-js";
import { BUCKET_DOCS, BUCKET_MEDIA } from "@/lib/board/dropItem";
import { UPLOAD_LIMITS } from "@/lib/board/uploadLimits";

/** Match the app video cap so a 65MB audition tape is not killed at 50MB. */
export const BOARD_MEDIA_BUCKET_FILE_SIZE_LIMIT = UPLOAD_LIMITS.video;

const BUCKETS = [BUCKET_MEDIA, BUCKET_DOCS] as const;

type EnsureResult = {
  ok: boolean;
  limit: number;
  buckets: string[];
  error?: string;
};

let ensured: EnsureResult | null = null;
let inFlight: Promise<EnsureResult> | null = null;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SB_SECRET_KEY;
  if (!url || !service) return null;
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bucketLimitBytes(bucket: { file_size_limit?: number | null } | null | undefined) {
  const value = bucket?.file_size_limit;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Raise `board-media` / `board-docs` `file_size_limit` to the 4GB app cap.
 * Supabase buckets default to 50MB, which 413s a 64.9MB Project Room tape.
 */
export async function ensureBoardMediaFileSizeLimit(): Promise<EnsureResult> {
  if (ensured?.ok) return ensured;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const admin = adminClient();
    if (!admin) {
      return {
        ok: false,
        limit: BOARD_MEDIA_BUCKET_FILE_SIZE_LIMIT,
        buckets: [],
        error: "Board storage admin is not configured.",
      };
    }

    const raised: string[] = [];
    for (const id of BUCKETS) {
      const { data, error } = await admin.storage.getBucket(id);
      if (error || !data) {
        const created = await admin.storage.createBucket(id, {
          public: false,
          fileSizeLimit: BOARD_MEDIA_BUCKET_FILE_SIZE_LIMIT,
        });
        if (created.error) {
          return {
            ok: false,
            limit: BOARD_MEDIA_BUCKET_FILE_SIZE_LIMIT,
            buckets: raised,
            error: created.error.message,
          };
        }
        raised.push(id);
        continue;
      }
      if (bucketLimitBytes(data) >= BOARD_MEDIA_BUCKET_FILE_SIZE_LIMIT) {
        raised.push(id);
        continue;
      }
      const updated = await admin.storage.updateBucket(id, {
        public: Boolean(data.public),
        fileSizeLimit: BOARD_MEDIA_BUCKET_FILE_SIZE_LIMIT,
      });
      if (updated.error) {
        return {
          ok: false,
          limit: bucketLimitBytes(data),
          buckets: raised,
          error: updated.error.message,
        };
      }
      raised.push(id);
    }

    ensured = {
      ok: raised.length === BUCKETS.length,
      limit: BOARD_MEDIA_BUCKET_FILE_SIZE_LIMIT,
      buckets: raised,
    };
    return ensured;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function resetBoardMediaLimitCache() {
  ensured = null;
  inFlight = null;
}
