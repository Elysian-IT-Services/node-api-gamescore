// src/scripts/seedTestPredictionFixtures.js
//
// Dev/test-only helper: inserts two real fixture ids known to have an
// approved Oracle prediction (1066344, 1080177 — see ticket 869fa9vzu) into
// the local `fixtures` table, so oraclePredictionService.js has something
// to match against when testing locally. Not meant for production — these
// rows are minimal stubs, not full GSK data.

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_CS2_HOST,
  user: process.env.DB_CS2_USER,
  password: process.env.DB_CS2_PASSWORD,
  database: process.env.DB_CS2_NAME,
  port: process.env.DB_CS2_PORT || 3306,
};

const TEST_FIXTURES = [
  [1066344, 36071, 'cs2', 'Falcons', 'G2 Esports', 'Scheduled'],
  [1080177, 35859, 'cs2', 'Falcons', 'Ninjas in Pyjamas', 'Scheduled'],
];

async function main() {
  const pool = mysql.createPool(dbConfig);
  try {
    await pool.query(
      `INSERT INTO fixtures (id, competition_id, sport_alias, participants0_name, participants1_name, status)
       VALUES ?
       ON DUPLICATE KEY UPDATE
         competition_id = VALUES(competition_id),
         participants0_name = VALUES(participants0_name),
         participants1_name = VALUES(participants1_name),
         status = VALUES(status)`,
      [TEST_FIXTURES]
    );
    console.log(`[ok] seeded/updated ${TEST_FIXTURES.length} test fixtures: ${TEST_FIXTURES.map((f) => f[0]).join(', ')}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('seedTestPredictionFixtures failed:', err.message);
  process.exit(1);
});
