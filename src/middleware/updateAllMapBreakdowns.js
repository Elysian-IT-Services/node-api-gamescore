import { getDbBySport } from "../utils/dbUtils.js";
import { saveOrUpdateMapBreakdown } from './saveOrUpdateMapBreakdown.js';

// months (optional): only competitions with a fixture in the last N months.
// Without it, every (team, competition) pair ever (~18k on cs2) is recalculated.
async function updateAllMapBreakdowns(sport = "cs2", months = null) {
  const db = getDbBySport(sport);
  const since = months ? Date.now() - months * 30 * 24 * 60 * 60 * 1000 : null;
  const recentFilter = since
    ? `AND competition_id IN (
         SELECT DISTINCT competition_id FROM fixtures
         WHERE COALESCE(end_time, start_time, scheduled_start_time) >= ${Number(since)}
       )`
    : "";

  // 🔍 Get all unique pairs (team, competition)
  const [rows] = await db.execute(`
    SELECT DISTINCT competition_id, participants0_id AS team_id
    FROM fixtures
    WHERE participants0_id IS NOT NULL ${recentFilter}
    UNION
    SELECT DISTINCT competition_id, participants1_id AS team_id
    FROM fixtures
    WHERE participants1_id IS NOT NULL ${recentFilter}
  `);

  console.log(`Found ${rows.length} unique team-tournaments`);

  for (const row of rows) {
    const { team_id, competition_id } = row;

    try {
      console.log(`➡ Processing team_id=${team_id}, competition_id=${competition_id}`);
      await saveOrUpdateMapBreakdown(team_id, competition_id, sport);
    } catch (err) {
      console.error(`❌ Error with team_id=${team_id}, competition_id=${competition_id}`, err.message);
    }
  }

  console.log(`✅ Update finished for ${sport}`);
}

// Execute with sport and optional months (example: node updateAllMapBreakdowns.js cs2 12)
const sport = process.argv[2] || "cs2";
const months = process.argv[3] ? parseInt(process.argv[3], 10) : null;
updateAllMapBreakdowns(sport, Number.isNaN(months) ? null : months)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Global error:', err);
    process.exit(1);
  });