import assert from "node:assert/strict";
import {
  finishStuckVideo,
  videoErrorNeedsSrcRefresh,
  videoLooksStuckBeforeEnd,
} from "./playableVideo";

function media(partial: {
  currentTime: number;
  duration: number;
  readyState: number;
  bufferedEnd?: number;
  errorCode?: number;
}) {
  const bufferedEnd = partial.bufferedEnd ?? 0;
  return {
    currentTime: partial.currentTime,
    duration: partial.duration,
    readyState: partial.readyState,
    error: partial.errorCode ? { code: partial.errorCode } : null,
    buffered: {
      length: bufferedEnd > 0 ? 1 : 0,
      end: () => bufferedEnd,
    },
  };
}

assert.equal(
  videoLooksStuckBeforeEnd(media({ currentTime: 9.7, duration: 10, readyState: 1, bufferedEnd: 9.72 })),
  true,
  "stall inside the last second is a freeze-before-end"
);
assert.equal(
  videoLooksStuckBeforeEnd(media({ currentTime: 4, duration: 10, readyState: 1, bufferedEnd: 4 })),
  false,
  "mid-tape buffering is not treated as the end"
);
assert.equal(
  videoLooksStuckBeforeEnd(media({ currentTime: 9.9, duration: 10, readyState: 4, bufferedEnd: 10 })),
  false,
  "fully buffered last frames can keep playing"
);
assert.equal(
  videoErrorNeedsSrcRefresh(media({ currentTime: 9.7, duration: 10, readyState: 1, bufferedEnd: 9.72, errorCode: 3 })),
  false,
  "near-end decode errors must not remint the signed URL"
);
assert.equal(
  videoErrorNeedsSrcRefresh(media({ currentTime: 0, duration: 10, readyState: 0, errorCode: 4 })),
  true,
  "unplayable source still refreshes"
);
assert.equal(finishStuckVideo({} as HTMLVideoElement), "noop", "missing media is a no-op");

console.log("playable video checks passed");
