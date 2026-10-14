import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFixtureEndTime, buildPickemScores, sameScores, enqueueForFixture } from './live-data-updater.js';

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

// Pick'ems settles on "ended" with whatever score it has stored at that
// moment; fixture_ended must carry the final score and events must reach it
// in arrival order.

test('buildPickemScores maps fixture_ended participants (string ids) to Pick\'ems fields', () => {
  const participants = [
    { id: '159163', score: 0, name: 'Fisher College' },
    { id: '213313', score: 2, name: 'Astrum' }
  ];
  assert.deepEqual(buildPickemScores(participants), {
    participants0_id: 159163,
    participants0_score: 0,
    participants1_id: 213313,
    participants1_score: 2
  });
});

test('buildPickemScores returns null when a side is missing or incomplete', () => {
  assert.equal(buildPickemScores(undefined), null);
  assert.equal(buildPickemScores([{ id: '1', score: 1 }]), null);
  assert.equal(buildPickemScores([{ id: '1', score: 1 }, { id: '2', score: null }]), null);
});

test('sameScores compares ids and scores', () => {
  const a = { participants0_id: 1, participants0_score: 2, participants1_id: 3, participants1_score: 1 };
  assert.equal(sameScores(a, { ...a }), true);
  assert.equal(sameScores(a, { ...a, participants1_score: 2 }), false);
});

test('enqueueForFixture runs tasks in arrival order even when the first is slower', async () => {
  const context = {};
  const order = [];
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  const first = enqueueForFixture(context, async () => { await delay(30); order.push('score_changed'); });
  const second = enqueueForFixture(context, async () => { order.push('fixture_ended'); });
  await Promise.all([first, second]);

  assert.deepEqual(order, ['score_changed', 'fixture_ended']);
});

test('enqueueForFixture keeps separate queues independent', async () => {
  const context = {};
  const order = [];
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // A slow fixture-event task must not hold up the live-event queue.
  const slow = enqueueForFixture(context, async () => { await delay(30); order.push('fixture'); });
  const mapStarted = enqueueForFixture(context, async () => { await delay(10); order.push('map_started'); }, 'liveQueue');
  const roundStarted = enqueueForFixture(context, async () => { order.push('round_started'); }, 'liveQueue');
  await Promise.all([slow, mapStarted, roundStarted]);

  assert.deepEqual(order, ['map_started', 'round_started', 'fixture']);
});

test('enqueueForFixture keeps the queue going after a task fails', async () => {
  const context = {};
  const failed = enqueueForFixture(context, async () => { throw new Error('boom'); });
  await assert.rejects(failed, /boom/);
  assert.equal(await enqueueForFixture(context, async () => 'ok'), 'ok');
});
