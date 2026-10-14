//src/live-data-updater.js

import WebSocket from 'ws';
import dotenv from 'dotenv';
import axios from 'axios';
import {updateFixtureFields} from './inserts/insertUpdatesOnLiveFixturesScores.js';
import { handleLiveEvent } from './inserts/live-data/index.js';

dotenv.config();

// API Keys and endpoint
const apiKey = process.env.GAME_SCORE_APIKEY;
const TOKEN = apiKey;
const WP_API_KEY = process.env.POST_SYNC_API_KEY; // Your API Key for WP
const PICKEM_API_KEY = process.env.PICKEM_API_KEY; // Your API Key for PICKEM
const WP_DEV_URL = process.env.WP_DEV_URL;
const WP_STAGING_URL = process.env.WP_STAGING_URL;
const WP_PROD_URL = process.env.WP_PROD_URL;
const RR_DEV_URL = process.env.RR_DEV_URL;
const PICKEM_URL = process.env.PICKEM_URL;
const PICKEM_STAGING_URL = process.env.PICKEM_STAGING_URL;

// fixture_ended carries the feed's own close time in payload.timestamp
// (confirmed epoch ms in a real capture). Falls back to Date.now() only if
// the feed omits it, which hasn't been observed in practice.
export function resolveFixtureEndTime(payload, onMissingTimestamp) {
  const feedTimestamp = payload?.timestamp;
  if (feedTimestamp === undefined || feedTimestamp === null) {
    onMissingTimestamp?.();
    return Date.now();
  }
  return feedTimestamp;
}

// Without a timeout a single hung destination (WP/HS/RR) stalls every later
// request for the fixture, since they're awaited one after another.
const http = axios.create({ timeout: 15000 });

const FIXTURE_EVENT_TYPES = new Set(['fixture_started', 'fixture_ended', 'score_changed']);

// ws doesn't await async 'message' listeners, so two events arriving a few ms
// apart (score_changed, fixture_ended) were handled concurrently and could
// reach Pick'ems in the wrong order — Pick'ems settles on "ended" using
// whatever score it has at that moment. Chaining on the context (which
// survives reconnects) keeps them in arrival order per fixture.
// queueKey lets independent streams (fixture events vs. live game events)
// keep their own order without waiting on each other.
export function enqueueForFixture(context, task, queueKey = 'queue') {
  const run = (context[queueKey] || Promise.resolve()).then(task);
  context[queueKey] = run.catch(() => {});
  return run;
}

