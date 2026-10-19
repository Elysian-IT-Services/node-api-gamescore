//src/inserts/insertCompetitions.js
import mysql from 'mysql2/promise';
import axios from 'axios';
import dotenv from 'dotenv';
import { parentPort, workerData } from 'worker_threads';

dotenv.config();

const SUPPORTED_SPORTS = ['cs2', 'lol', 'dota2'];

const dbConfigs = {
  cs2: {
    host: process.env.DB_CS2_HOST,
    user: process.env.DB_CS2_USER,
    password: process.env.DB_CS2_PASSWORD,
    database: process.env.DB_CS2_NAME,
    port: process.env.DB_CS2_PORT || 3306
  },
  lol: {
    host: process.env.DB_LOL_HOST,
    user: process.env.DB_LOL_USER,
    password: process.env.DB_LOL_PASSWORD,
    database: process.env.DB_LOL_NAME,
    port: process.env.DB_LOL_PORT || 3306
  },
  dota2: {
    host: process.env.DB_DOTA2_HOST,
    user: process.env.DB_DOTA2_USER,
    password: process.env.DB_DOTA2_PASSWORD,
    database: process.env.DB_DOTA2_NAME,
    port: process.env.DB_DOTA2_PORT || 3306
  }
};

const API_URL = `${process.env.GAME_SCORE_API}/competitions`;
const AUTH_TOKEN = `Bearer ${process.env.GAME_SCORE_APIKEY}`;

const COMPETITIONS_TABLE = 'competitions';

/* ----------------------------- helpers ----------------------------- */

