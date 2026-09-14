import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFixtureEndTime } from './live-data-updater.js';

// Ticket 869f1cmaf: fixture_ended must persist the feed's own payload.timestamp
// (confirmed epoch ms in a real capture) instead of the server's Date.now().

test('resolveFixtureEndTime uses the feed timestamp when present', () => {
  const feedTimestamp = 1749571778740;
  const endTime = resolveFixtureEndTime({ fixtureId: 911243, timestamp: feedTimestamp });
  assert.equal(endTime, feedTimestamp);
});

test('resolveFixtureEndTime falls back to Date.now() and warns when timestamp is missing', () => {
  let warned = false;
  const before = Date.now();
  const endTime = resolveFixtureEndTime({ fixtureId: 911243 }, () => { warned = true; });
  const after = Date.now();

  assert.equal(warned, true);
  assert.ok(endTime >= before && endTime <= after);
});

test('resolveFixtureEndTime falls back to Date.now() when timestamp is null', () => {
  let warned = false;
  const endTime = resolveFixtureEndTime({ fixtureId: 911243, timestamp: null }, () => { warned = true; });

  assert.equal(warned, true);
  assert.equal(typeof endTime, 'number');
});
