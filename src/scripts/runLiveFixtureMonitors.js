//src/scripts/runLiveFixtureMonitors.js

import dotenv from 'dotenv';
import axios from 'axios';
import { connectWebSocket } from '../live-data-updater.js';

dotenv.config();

const API_KEY = process.env.GAME_SCORE_APIKEY;
const API_URL = process.env.GAME_SCORE_API;

const trackedFixtures = new Set(); // Fixture IDs for which WebSocket has already been opened
const SPORTS_TO_MONITOR = ['cs2']; // Sports to monitor

// Was 15 minutes, which connected the WebSocket up to 15 min after a match
// started (live score lagging that long). One GSK request per poll.
const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes in milliseconds

async function fetchStartedFixturesForSport(sport) {
  // 👉 Recalculate date and URL in each execution
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const API = `${API_URL}/fixtures?status=started&from=${dateStr}&sport=${sport}&to=${dateStr}`;

  try {
    const response = await axios.get(API, {
      headers: {
        Authorization: `Bearer ${API_KEY}`
      }
    });

    const fixtures = response.data.fixtures || [];
    if (fixtures.length > 0) {
      console.log(`[MONITOR] [${sport.toUpperCase()}] [${dateStr}] Started fixtures found: ${fixtures.length}`);
    }

    for (const fixture of fixtures) {
      const fixtureId = fixture.id;

      if (fixtureId && !trackedFixtures.has(fixtureId)) {
        console.log(`[MONITOR] [${sport.toUpperCase()}] Started fixture detected: ${fixtureId} - Connecting...`);
        connectWebSocket(fixtureId);
        trackedFixtures.add(fixtureId);
      } else if (!fixtureId) {
        console.warn(`[MONITOR] [${sport.toUpperCase()}] Found a fixture with an undefined ID.`);
      }
    }
  } catch (error) {
    console.error(`[MONITOR] [${sport.toUpperCase()}] Error getting fixtures:`, error.message);
  }
}

function pollAllSports() {
    console.log('[MONITOR] Fetching started fixtures for all sports...');
    for (const sport of SPORTS_TO_MONITOR) {
        fetchStartedFixturesForSport(sport);
    }
}

// 🚀 First immediate execution
pollAllSports();

// ⏱️ Then every POLL_INTERVAL
setInterval(pollAllSports, POLL_INTERVAL);

console.log(`[MONITOR] Fixture monitoring started for: ${SPORTS_TO_MONITOR.join(', ')}...`);
