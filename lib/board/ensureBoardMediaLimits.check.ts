import {
  BOARD_MEDIA_BUCKET_FILE_SIZE_LIMIT,
} from "./ensureBoardMediaLimits";
import { UPLOAD_LIMITS } from "./uploadLimits";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(
  BOARD_MEDIA_BUCKET_FILE_SIZE_LIMIT === UPLOAD_LIMITS.video,
  "bucket raise target must match the 4GB app video cap"
);
assert(
  BOARD_MEDIA_BUCKET_FILE_SIZE_LIMIT === 4 * 1024 * 1024 * 1024,
  "board-media file_size_limit raise is 4GB, not the 50MB default"
);

console.log("ensureBoardMediaLimits.check.ts ok");
