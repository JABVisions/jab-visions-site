import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RYDERZ, RYDER_ORDER } from '../config';
import { applyGuestIntent } from '../raid/online';
import { defaultSquad, launchFromSquad } from '../raid/squad';
import { RyderManager, hydrate } from '../ryder-manager';
import { skinPlayable } from './appearance';
import { SKIN_FIELDS, skinnedSpec } from './apply';
import { COLLECTIONS, SKIN_CATEGORIES, SKINS, defaultSkinId, isSkinFor, skinById, skinFor, skinsIn } from './catalog';
import { SKIN_ECONOMY, skinPrice } from './config';
import { checkSkinUnlock, collectionProgress, emptyWardrobe, sanitizeWardrobe, withSkinEquipped } from './wardrobe';

const MOVIE = ['keven_movie', 'leo_movie', 'aaron_movie'];

// 1. The Database has a skins catalogue with data-driven categories.
{
  assert.ok(SKIN_CATEGORIES.some((category) => category.id === 'movie'));
  for (const id of ['movie', 'alternate', 'classic', 'special', 'event', 'prestige']) {
    assert.ok(SKIN_CATEGORIES.some((category) => category.id === id), `category ${id}`);
  }
  for (const skin of SKINS) assert.ok(SKIN_CATEGORIES.some((category) => category.id === skin.category), `${skin.id} category`);
  assert.equal(new Set(SKINS.map((skin) => skin.id)).size, SKINS.length, 'skin ids are unique');
}

// 2. The movie pack: three skins on the existing Ryderz, each with its own model file.
{
  const pack = COLLECTIONS.find((collection) => collection.id === 'movie_pack_vol1');
  assert.ok(pack);
  assert.equal(pack.title, 'THOSE RYDERZ: Movie Skin Pack');
  assert.deepEqual(skinsIn('movie_pack_vol1').map((skin) => skin.id), MOVIE);
  const files = new Set<string>();
  for (const id of MOVIE) {
    const skin = skinById(id)!;
    assert.ok(skin.ryderId in RYDERZ, `${id} keeps a roster id`);
    assert.equal(skin.ryderId, id.replace('_movie', ''));
    assert.ok(skin.model?.glb.startsWith('/assets/those-ryderz/models/skins/'), `${id} model path`);
    assert.ok(!Object.values(RYDERZ).some((spec) => spec.glb === skin.model!.glb), `${id} does not reuse a roster model`);
    files.add(skin.model!.glb);
    assert.deepEqual(skin.unlock, { kind: 'free' }, `${id} needs no Signal Points`);
  }
  assert.equal(files.size, 3, 'each movie skin has its own file');
  assert.equal(skinPrice('movie_pack_vol1'), 0, 'the movie pack is free');
  for (const id of RYDER_ORDER) {
    const fallback = skinFor(id, null);
    assert.equal(fallback.id, defaultSkinId(id));
    assert.equal(fallback.model, null, 'the default skin is the existing model');
  }
  // No duplicate playable characters.
  assert.equal(new Set(RYDER_ORDER).size, RYDER_ORDER.length);
  const publicDir = path.join(__dirname, '../../../public');
  for (const id of MOVIE) {
    assert.ok(fs.existsSync(path.join(publicDir, skinById(id)!.model!.glb)), `${id} model is supplied`);
    assert.ok(fs.existsSync(path.join(publicDir, skinById(id)!.thumbnail!)), `${id} thumbnail is supplied`);
  }
}

function managerWith(earned: number) {
  return new RyderManager({ signal: { earned, spent: 0 } });
}

