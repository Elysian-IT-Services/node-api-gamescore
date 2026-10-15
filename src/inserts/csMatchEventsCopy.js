// node-api-gamescore/src/inserts/csMatchEventsCopy.js

import mysql from 'mysql2/promise';
import axios from 'axios';
import dotenv from 'dotenv';
import { dbCS2, dbLOL } from '../db.js'; // Import all DB connections
import { saveOrUpdateMapBreakdown } from '../middleware/saveOrUpdateMapBreakdown.js';

dotenv.config();

// 🔐 API Configuration
const API_BASE_URL = "https://api.gamescorekeeper.com/v2/live/historic/";
const AUTH_TOKEN = `Bearer ${process.env.GAME_SCORE_APIKEY}`;

// Helper to select DB by sport
function getDbBySport(sport = 'cs2') {
  if (sport === 'lol') return dbLOL;
  return dbCS2;
}

// 🧠 Pass values through as-is; missing values become NULL (never a placeholder like
// "TBD", 0 or a far-future timestamp, which would be indistinguishable from real data)
function normalize(value) {
  return value === null || value === undefined ? null : value;
}

// 🧠 Extract and normalize event fields
function extractEventData(payload, fixtureId, event) {
  const name = payload.name ?? null;
  const actor = payload.killer ?? payload.planter ?? payload.assister ?? payload.defuser ?? null;

  return {
    fixture_id: normalize(fixtureId),
    snapshot_number: normalize(payload.snapshotNumber),
    sort_index: normalize(event.sortIndex),
    event_type: normalize(event.type),
    name: normalize(name),
    map_name: normalize(payload.mapName),
    map_number: normalize(payload.mapNumber),
    half_number: normalize(payload.halfNumber),
    round_number: normalize(payload.roundNumber),
    event_timestamp: normalize(payload.timestamp),

    actor_id: normalize(actor?.id),
    actor_name: normalize(actor?.name),
    actor_team_id: normalize(actor?.teamId),
    actor_side: normalize(actor?.side),

    victim_id: normalize(payload.victim?.id),
    victim_name: normalize(payload.victim?.name),
    victim_team_id: normalize(payload.victim?.teamId),
    victim_side: normalize(payload.victim?.side),

    weapon: normalize(payload.weapon),
    kill_id: normalize(payload.killId),
    headshot: normalize(payload.headshot),
    penetrated: normalize(payload.penetrated),
    no_scope: normalize(payload.noScope),
    through_smoke: normalize(payload.throughSmoke),
    while_blinded: normalize(payload.whileBlinded),

    winner_team_id: normalize(payload.winnerId)
  };
}

export async function processCsMatchEvents(sport = 'cs2') {
  const db = getDbBySport(sport); // <-- Use the correct DB connection

  // Ended fixtures from the last 7 days with no events yet. Selecting by
  // start_time alone missed every fixture whose start_time was never set
  // (the live feed only stored status/end_time), so they were never copied.
  // Only ended ones: a copy taken mid-match would stay partial forever,
  // since fixtures with any events are skipped below.
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;

  try {
    console.log(`🕒 Searching for ended fixtures since ${since}...`);

    const [fixtures] = await db.query(
      `SELECT id, competition_id, participants0_id, participants1_id FROM fixtures
       WHERE status = 'ended'
       AND (end_time >= ? OR start_time >= ?)
       AND NOT EXISTS (
        SELECT
        1
        FROM cs_match_events
        WHERE
        cs_match_events.fixture_id = fixtures.id
       )`,
      [since, since]
    );

    console.log(`🔍 Found ${fixtures.length} fixtures for ${sport}.`);

    let processedFixtures = 0;

    for (const fixture of fixtures) {
      const fixtureId = fixture.id;
      console.log(`🧩 Processing fixture ID: ${fixtureId}`);

      const [existing] = await db.query(
        "SELECT COUNT(*) AS total FROM cs_match_events WHERE fixture_id = ?",
        [fixtureId]
      );

      if (existing[0].total > 0) {
        console.log(`⏭️  Info already exists for fixture ${fixtureId}. Skipping.`);
        continue;
      }

      try {
        const response = await axios.get(`${API_BASE_URL}${fixtureId}`, {
          headers: { Authorization: AUTH_TOKEN }
        });

        const events = response.data.events;

        if (!Array.isArray(events) || events.length === 0) {
          console.warn(`⚠️  Fixture ${fixtureId} has no events.`);
          continue;
        }

        let inserted = 0;

        for (const event of events) {
          const payload = event.payload ?? {};
          const valuesObj = extractEventData(payload, fixtureId, event);
          const insertValues = Object.values(valuesObj);

          if (insertValues.length !== 26) {
            console.error(`❌ Fixture ${fixtureId}: unexpected number of values (${insertValues.length})`);
            continue;
          }

          await db.query(
            `INSERT INTO cs_match_events (
              fixture_id, snapshot_number, sort_index, event_type, name,
              map_name, map_number, half_number, round_number, event_timestamp,
              actor_id, actor_name, actor_team_id, actor_side,
              victim_id, victim_name, victim_team_id, victim_side,
              weapon, kill_id, headshot, penetrated, no_scope,
              through_smoke, while_blinded, winner_team_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            insertValues
          );

          inserted++;
        }

        console.log(`✅ Fixture ${fixtureId} inserted with ${inserted} events.`);
        processedFixtures++;

        // Refresh both teams' map breakdown now instead of waiting for the
        // nightly RUN-ALL-ACTIVE-UPDATES, so it includes this fixture right away.
        if (inserted > 0 && fixture.competition_id) {
          for (const teamId of [fixture.participants0_id, fixture.participants1_id]) {
            if (teamId) await saveOrUpdateMapBreakdown(teamId, fixture.competition_id, sport);
          }
        }
      } catch (apiErr) {
        console.error(`❌ Error getting events for fixture ${fixtureId}:`, apiErr.response?.data || apiErr.message);
      }
    }

    console.log(`🎯 Process finished for ${sport}. Processed fixtures: ${processedFixtures} of ${fixtures.length}.`);
  } catch (err) {
    console.error(`❌ General error for ${sport}:`, err.message);
  } finally {
    // We don't end the connection here, as the pool is managed globally
    // await db.end();
    // console.log('🔌 Connection closed.');
  }
}

// If called directly from the command line, run the function
if (import.meta.url === `file://${process.argv[1]}`) {
  const sport = process.argv[2] || 'cs2';
  processCsMatchEvents(sport).catch(error => {
    console.error("❌ Error during direct execution:", error.message);
    process.exit(1);
  });
}