const toIntOrNull = (v) => {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

// Takes score_changed.payload.scores or fixture_ended.payload.participants
// (both [{ id, score }], ids as strings in real captures) and returns the
// Pick'ems score fields, or null if either side is incomplete.
export function buildPickemScores(participants) {
  if (!Array.isArray(participants) || participants.length < 2) return null;
  const [p0, p1] = participants;
  const scores = {
    participants0_id: toIntOrNull(p0?.id),
    participants0_score: toIntOrNull(p0?.score),
    participants1_id: toIntOrNull(p1?.id),
    participants1_score: toIntOrNull(p1?.score)
  };
  return Object.values(scores).some((v) => v === null) ? null : scores;
}

export function sameScores(a, b) {
  return a.participants0_id === b.participants0_id
    && a.participants0_score === b.participants0_score
    && a.participants1_id === b.participants1_id
    && a.participants1_score === b.participants1_score;
}

// fixture_started / fixture_ended / score_changed handling. Runs through
// enqueueForFixture so a fixture's outbound requests go out in the order
// GSK sent them.
async function handleFixtureEvent(message, context) {
  // --- Detect start of the match ---
  if (message.type === 'fixture_started') {
    const fixtureId = message.payload.fixtureId;

    console.log('[WebSocket] fixture_started event detected:', { fixtureId });

    const payload = {
      external_id: fixtureId,
      status: 'Started'
    };

    console.log('[fixture_started] Payload to send:', payload);

    // --- Send to DB ---

    try {
      const res = await updateFixtureFields( 'cs2' , payload)
      console.log('[UPDATE ON DB] Response:', res);
    } catch (err) {
      console.error('[UPDATE ON DB] Error sending:', err.message);
    }

    // --- Send to WP DEV ---
    try {
      const res = await http.post(WP_DEV_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': WP_API_KEY
        }
      });
      console.log('[POST -> WP DEV] Response:', res.data);
    } catch (err) {
      console.error('[POST -> WP DEV] Error sending:', err.message, err.response?.data);
    }

    // --- Send to WP STAGING ---
    try {
      const res = await http.post(WP_STAGING_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': WP_API_KEY
        },
        auth: {
          username: 'fpmpuvheeq',
          password: 'ENPK9JE57j'
        }
      });
      console.log('[POST -> WP STAGING] Response:', res.data);
    } catch (err) {
      console.error('[POST -> WP STAGING] Error sending:', err.message, err.response?.data);
    }

    // --- Send to HS PROD ---
    try {
      console.log('[POST -> HS PROD] Payload:', payload);
      const res = await http.post(WP_PROD_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': WP_API_KEY
        }
      });
      console.log('[POST -> HS PROD] Response:', res.data);
    } catch (err) {
      console.error('[POST -> HS PROD] Error sending:', err.message, err.response?.data);
    }

    // --- Send to RR DEV ---
    try {
      const res = await http.post(RR_DEV_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': WP_API_KEY
        }
      });
      console.log('[POST -> RR DEV] Response:', res.data);
    } catch (err) {
      console.error('[POST -> RR DEV] Error sending:', err.message, err.response?.data);
    }

    // --- Send to PICKEM---
    try {
      const pickemPayload = {
        ...payload,
        external_id: Number(payload.external_id),
        status: typeof payload.status === 'string' ? payload.status.toLowerCase() : payload.status
      };

      const res = await http.post(PICKEM_URL, pickemPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': PICKEM_API_KEY
        }
      });

      console.log('[POST -> PICKEM] Response:', res.data);
    } catch (err) {
      console.error('[POST -> PICKEM] Error sending:', err.message, {
        status: err.response?.status,
        data: err.response?.data
      });
    }

    // --- Send to PICKEM STAGING ---
    try {
      const pickemPayload = {
        ...payload,
        external_id: Number(payload.external_id),
        status: typeof payload.status === 'string' ? payload.status.toLowerCase() : payload.status
      };

      const res = await http.post(PICKEM_STAGING_URL, pickemPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': PICKEM_API_KEY
        }
      });

      console.log('[POST -> PICKEM STAGING] Response:', res.data);
    } catch (err) {
      console.error('[POST -> PICKEM STAGING] Error sending:', err.message, {
        status: err.response?.status,
        data: err.response?.data
      });
    }
  }

  // --- Detect end of the match ---
  if (message.type === 'fixture_ended') {
    const fixtureId = message.payload.fixtureId;

    console.log('[WebSocket] fixture_ended event detected:', { fixtureId });

    const payload = {
      external_id: fixtureId,
      status: 'Ended',
      end_time: resolveFixtureEndTime(message.payload, () =>
        console.warn('[fixture_ended] payload.timestamp missing, falling back to Date.now()', { fixtureId })
      )
    };

    console.log('[fixture_ended] Payload to send:', payload);

    // fixture_ended already carries the final score (payload.participants).
    // Sending it together with the status lets Pick'ems settle on the right
    // score even if the last score_changed hasn't reached it yet. Falls back
    // to the last score_changed seen for this fixture.
    const finalPickemScores = buildPickemScores(message.payload.participants) ?? context.lastPickemScores ?? null;
    if (!finalPickemScores) {
      console.warn('[fixture_ended] No final score available for Pick\'ems, sending status only', { fixtureId });
    }
    context.finalPickemScores = finalPickemScores;
    // Match is over: don't reconnect if the socket drops before GSK's own
    // 'ended' system message arrives.
    context.ended = true;

    // --- Send to DB ---

    try {
      const res = await updateFixtureFields( 'cs2' , payload)
      console.log('[UPDATE ON DB] Response:', res);
    } catch (err) {
      console.error('[UPDATE ON DB] Error sending:', err.message);
    }

    // --- Send to WP DEV ---
    try {
      const res = await http.post(WP_DEV_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': WP_API_KEY
        }
      });
      console.log('[POST -> WP DEV] Response:', res.data);
    } catch (err) {
      console.error('[POST -> WP DEV] Error sending:', err.message, err.response?.data);
    }

    // --- Send to WP STAGING ---
    try {
      const res = await http.post(WP_STAGING_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': WP_API_KEY
        },
        auth: {
          username: 'fpmpuvheeq',
          password: 'ENPK9JE57j'
        }
      });
      console.log('[POST -> WP STAGING] Response:', res.data);
    } catch (err) {
      console.error('[POST -> WP STAGING] Error sending:', err.message, err.response?.data);
    }

    // --- Send to HS PROD ---
    try {
      console.log('[POST -> HS PROD] Payload:', payload);
      const res = await http.post(WP_PROD_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': WP_API_KEY
        }
      });
      console.log('[POST -> HS PROD] Response:', res.data);
    } catch (err) {
      console.error('[POST -> HS PROD] Error sending:', err.message, err.response?.data);
    }

    // --- Send to RR DEV ---
    try {
      const res = await http.post(RR_DEV_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': WP_API_KEY
        }
      });
      console.log('[POST -> RR DEV] Response:', res.data);
    } catch (err) {
      console.error('[POST -> RR DEV] Error sending:', err.message, err.response?.data);
    }

    // --- Send to PICKEM ---
    try {
      const pickemPayload = {
        ...payload,
        ...finalPickemScores,
        external_id: Number(payload.external_id),
        status: typeof payload.status === 'string' ? payload.status.toLowerCase() : payload.status
      };
      delete pickemPayload.end_time;

      const res = await http.post(PICKEM_URL, pickemPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': PICKEM_API_KEY
        }
      });

      console.log('[POST -> PICKEM] Response:', res.data);
    } catch (err) {
      console.error('[POST -> PICKEM] Error sending:', err.message, {
        status: err.response?.status,
        data: err.response?.data
      });
    }

    // --- Send to PICKEM STAGING ---
    try {
      const pickemPayload = {
        ...payload,
        ...finalPickemScores,
        external_id: Number(payload.external_id),
        status: typeof payload.status === 'string' ? payload.status.toLowerCase() : payload.status
      };
      delete pickemPayload.end_time;

      const res = await http.post(PICKEM_STAGING_URL, pickemPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': PICKEM_API_KEY
        }
      });

      console.log('[POST -> PICKEM STAGING] Response:', res.data);
    } catch (err) {
      console.error('[POST -> PICKEM STAGING] Error sending:', err.message, {
        status: err.response?.status,
        data: err.response?.data
      });
    }
  }



  // --- Detect score_changed ---
  if (message.type === 'score_changed') {
    const fixtureId = message.payload.fixtureId;
    const scores = message.payload.scores;

    console.log('[WebSocket] score_changed event detected:', { fixtureId, scores });

    const payload = {
      external_id: fixtureId,
      participants0_id: scores[0]?.id || null,
      participants0_score: scores[0]?.score ?? null,
      participants1_id: scores[1]?.id || null,
      participants1_score: scores[1]?.score ?? null
    };

    console.log('[score_changed] Payload to send:', payload);

    const pickemScores = buildPickemScores(scores);
    if (pickemScores) context.lastPickemScores = pickemScores;

    // --- Send to DB ---

    try {
      const res = await updateFixtureFields( 'cs2' , payload)
      console.log('[UPDATE ON DB] Response:', res);
    } catch (err) {
      console.error('[UPDATE ON DB] Error sending:', err.message);
    }

    // --- Send to WP DEV ---
    try {
      const res = await http.post(WP_DEV_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': WP_API_KEY
        }
      });

      console.log('[POST -> WP DEV] Response:', res.data);
    } catch (err) {
      console.error('[POST -> WP DEV] Error sending:', err.message, err.response?.data);
    }

    // --- Send to WP STAGING ---
    try {
      const res = await http.post(WP_STAGING_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': WP_API_KEY
        },
        auth: {
          username: 'fpmpuvheeq',
          password: 'ENPK9JE57j'
        }
      });

      console.log('[POST -> WP STAGING] Response:', res.data);
    } catch (err) {
      console.error('[POST -> WP STAGING] Error sending:', err.message, err.response?.data);
    }

    // --- Send to HS PROD ---

    try {
      console.log('[POST -> HS PROD] Payload:', payload);
      const res = await http.post(WP_PROD_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': WP_API_KEY
        }
      });

      console.log('[POST -> HS PROD] Response:', res.data);
    } catch (err) {
      console.error('[POST -> HS PROD] Error sending:', err.message, err.response?.data);
    }

    // --- Send to RR DEV ---
    try {
      const res = await http.post(RR_DEV_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': WP_API_KEY
        }
      });

      console.log('[POST -> RR DEV] Response:', res.data);
    } catch (err) {
      console.error('[POST -> RR DEV] Error sending:', err.message, err.response?.data);
    }

    // After fixture_ended, a score that disagrees with the final one is stale
    // (late or replayed event); forwarding it would make Pick'ems re-settle
    // on the wrong score.
    if (context.finalPickemScores && !(pickemScores && sameScores(pickemScores, context.finalPickemScores))) {
      console.warn('[score_changed] Skipping Pick\'ems: fixture already ended with a different score', {
        fixtureId, scores, final: context.finalPickemScores
      });
      return;
    }

    // --- Send to PICKEM ---
    try {
      const pickemPayload = {
        external_id: Number(fixtureId),
        participants0_id: toIntOrNull(scores[0]?.id),
        participants0_score: scores[0]?.score ?? null,
        participants1_id: toIntOrNull(scores[1]?.id),
        participants1_score: scores[1]?.score ?? null
      };

      const res = await http.post(PICKEM_URL, pickemPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': PICKEM_API_KEY
        }
      });

      console.log('[POST -> PICKEM] Response:', res.data);
    } catch (err) {
      console.error('[POST -> PICKEM] Error sending:', err.message, {
        status: err.response?.status,
        data: err.response?.data
      });
    }

    // --- Send to PICKEM STAGING ---
    try {
      const pickemPayload = {
        external_id: Number(fixtureId),
        participants0_id: toIntOrNull(scores[0]?.id),
        participants0_score: scores[0]?.score ?? null,
        participants1_id: toIntOrNull(scores[1]?.id),
        participants1_score: scores[1]?.score ?? null
      };

      const res = await http.post(PICKEM_STAGING_URL, pickemPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': PICKEM_API_KEY
        }
      });

      console.log('[POST -> PICKEM STAGING] Response:', res.data);
    } catch (err) {
      console.error('[POST -> PICKEM STAGING] Error sending:', err.message, {
        status: err.response?.status,
        data: err.response?.data
      });
    }
  }
}

