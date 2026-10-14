import { dbCS2, dbLOL } from '../db.js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_BASE_URL = "https://api.gamescorekeeper.com/v1/";
const AUTH_TOKEN = `Bearer ${process.env.GAME_SCORE_APIKEY}`;

// Helper to get the correct DB pool based on sport
function getDbBySport(sport = 'cs2') {
  if (sport === 'lol') return dbLOL;
  return dbCS2;
}

export async function getMatchMapResults(fixtureId, sport = 'cs2') {
  const db = getDbBySport(sport);

  // 1. Obtener pick/ban de API (opcional: sin pick/ban, pick_team_id queda null)
  // Timeout corto: WordPress corta esta llamada a los 3s.
  let pickBanList = [];
  try {
    const pickRes = await axios.get(`${API_BASE_URL}pickban/${fixtureId}/maps`, {
      headers: { Authorization: AUTH_TOKEN },
      timeout: 2000
    });
    pickBanList = pickRes.data?.pickBan || [];
  } catch (err) {
    if (err.response?.status !== 404) {
      console.error(`[ERROR] Pick/Ban for fixture ${fixtureId}:`, err.message);
    }
  }

  // Diccionario de picks por map_name (formato de_*)
  const pickMap = {};
  for (const item of pickBanList) {
    if (item.pickOrBan.toLowerCase() === 'pick') {
      const normalized = 'de_' + item.mapName.toLowerCase();
      pickMap[normalized] = item.teamId;
    }
  }

  // 2. Obtener rondas ganadas
  const [rounds] = await db.query(`
    SELECT 
      map_number, 
      winner_team_id, 
      COUNT(*) AS rounds_won
    FROM cs_match_events
    WHERE fixture_id = ?
      AND name = 'round_ended'
      AND winner_team_id IS NOT NULL
    GROUP BY map_number, winner_team_id
    ORDER BY map_number ASC
  `, [fixtureId]);

  // 3. Obtener nombres de mapas
  const [maps] = await db.query(`
    SELECT DISTINCT map_number, map_name
    FROM cs_match_events
    WHERE fixture_id = ?
      AND map_name IS NOT NULL
  `, [fixtureId]);

  // Convertimos lista de mapas a diccionario por map_number
  const mapNameByNumber = {};
  for (const row of maps) {
    if (!mapNameByNumber[row.map_number]) {
      mapNameByNumber[row.map_number] = row.map_name;
    }
  }

  // 4. Procesar resultados
  const mapResults = {};

  for (const row of rounds) {
    const { map_number, winner_team_id, rounds_won } = row;
    const map_name = mapNameByNumber[map_number] ?? null;

    if (!mapResults[map_number]) {
      mapResults[map_number] = {
        map_number,
        map_name,
        pick_team_id: pickMap[map_name] ?? null,
        team_0: { id: null, score: 0 },
        team_1: { id: null, score: 0 },
        team_ids: []
      };
    }

    const entry = mapResults[map_number];

    if (!entry.team_0.id) {
      entry.team_0.id = winner_team_id;
      entry.team_0.score = rounds_won;
      entry.team_ids.push(winner_team_id);
    } else if (entry.team_0.id === winner_team_id) {
      entry.team_0.score = rounds_won;
    } else {
      entry.team_1.id = winner_team_id;
      entry.team_1.score = rounds_won;
      entry.team_ids.push(winner_team_id);
    }
  }

  // 5. Formato final
  return Object.values(mapResults).map(({ team_ids, ...rest }) => rest);
}
