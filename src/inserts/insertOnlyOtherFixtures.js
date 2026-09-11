// src/inserts/insertOnlyOtherFixtures.js
import axios from 'axios';
import dotenv from 'dotenv';
import { getDbBySport } from '../utils/dbUtils.js';

dotenv.config();

const BASE_API_URL = process.env.GAME_SCORE_API;
const AUTH_TOKEN = `Bearer ${process.env.GAME_SCORE_APIKEY}`;
const PAGE_SIZE = 50;

const safeText = (value) =>
  value && String(value).trim().length > 0
    ? value
    : 'Waiting for information';

/**
 * 🔍 Get competitions that should have fixtures
 */
async function getCompetitionsFromDB(sport) {
  const db = getDbBySport(sport);

  const [rows] = await db.execute(
    `
    SELECT
      id
    FROM competitions
    WHERE fixture_count > 0
      AND sport_alias = ?
      AND start_date IS NOT NULL
      AND YEAR(FROM_UNIXTIME(start_date / 1000)) = YEAR(CURDATE());
    `,

    [sport]
  );

  console.log(`📊 Competitions found: ${rows.length}`);
  return rows.map(row => row.id);
}

/**
 * 🌐 Fetch fixtures (paginated)
 */
async function fetchFixturesByCompetition(competitionId, page) {
  try {
    const response = await axios.get(
      `${BASE_API_URL}/competitions/${competitionId}/fixtures`,
      {
        headers: { Authorization: AUTH_TOKEN },
        params: { page, pageCount: PAGE_SIZE }
      }
    );

    return response.data?.fixtures || [];
  } catch (error) {
    console.error(
      `❌ API error | competition ${competitionId} | page ${page}:`,
      error.message
    );
    return [];
  }
}

/**
 * 💾 Save fixtures
 */
// For cs2, the live pipeline (live-data-updater.js -> insertUpdatesOnLiveFixturesScores.js)
// is the authoritative, near-real-time source for these 4 fields while a match is in
// progress. This batch job only runs every few hours, so if it keeps overwriting them it
// can stomp fresher live data. lol/dota2 have no live pipeline at all, so this job stays
// the sole owner of every field for those two sports — nothing changes for them.
const LIVE_OWNED_FIELDS_BY_SPORT = {
  cs2: new Set(['status', 'end_time', 'participants0_score', 'participants1_score']),
};

async function saveFixturesToDB(fixtures, sport) {
  const db = getDbBySport(sport);
  const processedIds = [];

  const liveOwnedFields = LIVE_OWNED_FIELDS_BY_SPORT[sport] || new Set();
  const updatableColumns = [
    'competition_id',
    'competition_name',
    'end_time',
    'scheduled_start_time',
    'start_time',
    'sport_alias',
    'sport_name',
    'status',
    'tie',
    'winner_id',
    'participants0_id',
    'participants0_name',
    'participants0_score',
    'participants1_id',
    'participants1_name',
    'participants1_score',
    'hs_description',
    'rr_description',
  ].filter((column) => !liveOwnedFields.has(column));

  const query = `
    INSERT INTO fixtures (
      id,
      competition_id,
      competition_name,
      end_time,
      scheduled_start_time,
      start_time,
      sport_alias,
      sport_name,
      status,
      tie,
      winner_id,
      participants0_id,
      participants0_name,
      participants0_score,
      participants1_id,
      participants1_name,
      participants1_score,
      hs_description,
      rr_description
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      ${updatableColumns.map((column) => `${column} = VALUES(${column})`).join(',\n      ')}
  `;

  for (const fixture of fixtures) {
    try {
      await db.execute(query, [
        fixture.id,
        fixture.competition.id,
        fixture.competition.name,
        fixture.endTime,
        fixture.scheduledStartTime,
        fixture.startTime,
        fixture.sport.alias,
        fixture.sport.name,
        fixture.status,
        fixture.tie,
        fixture.winnerId,
        fixture.participants[0]?.id ?? null,
        fixture.participants[0]?.name ?? null,
        fixture.participants[0]?.score ?? null,
        fixture.participants[1]?.id ?? null,
        fixture.participants[1]?.name ?? null,
        fixture.participants[1]?.score ?? null,
        safeText(fixture.hs_description),
        safeText(fixture.rr_description)
      ]);

      processedIds.push(fixture.id);
      console.log(`✅ Fixture saved: ${fixture.id}`);
    } catch (error) {
      // Handle charset errors for competitions with special characters
      if (error.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD') {
        console.log(`⚠️  Skipping fixture ${fixture.id} due to charset issue (competition: ${fixture.competition.name})`);
      } else {
        console.error(`❌ Error saving fixture ${fixture.id}:`, error.message);
        throw error; // Re-throw other errors
      }
    }
  }

  return processedIds;
}

/**
 * 🚀 Main
 */
export async function processFixtures(sport) {
  console.log(`🚀 Processing fixtures for sport: ${sport}`);

  const competitionIds = await getCompetitionsFromDB(sport);
  console.log(`🏆 ${competitionIds.length} competitions found`);

  const allProcessedIds = [];

  for (const competitionId of competitionIds) {
    console.log(`\n🎯 Competition ${competitionId}`);
    let page = 1;

    while (true) {
      console.log(`📄 Fetching page ${page}`);
      const fixtures = await fetchFixturesByCompetition(competitionId, page);

      if (fixtures.length === 0) break;

      const processedIds = await saveFixturesToDB(fixtures, sport);
      allProcessedIds.push(...processedIds);

      if (fixtures.length < PAGE_SIZE) break;
      page++;
    }
  }

  console.log(`\n📊 Total fixtures processed: ${allProcessedIds.length}`);
  return allProcessedIds;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const sport = process.argv[2] || 'cs2';

  processFixtures(sport)
    .then(ids => console.log('🆔 Fixtures processed:', ids))
    .catch(err => {
      console.error('❌ Fatal error:', err.message);
      process.exit(1);
    });
}
