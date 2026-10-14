//src/inserts/insertMapTeamPlayers.js

import dotenv from 'dotenv';
import axios from 'axios';
import { getDbBySport } from '../utils/dbUtils.js';
import {resolveDateRangeToUnix } from '../utils/dateUtils.js';

dotenv.config();

const API_URL = process.env.GAME_SCORE_API;
const AUTH_TOKEN = `Bearer ${process.env.GAME_SCORE_APIKEY}`;

export async function getFixtureIds(
  db,
  fromDate = null,
  toDate = null
) {

  // Without an explicit range: ended fixtures from the last 48h that still have
  // no rows. GSK only publishes post-match maps once the fixture has ended, so a
  // forward-looking date window misses anything ending after the run.
  if (!fromDate || !toDate) {
    const since = Date.now() - 48 * 60 * 60 * 1000;
    const [rows] = await db.query(
      `SELECT id
       FROM fixtures
       WHERE status = 'ended'
         AND end_time >= ?
         AND NOT EXISTS (
           SELECT 1 FROM map_team_round_scores
           WHERE map_team_round_scores.fixture_id = fixtures.id
         )`,
      [since]
    );
    return rows.map(r => r.id);
  }

  const { from, to } = resolveDateRangeToUnix(fromDate, toDate);

  const query = `
    SELECT id
    FROM fixtures
    WHERE (
      start_time BETWEEN ? AND ?
      OR scheduled_start_time BETWEEN ? AND ?
    )
  `;

  const [rows] = await db.query(query, [from, to, from, to]);
  return rows.map(r => r.id);
}

async function fetchMapTeamPlayers(fixtureId) {
  try {
    const response = await axios.get(`${API_URL}/fixtures/${fixtureId}`, {
      headers: { Authorization: AUTH_TOKEN }
    });
    const fixtureData = response.data;

    let pickBanData = { pickBan: [] };
    try {
      const pickBan = await axios.get(`${API_URL}/pickban/${fixtureId}/maps`, {
        headers: { Authorization: AUTH_TOKEN }
      });
      pickBanData = pickBan.data;
    } catch (err) {
      if (err.response?.status === 404) {
        console.warn(`[INFO] Pick/Ban not found for fixture ${fixtureId}, continuing...`);
      } else {
        console.error(`[ERROR] Pick/Ban for fixture ${fixtureId}:`, err.message);
      }
    }

    if (!fixtureData?.maps || !Array.isArray(fixtureData.maps)) {
      console.warn(`[WARN] GSK returned no maps for fixture ${fixtureId} (status: ${fixtureData?.status ?? 'unknown'})`);
      return { teamStatsResult: [], teamRoundScores: [] };
    }

    const pickMap = {};
    for (const item of pickBanData.pickBan || []) {
      if (item.pickOrBan === 'pick' && item.teamId) {
        pickMap[item.mapName.toLowerCase()] = item.teamId;
      }
    }

    const teamStatsResult = [];
    const teamRoundScores = [];

    for (const map of fixtureData.maps) {
      const mapNumber = map.mapNumber;
      const mapName = map.mapName;

      for (const team of map.teamStats || []) {
        const teamId = team.teamId ?? 0;

        for (const player of team.players || []) {
          const kills = player.kills ?? 0;
          const deaths = player.deaths ?? 0;
          const headshots = player.headshots ?? 0;
          const plusMinus = kills - deaths;
          const headshotPercent = kills > 0 ? (headshots / kills) * 100 : 0;

          teamStatsResult.push([
            fixtureId,
            mapNumber,
            mapName,
            teamId,
            player.playerId,
            player.name,
            kills,
            deaths,
            player.assists ?? 0,
            plusMinus,
            player.adr ?? 0,
            headshotPercent,
          ]);
        }
      }

      for (const team of map.roundScores || []) {
        const teamId = team.id ?? 0;
        const roundsWon = team.roundsWon ?? 0;
        const half1 = team.halfScores?.[0] ?? 0;
        const half2 = team.halfScores?.[1] ?? 0;

        const normalizeMapName = name => name.toLowerCase().replace(/^de_/, '');
        const mapKey = normalizeMapName(mapName);
        const pickTeamId = pickMap[mapKey] ?? null;
        const isPick = pickTeamId === teamId;

        teamRoundScores.push([
          fixtureId,
          mapNumber,
          mapName,
          teamId,
          roundsWon,
          half1,
          half2,
          isPick ? 1 : 0
        ]);
      }
    }

    return {
      teamStatsResult,
      teamRoundScores
    };

  } catch (error) {
    console.error(`[ERROR] Fixture ${fixtureId}:`, error.message);
    return { teamStatsResult: [], teamRoundScores: [] };
  }
}

async function insertMapTeamPlayers(db, { teamStatsResult, teamRoundScores }) {
  try {
    if (teamStatsResult.length > 0) {
      const playerQuery = `
        INSERT INTO map_team_players (
          fixture_id, map_number, map_name, team_id, player_id, player_name,
          kills, deaths, assists, plus_minus, adr, headshot_percent
        ) VALUES ?
        ON DUPLICATE KEY UPDATE
          player_name = VALUES(player_name),
          kills = VALUES(kills),
          deaths = VALUES(deaths),
          assists = VALUES(assists),
          plus_minus = VALUES(plus_minus),
          adr = VALUES(adr),
          headshot_percent = VALUES(headshot_percent)
      `;

      await db.query(playerQuery, [teamStatsResult]);
      console.log(`[✓] Inserted ${teamStatsResult.length} records in map_team_players`);
    }

    if (teamRoundScores.length > 0) {
      const roundQuery = `
        INSERT INTO map_team_round_scores (
          fixture_id, map_number, map_name, team_id, rounds_won, half1_score, half2_score, is_pick
        ) VALUES ?
        ON DUPLICATE KEY UPDATE
          rounds_won = VALUES(rounds_won),
          half1_score = VALUES(half1_score),
          half2_score = VALUES(half2_score),
          is_pick = VALUES(is_pick)
      `;

      await db.query(roundQuery, [teamRoundScores]);
      console.log(`[✓] Inserted ${teamRoundScores.length} records in map_team_round_scores`);
    }

  } catch (err) {
    console.error(`[INSERT ERROR]`, err.message);
  }
}

export async function processMapTeamPlayers(
  sport,
  fromDate = null,
  toDate = null
) {
  console.log(`🔄 processMapTeamPlayers | ${sport}`);

  const db = getDbBySport(sport);

  const fixtureIds = await getFixtureIds(
    db,          
    fromDate,
    toDate
  );

  if (!fixtureIds.length) {
    console.log(`⚠️ No fixtures found for ${sport}`);
    return;
  }

  console.log(`Found ${fixtureIds.length} fixtures for ${sport} to process.`);

  for (const fixtureId of fixtureIds) {
    console.log(`Processing fixture ${fixtureId}`);
    const data = await fetchMapTeamPlayers(fixtureId);
    await insertMapTeamPlayers(db, data);
  }

  console.log(`✓ Process finished for ${sport}`);
}


// If run directly, execute with CLI arguments
if (import.meta.url === `file://${process.argv[1]}`) {
  const sportArg = process.argv[2] || 'cs2';
  processMapTeamPlayers(sportArg).catch(err => {
    console.error("Error during direct execution:", err.message);
    process.exit(1);
  });
}
