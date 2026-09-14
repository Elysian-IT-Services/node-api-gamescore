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
          const res = await axios.post(WP_DEV_URL, payload, {
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
          const res = await axios.post(WP_STAGING_URL, payload, {
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
          const res = await axios.post(WP_PROD_URL, payload, {
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
          const res = await axios.post(RR_DEV_URL, payload, {
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

          const res = await axios.post(PICKEM_URL, pickemPayload, {
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

          const res = await axios.post(PICKEM_STAGING_URL, pickemPayload, {
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

        // --- Send to DB ---

        try {
          const res = await updateFixtureFields( 'cs2' , payload)
          console.log('[UPDATE ON DB] Response:', res);
        } catch (err) {
          console.error('[UPDATE ON DB] Error sending:', err.message);
        }

        // --- Send to WP DEV ---
        try {
          const res = await axios.post(WP_DEV_URL, payload, {
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
          const res = await axios.post(WP_STAGING_URL, payload, {
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
          const res = await axios.post(WP_PROD_URL, payload, {
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
          const res = await axios.post(RR_DEV_URL, payload, {
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
            external_id: Number(payload.external_id),
            status: typeof payload.status === 'string' ? payload.status.toLowerCase() : payload.status
          };
          delete pickemPayload.end_time;

          const res = await axios.post(PICKEM_URL, pickemPayload, {
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
          delete pickemPayload.end_time;

          const res = await axios.post(PICKEM_STAGING_URL, pickemPayload, {
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

        // --- Send to DB ---

        try {
          const res = await updateFixtureFields( 'cs2' , payload)
          console.log('[UPDATE ON DB] Response:', res);
        } catch (err) {
          console.error('[UPDATE ON DB] Error sending:', err.message);
        }

        // --- Send to WP DEV ---
        try {
          const res = await axios.post(WP_DEV_URL, payload, {
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
          const res = await axios.post(WP_STAGING_URL, payload, {
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
          const res = await axios.post(WP_PROD_URL, payload, {
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
          const res = await axios.post(RR_DEV_URL, payload, {
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
          const toIntOrNull = (v) => {
            if (v === undefined || v === null) return null;
            const n = Number(v);
            return Number.isNaN(n) ? null : n;
          };

          const pickemPayload = {
            external_id: Number(fixtureId),
            participants0_id: toIntOrNull(scores[0]?.id),
            participants0_score: scores[0]?.score ?? null,
            participants1_id: toIntOrNull(scores[1]?.id),
            participants1_score: scores[1]?.score ?? null
          };

          const res = await axios.post(PICKEM_URL, pickemPayload, {
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
          const toIntOrNull = (v) => {
            if (v === undefined || v === null) return null;
            const n = Number(v);
            return Number.isNaN(n) ? null : n;
          };

          const pickemPayload = {
            external_id: Number(fixtureId),
            participants0_id: toIntOrNull(scores[0]?.id),
            participants0_score: scores[0]?.score ?? null,
            participants1_id: toIntOrNull(scores[1]?.id),
            participants1_score: scores[1]?.score ?? null
          };

          const res = await axios.post(PICKEM_STAGING_URL, pickemPayload, {
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

      // --- Dispatch to kills/assists/maps/rounds/equipment_state derivation ---
      // handleLiveEvent also maintains context.mapNumber/mapId/roundNumber/roundId
      // as map_started/round_started events come in.
      await handleLiveEvent(message, context);

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
