import {
  extractSoundCloudIframeSrc,
  isSoundCloudUrl,
  soundCloudResourceUrl,
  toSoundCloudEmbed,
  unwrapSoundCloudPlayerUrl,
} from "./soundCloudEmbed";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run() {
  const page = "https://soundcloud.com/forss/flickermood";
  const share =
    "https://soundcloud.com/forss/flickermood?si=abc&utm_source=clipboard&utm_medium=text&utm_campaign=social_sharing";
  const player = toSoundCloudEmbed(page);
  assert(player, "canonical track should embed");
  assert(
    player!.includes("url=https%3A%2F%2Fsoundcloud.com%2Fforss%2Fflickermood"),
    "player should encode the canonical track URL once"
  );
  assert(!player!.includes("w.soundcloud.com%2Fplayer"), "must not nest the player URL");

  const twice = toSoundCloudEmbed(player!);
  assert(twice, "already-built player URLs should still embed");
  assert(
    unwrapSoundCloudPlayerUrl(twice!) === page,
    "nested player wrappers should unwrap to the track"
  );
  assert(
    soundCloudResourceUrl(player!) === page,
    "resource helper should peel the widget down to the track"
  );

  assert(
    soundCloudResourceUrl(share) === page,
    "mobile share tracking params should be stripped"
  );
  assert(
    soundCloudResourceUrl("https://m.soundcloud.com/forss/flickermood/") === page,
    "mobile host and trailing slash should canonicalize"
  );
  assert(
    soundCloudResourceUrl("https://on.soundcloud.com/AbCdEf") === "https://on.soundcloud.com/AbCdEf",
    "short share hosts should stay identifiable"
  );
  assert(isSoundCloudUrl("https://snd.sc/AbCdEf"), "snd.sc is a SoundCloud host");
  assert(!toSoundCloudEmbed("https://soundcloud.com/discover"), "discover is not a playable resource");
  assert(!toSoundCloudEmbed("https://example.com/track"), "foreign hosts should not embed");

  const html =
    '<iframe width="100%" height="400" src="https://w.soundcloud.com/player/?visual=true&url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F293&show_artwork=true"></iframe>';
  assert(
    extractSoundCloudIframeSrc(html)?.includes("api.soundcloud.com%2Ftracks%2F293"),
    "oEmbed html should yield the API track player"
  );

  console.log("soundCloudEmbed checks passed");
}

run();
