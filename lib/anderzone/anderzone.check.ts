import { defaultAvatar, sanitizeAvatar } from "./avatar";
import { adoptFirstDooboo, commandPet, decayCare, stepPet } from "./dooboo/pet";
import {
  cancelEdit,
  canVisit,
  createEditor,
  createStarterPod,
  ensureStarterPod,
  moveItem,
  placeItem,
  redoEdit,
  removeItem,
  rotateItem,
  confirmedPodVersion,
  saveEdit,
  undoEdit,
} from "./homePod";
import { createDistrict, districtJoinFrame, interpolatePresence, resolveJoinIdentity, sharesDistrict } from "./room";
import {
  bodyHitsSolid,
  directionFromKeys,
  enterRegion,
  moveBody,
  nearestInteractable,
  regionById,
  velocityFor,
  type Body,
} from "./world";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const central = regionById("anderzone-central");
assert(central?.title === "ANDERZONE CENTRAL", "the hub is named ANDERZONE CENTRAL");
assert(!central?.title.includes("Ander Central"), "the hub is not shortened");
assert(enterRegion("pixel-paradise").ok === false, "Pixel Paradise is defined but not playable");
assert(enterRegion("whisper-woods").ok === false, "Whisper Woods is defined but not playable");
assert(enterRegion("outer-grid").ok === false, "Outer Grid is defined but not playable");
assert(enterRegion("underground").ok === false, "Underground is defined but not playable");
assert(enterRegion("null-zone").ok === false, "Null Zone is defined but not playable");
assert(enterRegion("anderzone-central").ok, "ANDERZONE CENTRAL can be entered");
assert(enterRegion("home-pod").ok, "a Home Pod can be entered");

assert(directionFromKeys(1, -1) === "ne", "two keys make a diagonal facing");
assert(directionFromKeys(0, 1) === "s", "south is a cardinal facing");
const diagonal = velocityFor(1, 1);
const cardinal = velocityFor(0, 1);
assert(Math.abs(Math.hypot(diagonal.x, diagonal.y) - Math.hypot(cardinal.x, cardinal.y)) < 0.001, "diagonals are not faster");

const spawn = central!.spawn!;
let body: Body = { x: spawn.x, y: spawn.y, facing: "s" };
const before = body.x;
body = moveBody(central!, body, 1, 0, 0.2);
assert(body.x > before, "east movement changes the player");
assert(body.facing === "e", "movement faces east");
const wall = moveBody(central!, { x: 16, y: 16, facing: "n" }, 0, -1, 0.5);
assert(wall.y === 16, "a wall blocks movement");
assert(bodyHitsSolid(central!, 8, 8), "the map border is solid");

const sign = nearestInteractable(central!, 11 * 32 + 16, 7 * 32 + 16, 48);
assert(sign?.kind === "sign", "the plaza sign can be reached");
assert(sign.prompt.includes("ANDERZONE CENTRAL"), "the sign names the hub");

const avatar = sanitizeAvatar({ skin: "nope", eyes: "bright", hair: "long", clothing: "suit", accessory: "visor" });
assert(avatar.skin === defaultAvatar().skin, "unknown skin tones fall back");
assert(avatar.eyes === "bright" && avatar.hair === "long" && avatar.accessory === "visor", "known avatar layers are kept");

const firstGrant = ensureStarterPod("user-a", null, false);
assert(firstGrant.grantedNow && firstGrant.pod?.visitorAccess === "private", "the first visit grants one private Starter Pod");
const second = ensureStarterPod("user-a", firstGrant.pod, true);
assert(second.grantedNow === false && second.pod?.id === firstGrant.pod?.id, "a second visit does not grant another pod");