function resolveDateRange(fromDate, toDate) {
  if (fromDate && toDate) {
    return { fromDate, toDate };
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12

  // Default: full current year (YYYY-01-01 -> YYYY-12-31)
  // If current date is between Nov 1 and Dec 31 (month >= 11),
  // extend end date to next year's 12-31 (YYYY-01-01 -> YYYY+1-12-31)
  const startDate = `${year}-01-01`;
  const endYear = month >= 11 ? year + 1 : year;
  const endDate = `${endYear}-12-31`;

  return { fromDate: startDate, toDate: endDate };
}

const safeText = (value) =>
  value && String(value).trim().length > 0
    ? value
    : 'Waiting for information';

/* ----------------------------- API ----------------------------- */

async function fetchCompetitions(sport, fromDate = null, toDate = null) {
  const { fromDate: from, toDate: to } = resolveDateRange(fromDate, toDate);

  console.log(`🗓️ Fetching competitions for '${sport}' from ${from} to ${to}`);

  try {
    const response = await axios.get(
      `${API_URL}?sport=${sport}&from=${from}&to=${to}`,
      { headers: { Authorization: AUTH_TOKEN } }
    );

    const competitions = response.data?.competitions || [];
    console.log(`✅ Total fetched for '${sport}': ${competitions.length}`);

    return competitions;
  } catch (error) {
    if (error.response) {
      console.error(
        `❌ fetchCompetitions failed [${error.response.status}]:`,
        error.response.data
      );
    } else {
      console.error('❌ fetchCompetitions failed:', error.message);
    }
    return [];
  }
}

/* ----------------------------- DB ----------------------------- */

async function saveCompetitionsToDB(competitions, sport) {
  const dbConfig = dbConfigs[sport];
  if (!dbConfig) {
    throw new Error(`No DB config found for sport: ${sport}`);
  }

  const pool = mysql.createPool(dbConfig);

  const insertCompetitionsQuery = `
    INSERT INTO ${COMPETITIONS_TABLE} (
      id,
      name,
      sport_alias,
      start_date,
      end_date,
      prize_pool_usd,
      location,
      organizer,
      type,
      fixture_count,
      stage,
      time_of_year,
      year,
      series,
      season,
      tier,
      hs_description,
      rr_description,
      stage_type,
      number,
      region
    ) VALUES ?
    ON DUPLICATE KEY UPDATE
      name = IF(manual_override = 0, VALUES(name), name),
      sport_alias = IF(manual_override = 0, VALUES(sport_alias), sport_alias),
      start_date = IF(manual_override = 0, VALUES(start_date), start_date),
      end_date = IF(manual_override = 0, VALUES(end_date), end_date),
      prize_pool_usd = IF(manual_override = 0, VALUES(prize_pool_usd), prize_pool_usd),
      location = IF(manual_override = 0, VALUES(location), location),
      organizer = IF(manual_override = 0, VALUES(organizer), organizer),
      type = IF(manual_override = 0, VALUES(type), type),
      fixture_count = IF(manual_override = 0, VALUES(fixture_count), fixture_count),
      stage = IF(manual_override = 0, VALUES(stage), stage),
      time_of_year = IF(manual_override = 0, VALUES(time_of_year), time_of_year),
      year = IF(manual_override = 0, VALUES(year), year),
      series = IF(manual_override = 0, VALUES(series), series),
      season = IF(manual_override = 0, VALUES(season), season),
      tier = IF(manual_override = 0, VALUES(tier), tier),
      hs_description = IF(manual_override = 0, VALUES(hs_description), hs_description),
      rr_description = IF(manual_override = 0, VALUES(rr_description), rr_description),
      stage_type = IF(manual_override = 0, VALUES(stage_type), stage_type),
      number = IF(manual_override = 0, VALUES(number), number),
      region = IF(manual_override = 0, VALUES(region), region);
  `;

  try {
    const competitionValues = competitions.map((comp) => [
      comp.id,
      safeText(comp.name),
      safeText(comp.sportAlias),
      comp.startDate || 9999999999999,
      comp.endDate || 9999999999999,
      comp.prizePoolUSD || 0,
      safeText(comp.location),
      safeText(comp.organizer),
      safeText(comp.type),
      comp.fixtureCount || 0,
      safeText(comp.derivatives?.stage),
      safeText(comp.derivatives?.time_of_year),
      safeText(comp.derivatives?.year),
      safeText(comp.derivatives?.series),
      comp.derivatives?.season || null,
      safeText(comp.metadata?.liquipediaTier),
      safeText(comp.hs_description),
      safeText(comp.rr_description),
      comp.derivatives?.stage_type || null,
      comp.derivatives?.number || null,
      comp.derivatives?.region || null
    ]);

    await pool.query(insertCompetitionsQuery, [competitionValues]);

    console.log(
      `✅ Inserted/updated ${competitionValues.length} competitions in table ${COMPETITIONS_TABLE}`
    );
  } catch (error) {
    console.error('❌ saveCompetitionsToDB failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

/* ----------------------------- public API ----------------------------- */

export async function getAndSaveCompetitions(
  sport,
  fromDate = null,
  toDate = null
) {
  const sportToUse = sport || process.argv[2] || 'cs2';

  if (!SUPPORTED_SPORTS.includes(sportToUse)) {
    throw new Error(`Unsupported sport: ${sportToUse}`);
  }

  console.log(`🔄 getAndSaveCompetitions | ${sportToUse}`);

  const competitions = await fetchCompetitions(
    sportToUse,
    fromDate,
    toDate
  );

  if (competitions.length > 0) {
    await saveCompetitionsToDB(competitions, sportToUse);
    console.log(`✅ All competitions for ${sportToUse} processed.`);
  } else {
    console.log(`⚠️ No competitions found for ${sportToUse}`);
  }
}

/* ----------------------------- entrypoint ----------------------------- */

async function main() {
  let sport, fromDate, toDate;

  if (parentPort) {
    ({ sport, fromDate, toDate } = workerData);
  } else {
    sport = process.argv[2];
    fromDate = process.argv[3];
    toDate = process.argv[4];
  }

  try {
    await getAndSaveCompetitions(sport, fromDate, toDate);
    parentPort?.postMessage?.('Competiciones insertadas exitosamente.');
  } catch (error) {
    const msg = `Failed for ${sport}: ${error.message}`;
    console.error(msg);
    parentPort?.postMessage?.({ error: msg });
    if (!parentPort) process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
