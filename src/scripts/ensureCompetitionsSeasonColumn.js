import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

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

async function addColumnIfMissing(pool, sql, label) {
  try {
    await pool.query(sql);
    console.log(`[ok] ${label}: column added`);
  } catch (err) {
    if (!err.message.includes('Duplicate column')) {
      throw err;
    }
    console.log(`[skip] ${label}: column already exists`);
  }
}

async function ensureColumns(sport) {
  const dbConfig = dbConfigs[sport];
  if (!dbConfig) throw new Error(`No DB config found for sport: ${sport}`);

  const pool = mysql.createPool(dbConfig);

  try {
    // Nullable, no default — matches stage_type/number/region (the other
    // GSK `derivatives.*` columns added after the original table), not the
    // "Waiting for information" placeholder style of the original
    // createTables.js columns. insertCompetitions.js's INSERT doesn't set
    // this column, so a NOT NULL default would be wrong here.
    await addColumnIfMissing(
      pool,
      `ALTER TABLE competitions ADD COLUMN season VARCHAR(100) NULL DEFAULT NULL`,
      `${sport}.competitions.season`
    );
  } finally {
    await pool.end();
  }
}

async function main() {
  for (const sport of SUPPORTED_SPORTS) {
    try {
      await ensureColumns(sport);
    } catch (err) {
      console.error(`[fail] ${sport}: ${err.message}`);
    }
  }
  console.log('season column check finished for cs2/lol/dota2.');
}

main().catch((err) => {
  console.error('ensureCompetitionsSeasonColumn failed:', err.message);
  process.exit(1);
});