const pod = createStarterPod("user-a");
let editor = createEditor(pod.layout);
const placed = placeItem(editor, { id: "bed-1", kind: "bed", x: 2, y: 2, rotation: 0 }, pod.inventory);
assert(!placed.error, "a pet bed can be placed on open floor");
editor = placed.editor;
const moved = moveItem(editor, "bed-1", 3, 2, pod.inventory);
assert(!moved.error && moved.editor.draft[0]?.x === 3, "selected furniture can move");
editor = moved.editor;
const rotated = rotateItem(editor, "bed-1", pod.inventory);
assert(!rotated.error, "furniture can rotate");
editor = rotated.editor;
editor = removeItem(editor, "bed-1");
assert(editor.draft.length === 0, "furniture can be removed");
editor = undoEdit(editor);
assert(editor.draft.length === 1, "undo restores the removed piece");
editor = redoEdit(editor);
assert(editor.draft.length === 0, "redo removes it again");
editor = undoEdit(editor);
const blocked = placeItem(editor, { id: "lamp-1", kind: "lamp", x: 0, y: 0, rotation: 0 }, pod.inventory);
assert(blocked.error, "walls reject furniture");
const saved = saveEdit(pod, editor, 1);
assert(saved.ok && saved.pod.version === 2, "a valid layout saves and bumps the version");
assert(confirmedPodVersion(false, { ok: true, version: 2 }) === null, "a failed Home Pod response is not saved");
assert(confirmedPodVersion(true, { ok: false, version: 2 }) === null, "a conflict response is not saved");
assert(confirmedPodVersion(true, { ok: true, version: 2 }) === 2, "a saved Home Pod uses the version the account returned");
const stale = saveEdit(saved.pod, saved.editor, 1);
assert(!stale.ok, "a stale layout version is rejected");
const cancelled = cancelEdit(createEditor(saved.pod.layout));
assert(cancelled.draft.length === saved.pod.layout.length, "cancel keeps the saved layout");
assert(canVisit(pod, "user-a"), "the owner can enter a private pod");
assert(!canVisit(pod, "user-b"), "a stranger cannot enter a private pod");
assert(canVisit({ ...pod, visitorAccess: "public" }, "user-b"), "public access lets another player visit");

const adopted = adoptFirstDooboo([], "signalfluff", "Pip", spawn);
assert(adopted.ok && adopted.cost === 0, "the first Dooboo is free");
const again = adoptFirstDooboo([adopted.pet], "sunmote", "Second", spawn);
assert(!again.ok, "another free adoption is not granted");
let pet = commandPet(adopted.pet, "play", 0);
assert(pet.behavior === "play", "a Dooboo can play");
pet = stepPet(pet, spawn, 0.1, 3000, null);
assert(pet.behavior === "follow" || pet.behavior === "idle", "play ends and the Dooboo returns to its person");
const tired = decayCare({ fullness: 80, energy: 80, bond: 4 }, 10_000);
assert(tired.bond === 4, "neglect does not reduce bond");
assert(tired.fullness >= 25 && tired.energy >= 15, "care stays above a floor");
assert(!("dead" in tired), "care has no death state");
const followed = stepPet({ ...adopted.pet, x: spawn.x - 80, y: spawn.y }, spawn, 0.5, 0, null);
assert(followed.x > adopted.pet.x - 80, "a Dooboo follows its owner");

const district = createDistrict();
const appearance = defaultAvatar();
district.join({ id: "a", name: "Ada", x: 100, y: 120, facing: "s", appearance, pet: null }, 1_000);
district.join({ id: "b", name: "Bea", x: 140, y: 120, facing: "w", appearance, pet: null }, 1_000);
const rejoined = district.join({ id: "a", name: "Ada", x: 10, y: 10, facing: "n", appearance, pet: null }, 2_000);
assert(rejoined.reconnected && rejoined.player.x === 100, "rejoining keeps the same seat");
const hack = district.input("b", { seq: 1, x: 900, y: 120, facing: "e" }, 1_100);
assert(!hack.ok, "the room rejects a teleport");
const step = district.input("b", { seq: 2, x: 150, y: 120, facing: "e" }, 1_200);
assert(step.ok, "a short step is accepted");
const shot = district.snapshot();
assert(shot.players.length === 2, "two players share the district");
district.leave("a");
assert(district.snapshot().players.every((player) => player.id !== "a"), "leaving the hub removes that presence");
assert(!("seq" in shot.players[0]) && !("path" in shot), "snapshots omit per-frame history");
assert(sharesDistrict("anderzone-central"), "ANDERZONE CENTRAL is the shared district");
assert(!sharesDistrict("home-pod"), "a Home Pod does not share the hub district");
const signedIn = districtJoinFrame({
  userId: "real-user",
  name: "Ada",
  appearance,
  pet: null,
  token: "board-access-token",
});
assert(signedIn.token === "board-access-token", "a configured room join carries the Board access token");
const localJoin = districtJoinFrame({ userId: "dev", name: "Ada", appearance, pet: null, token: "" });
assert(!("token" in localJoin), "a local room join does not invent a token");
const mid = interpolatePresence({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5);
assert(mid.x === 5 && mid.y === 10, "remote players can be interpolated");
assert(resolveJoinIdentity(null, "dev", false) === null, "a spoofed id is rejected when dev entry is closed");
assert(resolveJoinIdentity("real-user", "dev", false) === "real-user", "a verified Board user is the room identity");

console.log("anderzone pre-alpha checks passed");