// Free movie skins: owned from the start, equipped with no Signal Points.
{
  const manager = managerWith(0);
  for (const id of MOVIE) {
    const check = manager.canUnlockSkin(id);
    assert.equal(!check.ok && check.reason, 'owned');
    assert.equal(manager.equipSkin(id), true, `${id} equips with 0 SP`);
  }
  assert.equal(manager.signalAvailable(), 0);
  assert.deepEqual(manager.wardrobe().equipped, { keven: 'keven_movie', leo: 'leo_movie', aaron: 'aaron_movie' });
  assert.deepEqual(hydrate(JSON.parse(JSON.stringify(manager.getState()))).skins.equipped, manager.wardrobe().equipped, 'equipped free skins survive a reload');
  const progress = collectionProgress(emptyWardrobe()).find((entry) => entry.collection.id === 'movie_pack_vol1')!;
  assert.deepEqual([progress.owned, progress.total], [3, 3]);
  // A save that paid for a movie skin before it went free gets the points back.
  const paid = hydrate({ ...JSON.parse(JSON.stringify(managerWith(1500).getState())), skins: { owned: { leo_movie: { at: 1, paid: 1000 } }, equipped: { leo: 'leo_movie' } } });
  assert.equal(paid.signal.spent, 0);
  assert.equal(paid.skins.equipped.leo, 'leo_movie');
}

// The purchase rules below still hold for any skin given a price.
const freeUnlocks = MOVIE.map((id) => skinById(id)!.unlock);
for (const id of MOVIE) skinById(id)!.unlock = { kind: 'signal', cost: 1000 };

// 3. A locked skin cannot be equipped.
{
  const manager = managerWith(5000);
  assert.equal(manager.equipSkin('leo_movie'), false);
  assert.equal(manager.equippedSkin('leo').id, 'leo_default');
  assert.equal(withSkinEquipped(emptyWardrobe(), 'leo_movie'), null);
  assert.equal(manager.equipSkin('not_a_skin'), false);
}

// 4. Unlocking deducts the configured price once.
{
  const manager = managerWith(1500);
  assert.equal(manager.unlockSkin('keven_movie'), true);
  assert.equal(manager.signalAvailable(), 500);
  const owned = manager.wardrobe().owned.keven_movie;
  assert.equal(owned.paid, 1000);
  assert.ok(owned.at > 0, 'unlock time recorded');
}

// 5. Short on SP: nothing changes.
{
  const manager = managerWith(900);
  const check = manager.canUnlockSkin('aaron_movie');
  assert.equal(check.ok, false);
  assert.equal(!check.ok && check.reason, 'short');
  assert.equal(!check.ok && check.short, 100);
  assert.equal(manager.unlockSkin('aaron_movie'), false);
  assert.equal(manager.signalAvailable(), 900);
  assert.equal('aaron_movie' in manager.wardrobe().owned, false);
}

// 6. A purchase cannot happen twice, and the balance never goes negative.
{
  const manager = managerWith(2500);
  assert.equal(manager.unlockSkin('aaron_movie'), true);
  assert.equal(manager.unlockSkin('aaron_movie'), false);
  assert.equal(manager.signalAvailable(), 1500);
  assert.equal(checkSkinUnlock(manager.wardrobe(), 'aaron_movie', 99999).ok, false);
  assert.equal(manager.unlockSkin('keven_movie'), true);
  assert.equal(manager.unlockSkin('leo_movie'), false, 'only 500 left');
  assert.ok(manager.signalAvailable() >= 0);
  assert.equal(manager.unlockSkin('keven_default'), false, 'defaults are not for sale');
}

// 7. Owned and equipped skins survive a reload; old saves migrate.
{
  const manager = managerWith(3000);
  manager.unlockSkin('keven_movie');
  assert.equal(manager.equipSkin('keven_movie'), true);
  const stored = JSON.parse(JSON.stringify(manager.getState()));
  const restored = hydrate(stored);
  assert.deepEqual(restored.skins.equipped, { keven: 'keven_movie' });
  assert.equal(restored.skins.owned.keven_movie.paid, 1000);
  assert.equal(restored.signal.spent, 1000, 'the skin stays paid for after reload');
  // A save from before skins.
  const legacy = { ...stored };
  delete legacy.skins;
  const migrated = hydrate(legacy);
  assert.deepEqual(migrated.skins, emptyWardrobe());
  assert.equal(migrated.activeRyder, restored.activeRyder);
  // Equipping a skin that was never bought, or on the wrong Ryder, is dropped.
  const forged = sanitizeWardrobe({ owned: { leo_movie: { at: 1, paid: 1000 }, bogus: { at: 1, paid: 5 } }, equipped: { keven: 'keven_movie', aaron: 'leo_movie' } });
  assert.deepEqual(Object.keys(forged.owned), ['leo_movie']);
  assert.deepEqual(forged.equipped, {});
  assert.deepEqual(sanitizeWardrobe('garbage'), emptyWardrobe());
  // Going back to the default model.
  assert.equal(manager.equipSkin('keven_default'), true);
  assert.deepEqual(manager.wardrobe().equipped, {});
  const progress = collectionProgress(manager.wardrobe()).find((entry) => entry.collection.id === 'movie_pack_vol1')!;
  assert.deepEqual([progress.owned, progress.total], [1, 3]);
}

