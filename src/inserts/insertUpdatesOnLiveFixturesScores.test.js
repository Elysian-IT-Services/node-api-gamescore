import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidScore } from './insertUpdatesOnLiveFixturesScores.js';

// Ticket 869f1cmaf: a null/missing score from the feed must not overwrite a
// valid stored score, but a real score of 0 is legitimate and must go through.

test('isValidScore rejects null', () => {
  assert.equal(isValidScore(null), false);
});

test('isValidScore rejects undefined', () => {
  assert.equal(isValidScore(undefined), false);
});

test('isValidScore rejects empty string', () => {
  assert.equal(isValidScore(''), false);
});

test('isValidScore accepts 0 as a legitimate score', () => {
  assert.equal(isValidScore(0), true);
});

test('isValidScore accepts a positive score', () => {
  assert.equal(isValidScore(16), true);
});