// GSK's WebSocket drops connections often (invalid close frames on their
// end) and never replays missed events on reconnect. Reusing the same
// context object across reconnects (instead of starting from a blank one)
// keeps the last-known mapId/roundId valid for whatever's left of the
// current round, instead of losing everything until the next map_started/
// round_started. There's no REST endpoint that exposes the in-progress
// map/round to resync from — GET /fixtures/:id only reports maps once
// fully verified/completed.
export function connectWebSocket(fixture_id, existingContext = null) {
  const context = existingContext || {
    fixtureId: fixture_id,
    mapId: null,
    mapNumber: null,
    mapName: null,
    roundId: null,
    roundNumber: null,
    ended: false, // 🔹 flag to know if it has already finished
    reconnectAttempts: 0
  };

  const WS_URL = `wss://api.gamescorekeeper.com/v2/live/${fixture_id}`;
  const ws = new WebSocket(WS_URL, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`
    }
  });

  let pingInterval;

  ws.on('open', () => {
    console.log(`[WebSocket] Connected to fixture ${context.fixtureId}`);
    context.reconnectAttempts = 0;

    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);

      if (FIXTURE_EVENT_TYPES.has(message.type)) {
        await enqueueForFixture(context, () => handleFixtureEvent(message, context));
      }

      // --- Dispatch to kills/assists/maps/rounds/equipment_state derivation ---
      // handleLiveEvent also maintains context.mapNumber/mapId/roundNumber/roundId
      // as map_started/round_started events come in. Queued because on connect
      // GSK replays the backlog in a burst: without it round 1 reached
      // insertRound while map_started was still awaiting insertMap
      // (context.mapId still null) and was dropped. Separate from the fixture
      // queue so WP/Pick'ems HTTP calls don't hold up DB inserts.
      await enqueueForFixture(context, () => handleLiveEvent(message, context), 'liveQueue');

      // --- System events ---
      if (message.type === 'auth') {
        ws.send(JSON.stringify({ token: TOKEN }));
      } else if (message.type === 'pong') {
        console.log('[WebSocket] Pong received');
      } else if (message.type === 'ended') {
        console.log(`[WebSocket] Fixture ${context.fixtureId} finished`);
        context.ended = true;
        ws.close(1000, 'Fixture finished'); // 🔹 clean closure
      }

    } catch (error) {
      console.error('[WebSocket] Error processing message:', error.message);
    }
  });

  ws.on('error', (error) => {
    console.error(`[WebSocket] Connection error (${context.fixtureId}):`, error.message);
  });

  ws.on('close', (code, reason) => {
    clearInterval(pingInterval);
    console.warn(`[WebSocket] Connection closed for fixture ${context.fixtureId}. Code: ${code}, Reason: ${reason}`);

    // 🔹 Do not reconnect if the fixture is finished
    if (context.ended) {
      console.log(`[WebSocket] Fixture ${context.fixtureId} has already finished, it will not be retried.`);
      return;
    }

    // 🔹 Normal closure → do not reconnect
    if (code === 1000) {
      console.log(`[WebSocket] Connection closed normally (${context.fixtureId}), it will not be retried.`);
      context.reconnectAttempts = 0;
      return;
    }

    // 🔹 Abnormal errors → limit attempts
    context.reconnectAttempts++;
    if (context.reconnectAttempts > 5) {
      console.error(`[WebSocket] Too many failed attempts (${context.fixtureId}), stopping reconnections.`);
      return;
    }

    const timeout = Math.min(30000, 5000 * context.reconnectAttempts);
    console.log(`[WebSocket] Retrying connection in ${timeout}ms (Attempt ${context.reconnectAttempts})`);
    setTimeout(() => connectWebSocket(fixture_id, context), timeout);
  });
}

// Start the test connection
// connectWebSocket();
