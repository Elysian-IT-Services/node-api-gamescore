//src/controllers/competitionsController.js

import * as competitionService from '../services/competition/competitionService.js';
import * as oracleEnrichmentService from '../services/oracle/oracleEnrichmentService.js';

// Generic controller factory to create sport-specific handlers
const createGetCompetitions = (sport) => async (req, res) => {
  try {
    const { page, ...rest } = req.query || {};
    const parsedPage = Number.isFinite(Number(page)) ? parseInt(page, 10) : 1;

    const filters = { ...rest };
    // If customRange was sent as JSON string, try to parse it
    if (filters.customRange && typeof filters.customRange === 'string') {
      try {
        filters.customRange = JSON.parse(filters.customRange);
      } catch (e) {
        // leave as-is if not JSON
      }
    }

    const result = await competitionService.findAll({
      page: parsedPage,
      filters,
      sport
    });

    // Oracle enrichment (ticket 869fa9urd) is merged in here, at the API
    // layer, on top of the existing GSK-backed query above — it never
    // touches the `competitions` table itself. Fails open: if Oracle's
    // Supabase is unreachable, `enrichment` comes back {} and every row
    // just gets oracle_enrichment: null, same as a competition Oracle has
    // no data for at all.
    const enrichment = await oracleEnrichmentService.getEnrichmentForCompetitions(result.data);
    const data = result.data.map((row) => ({
      ...row,
      oracle_enrichment: enrichment[row.id] || null,
    }));

    res.json({ ...result, data });
  } catch (err) {
    console.error(`Error in getCompetitions (${sport}) controller:`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Minimal conflict surfacing (ticket 869fa9vhm, until the Programmatic
// Reconciler exists): lists competitions on this page whose Oracle
// enrichment disagrees with GSK on tier or prize pool, so someone can check
// this periodically instead of the flags sitting unseen inside individual
// competition responses. Same pagination as the regular list endpoint —
// pass ?page= to see further pages; nothing is new here query-wise, it's
// still the GSK-backed query plus the same enrichment merge, just filtered.
const createGetCompetitionConflicts = (sport) => async (req, res) => {
  try {
    const { page, ...rest } = req.query || {};
    const parsedPage = Number.isFinite(Number(page)) ? parseInt(page, 10) : 1;

    const filters = { ...rest };
    if (filters.customRange && typeof filters.customRange === 'string') {
      try {
        filters.customRange = JSON.parse(filters.customRange);
      } catch (e) {
        // leave as-is if not JSON
      }
    }

    const result = await competitionService.findAll({ page: parsedPage, filters, sport });
    const enrichment = await oracleEnrichmentService.getEnrichmentForCompetitions(result.data);

    const conflicts = result.data
      .map((row) => ({ ...row, oracle_enrichment: enrichment[row.id] || null }))
      .filter((row) => row.oracle_enrichment?.tier_conflict || row.oracle_enrichment?.prize_pool_conflict);

    res.json({ data: conflicts, pagination: result.pagination });
  } catch (err) {
    console.error(`Error in getCompetitionConflicts (${sport}) controller:`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const createGetCompetitionById = (sport) => async (req, res) => {
  try {
    const { id } = req.params;
    const row = await competitionService.findById(id, sport);
    if (!row) return res.status(404).json({ error: 'Competition not found' });

    const enrichment = await oracleEnrichmentService.getEnrichmentForCompetitions([row]);
    res.json({ ...row, oracle_enrichment: enrichment[row.id] || null });
  } catch (err) {
    console.error(`Error in getCompetitionById (${sport}) controller:`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// CS2 controllers
export const getCompetitionsCS2 = createGetCompetitions('cs2');
export const getCompetitionConflictsCS2 = createGetCompetitionConflicts('cs2');
export const getCompetitionByIdCS2 = createGetCompetitionById('cs2');

// LOL controllers
export const getCompetitionsLOL = createGetCompetitions('lol');
export const getCompetitionConflictsLOL = createGetCompetitionConflicts('lol');
export const getCompetitionByIdLOL = createGetCompetitionById('lol');

// DOTA2 controllers
export const getCompetitionsDOTA2 = createGetCompetitions('dota2');
export const getCompetitionConflictsDOTA2 = createGetCompetitionConflicts('dota2');
export const getCompetitionByIdDOTA2 = createGetCompetitionById('dota2');
