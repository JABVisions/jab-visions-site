import assert from 'node:assert/strict';
import { fieldStations, nearestStation } from './stations';

const stations = fieldStations();
assert.equal(stations.filter((station) => station.kind === 'weapon').length, 2);
assert.equal(stations.filter((station) => station.kind === 'chest').length, 2);
assert.equal(stations.filter((station) => station.kind === 'secret').length, 2);
assert.ok(stations.every((station) => station.claimed === false));

const chest = stations.find((station) => station.kind === 'chest');
assert.ok(chest);
const found = nearestStation(stations, chest.x + 0.4, chest.z - 0.2, 1.8);
assert.equal(found?.kind, 'chest');
chest.claimed = true;
assert.equal(nearestStation(stations, chest.x, chest.z, 0.4), null);

const rack = stations.find((station) => station.kind === 'weapon');
assert.ok(rack);
rack.claimed = true;
assert.equal(nearestStation(stations, rack.x, rack.z, 1)?.kind, 'weapon');

console.log('raid stations ok');
