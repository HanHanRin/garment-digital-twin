import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeReplay, matchesAsset } from '../src/replay.js';

const data = name => readFileSync(new URL(`../public/data/${name}`, import.meta.url), 'utf8');
const layout = JSON.parse(data('factory-layout.json'));
const rows = data('telemetry.jsonl').trim().split('\n').map(JSON.parse);
const replay = makeReplay(rows, layout.assets.map(a => a.asset_id));

test('fault timing and arbitrary reverse seeking restore correct snapshots', () => {
  const id = 'SEW-A-04';
  assert.equal(replay.frame(180).get(id).status, 'fault');
  assert.equal(replay.frame(239.9).get(id).status, 'fault');
  assert.notEqual(replay.frame(240).get(id).status, 'fault');
  assert.equal(replay.frame(181).get(id).alarm_code, 'THREAD_BREAK');
  assert.equal(replay.frame(179).get(id).alarm_code, null);
  assert.equal(replay.frame(181).get(id).completed_operations, replay.frame(239).get(id).completed_operations);
});

test('offline data stays unknown and clears at reconnect, including history', () => {
  const id = 'SEW-B-05';
  assert.equal(replay.frame(305).get(id).status, 'offline');
  assert.equal(replay.frame(305).get(id).temperature_c, null);
  assert.equal(replay.frame(305).get(id).sewing_speed_sti_min, null);
  assert.equal(replay.frame(330).get(id).alarm_code, null);
  assert.equal(replay.history(id, 335).filter(r => r.status === 'offline').length, 6);
});

test('filters combine model, zone and snapshot status', () => {
  const cat = JSON.parse(data('machine-catalog.json')).find(c => c.catalog_id === 'overlock');
  const asset = layout.assets.find(a => a.asset_id === 'SEW-A-04');
  assert.ok(matchesAsset(asset, cat, replay.frame(180).get(asset.asset_id), { query: 'MO-6814S', status: 'fault', zone: 'SEW' }));
  assert.ok(!matchesAsset(asset, cat, replay.frame(180).get(asset.asset_id), { query: '', status: 'running', zone: 'SEW' }));
  assert.ok(!matchesAsset(asset, cat, replay.frame(180).get(asset.asset_id), { query: '', status: 'fault', zone: 'CUT' }));
});

test('bounds clamp safely and incomplete data is rejected', () => {
  assert.equal(replay.frame(-20).get('SEW-A-04').sim_time_s, 0);
  assert.equal(replay.frame(999).get('SEW-A-04').sim_time_s, 600);
  assert.throws(() => makeReplay(rows.slice(1), layout.assets.map(a => a.asset_id)), /不完整/);
});
