import {
  createExclusiveAudioPreview,
  type PreviewTransport,
} from "./exclusiveAudioPreview";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class FakeTransport implements PreviewTransport {
  src: string;
  currentTime = 0;
  paused = true;
  onended: (() => void) | null = null;
  playCalls = 0;
  pauseCalls = 0;
  private playDelay: number;

  constructor(src: string, playDelay = 0) {
    this.src = src;
    this.playDelay = playDelay;
  }

  pause() {
    this.pauseCalls += 1;
    this.paused = true;
  }

  play() {
    this.playCalls += 1;
    this.paused = false;
    if (!this.playDelay) return Promise.resolve();
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        this.paused = false;
        resolve();
      }, this.playDelay);
    });
  }
}

function isPaused(transport: FakeTransport) {
  return transport.paused;
}

async function run() {
  const transports: FakeTransport[] = [];
  const preview = createExclusiveAudioPreview({
    createTransport: (src) => {
      const transport = new FakeTransport(src);
      transports.push(transport);
      return transport;
    },
  });

  await preview.play("robot", "blob:robot");
  assert(preview.getPlayingId() === "robot", "selected preset id should be playing");
  assert(preview.isPlaying("robot"), "robot should report as playing");
  assert(!preview.isPlaying("deep"), "unselected presets must not report as playing");
  assert(transports.length === 1, "first play should create one transport");
  assert(transports[0].playCalls === 1 && !isPaused(transports[0]), "first preset should start");

  await preview.play("deep", "blob:deep");
  assert(preview.getPlayingId() === "deep", "selecting another preset should replace the playing id");
  assert(preview.isPlaying("deep") && !preview.isPlaying("robot"), "only the newly selected preset plays");
  assert(transports[0].pauseCalls >= 1 && isPaused(transports[0]), "previous preset must pause");
  assert(transports[0].currentTime === 0, "previous preset should reset");
  assert(transports[1].playCalls === 1 && !isPaused(transports[1]), "new preset should start");

  preview.stop();
  assert(preview.getPlayingId() === null, "stop should clear the playing id");
  assert(!preview.isPlaying("deep"), "stop should leave no preset playing");
  assert(transports[1].pauseCalls >= 1 && isPaused(transports[1]), "active preset must pause on stop");

  const revoked: string[] = [];
  const revoking = createExclusiveAudioPreview({
    createTransport: (src) => new FakeTransport(src),
    revokeObjectURL: (url) => {
      revoked.push(url);
    },
  });
  await revoking.play("echo", "blob:echo", { revokeOnStop: true });
  await revoking.play("reverb", "blob:reverb", { revokeOnStop: true });
  assert(revoked.includes("blob:echo"), "replaced preview URL should be revoked");
  revoking.stop();
  assert(revoked.includes("blob:reverb"), "stopped preview URL should be revoked");

  const slow: FakeTransport[] = [];
  const racing = createExclusiveAudioPreview({
    createTransport: (src) => {
      const transport = new FakeTransport(src, 25);
      slow.push(transport);
      return transport;
    },
  });
  const first = racing.play("chorus", "blob:chorus");
  await racing.play("radio", "blob:radio");
  await first;
  assert(racing.getPlayingId() === "radio", "in-flight play() must yield to the latest selection");
  assert(isPaused(slow[0]), "superseded in-flight preset must end paused");
  assert(!isPaused(slow[1]), "latest selection should remain playing");

  console.log("exclusiveAudioPreview.check.ts: ok");
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