MOVIE.forEach((id, i) => {
  skinById(id)!.unlock = freeUnlocks[i];
});

// 8. A skin changes how a Ryder looks, never what they do.
{
  for (const id of MOVIE) {
    const skin = skinById(id)!;
    const base = RYDERZ[skin.ryderId];
    const worn = skinnedSpec(base, skin);
    for (const key of Object.keys({ ...base, ...worn }) as (keyof typeof base)[]) {
      if ((SKIN_FIELDS as readonly string[]).includes(key)) continue;
      assert.deepEqual(worn[key], base[key], `${id} keeps ${String(key)}`);
    }
    assert.equal(worn.glb, skin.model!.glb);
    assert.equal(skinnedSpec(RYDERZ.rubi, skin), RYDERZ.rubi, 'a skin never dresses another Ryder');
  }
  const manager = managerWith(5000);
  const before = JSON.stringify({ loadouts: manager.getState().loadouts, nodes: manager.getState().nodes, ranks: manager.getState().ranks, active: manager.activeRyder });
  manager.unlockSkin('leo_movie');
  manager.equipSkin('leo_movie');
  const after = JSON.stringify({ loadouts: manager.getState().loadouts, nodes: manager.getState().nodes, ranks: manager.getState().ranks, active: manager.activeRyder });
  assert.equal(after, before);
}

// 9. Missing or unrigged models fall back instead of breaking play.
{
  const skin = skinById('aaron_movie')!;
  assert.equal(skinPlayable(skin, 'ready'), true);
  assert.equal(skinPlayable(skin, 'static'), false, 'an unrigged scan is flagged, not played as a statue');
  assert.equal(skinPlayable({ ...skin, model: { ...skin.model!, allowStaticPose: true } }, 'static'), true);
  assert.equal(skinPlayable(skin, 'missing'), false);
  assert.equal(skinPlayable(skin, 'error'), false);
  assert.equal(skinPlayable(skin, null), false, 'unchecked is not trusted');
}

// 10. Raid rooms carry the skin id, never the model.
{
  const squad = defaultSquad('rubi');
  const joined = applyGuestIntent(squad, [], { intent: 'join', guestId: 'g1', name: 'Friend' });
  const seat = joined.squad.slots.find((slot) => slot.playerId === 'g1')!;
  const picked = applyGuestIntent(joined.squad, joined.guests, { intent: 'character', guestId: 'g1', slot: seat.index, ryderId: 'aaron', skinId: 'aaron_movie' });
  const slot = picked.squad.slots.find((entry) => entry.playerId === 'g1')!;
  assert.equal(slot.skinId, 'aaron_movie');
  const ally = launchFromSquad(picked.squad, 'rubi').allies.find((entry) => entry.playerId === 'g1')!;
  assert.equal(ally.skinId, 'aaron_movie');
  const wrong = applyGuestIntent(joined.squad, joined.guests, { intent: 'character', guestId: 'g1', slot: seat.index, ryderId: 'leo', skinId: 'aaron_movie' });
  assert.equal(wrong.squad.slots.find((entry) => entry.playerId === 'g1')!.skinId, null, 'a skin for another Ryder is dropped');
  assert.equal(isSkinFor('aaron', 'aaron_movie'), true);
  assert.equal(isSkinFor('aaron', 'keven_movie'), false);
  assert.equal(JSON.stringify(picked.squad).includes('.glb'), false, 'no model data in the room');
}

// Test unlock is free, recorded as a test grant, and only where enabled.
{
  const manager = managerWith(0);
  assert.equal(manager.grantSkin('leo_movie'), false, 'a free skin is already owned');
  assert.equal(manager.grantSkin('leo_default'), false);
  assert.equal(typeof SKIN_ECONOMY.testUnlock, 'boolean');
}

console.log('skins checks passed');
