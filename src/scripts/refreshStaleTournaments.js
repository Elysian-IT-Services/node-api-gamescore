// src/scripts/refreshStaleTournaments.js
//
// Root-cause fix for 869fa9vhm's prize pool bug: HS only ever writes a
// tournament's tier/prize pool once, when the post is first created, so
// whatever Oracle/GSK knew at that moment sticks forever. This refreshes
// each competition exactly once, shortly after its own start_date, using
// whatever tier/prize pool Oracle currently resolves — then never touches
// it again. Deliberately date-based (not fixture-status-based): GSK's own
// status transitions are tracked by other processes with their own
// cadences (UPDATE-FIXTURES-STATUS is once/day by design, the live
// monitor is CS2-only), neither of which this should piggyback on.

import dotenv from 'dotenv';
import axios from 'axios';
import { getDbBySport } from '../utils/dbUtils.js';
import { getEnrichmentForCompetitions } from '../services/oracle/oracleEnrichmentService.js';

dotenv.config();

const SPORTS = ['cs2', 'lol', 'dota2'];

const WP_API_KEY = process.env.POST_SYNC_API_KEY;
const WP_PROD_TOURNAMENT_URL = process.env.WP_PROD_TOURNAMENT_URL;

const http = axios.create({ timeout: 15000 });

async function getStaleCompetitions(sport) {
  const db = getDbBySport(sport);
  const [rows] = await db.query(
    `SELECT id, tier, prize_pool_usd, end_date
     FROM competitions
     WHERE manual_override = 0
       AND refreshed_on_start = 0
       AND start_date <= ?`,
    [Date.now()]
  );
  return rows;
}

async function markRefreshed(sport, competitionId) {
  const db = getDbBySport(sport);
  await db.query(
    `UPDATE competitions SET refreshed_on_start = 1 WHERE id = ?`,
    [competitionId]
  );
}

async function pushTournamentRefresh(sport, payload) {
  if (!WP_PROD_TOURNAMENT_URL || !WP_API_KEY) {
    throw new Error('WP_PROD_TOURNAMENT_URL or POST_SYNC_API_KEY not configured');
  }

  return http.post(WP_PROD_TOURNAMENT_URL, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': WP_API_KEY
    }
  });
}

async function processSport(sport) {
  const competitions = await getStaleCompetitions(sport);
  if (!competitions.length) {
    console.log(`[${sport.toUpperCase()}] No competitions due for a start-date refresh`);
    return;
  }

  console.log(`[${sport.toUpperCase()}] ${competitions.length} competition(s) due for a start-date refresh`);

  const enrichment = await getEnrichmentForCompetitions(competitions);

  for (const comp of competitions) {
    const resolved = enrichment[comp.id];
    if (!resolved) {
      console.log(`[${sport.toUpperCase()}] ${comp.id}: no Oracle data yet, will retry next run`);
      continue;
    }

    const payload = { id: comp.id, sport_alias: sport };
    if (resolved.tier_resolved) payload.tier = resolved.tier_resolved;
    if (resolved.prize_pool !== null && resolved.prize_pool !== undefined) {
      payload.prize_pool_usd = resolved.prize_pool;
    }

    if (!('tier' in payload) && !('prize_pool_usd' in payload)) {
      console.log(`[${sport.toUpperCase()}] ${comp.id}: nothing resolved to push, will retry next run`);
      continue;
    }

    try {
      await pushTournamentRefresh(sport, payload);
      await markRefreshed(sport, comp.id);
      console.log(`[${sport.toUpperCase()}] ${comp.id}: refreshed`, payload);
    } catch (err) {
      console.error(`[${sport.toUpperCase()}] ${comp.id}: push failed, will retry next run —`, err.message);
    }
  }
}

async function main() {
  for (const sport of SPORTS) {
    try {
      await processSport(sport);
    } catch (err) {
      console.error(`[${sport.toUpperCase()}] General error:`, err.message);
    }
  }
}

main()
  .then(() => {
    console.log('refreshStaleTournaments completed.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('refreshStaleTournaments failed:', err.message);
    process.exit(1);
  });
