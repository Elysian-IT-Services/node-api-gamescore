// src/controllers/fixture/fixtureController.js

import { getFixtures, getFixtureById } from '../../services/fixture/fixtureServices.js';
import { getPredictionsForFixtures } from '../../services/oracle/oraclePredictionService.js';

export const listFixtures = async (req, res) => {
    try {
        const { page } = req.query || {};

        const filters = {
            from: req.query.from,
            to: req.query.to,
            id: req.query.id,
            competition_id: req.query.competition_id || req.query.competitionId,
            status: req.query.status,
            start_time: req.query.start_time,
            end_time: req.query.end_time,
            scheduled_start_time: req.query.scheduled_start_time,
        };

        // allow passing sport via req.params.sport (set by per-game handlers) or ?sport=...
        const sport = req.params && req.params.sport ? req.params.sport : req.query.sport;

        const parsedPage = Number.isFinite(Number(page)) ? parseInt(page, 10) : 1;

        const result = await getFixtures({ page: parsedPage, filters, sport });

        // Oracle predictions (ticket 869fa9vzu) merged in here, same
        // additive, fail-open pattern as oracle_enrichment on competitions —
        // never touches the fixtures table itself.
        const predictions = await getPredictionsForFixtures(result.data);
        const data = result.data.map((row) => ({
            ...row,
            oracle_prediction: predictions[row.id] || null,
        }));

        res.json({ ...result, data });
    } catch (err) {
        console.error('Error en listFixtures:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Bulk Oracle predictions lookup, decoupled from this API's own fixtures
// table — HS's post-sync cron knows the external_ids it just synced (it
// still gets the fixture data itself from GSK directly) and only needs the
// predictions for those, in one round-trip instead of one per fixture.
// Added after prod showed Supabase 429s from HS calling getFixture per
// Tier S fixture with no batching (869fa9vzu follow-up).
export const getPredictionsBulk = async (req, res) => {
    try {
        const idsParam = req.query.ids;
        if (!idsParam) return res.status(400).json({ error: 'ids query param required' });

        const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
        if (!ids.length) return res.status(400).json({ error: 'ids query param required' });

        const predictions = await getPredictionsForFixtures(ids.map((id) => ({ id })));
        res.json({ predictions });
    } catch (err) {
        console.error('Error en getPredictionsBulk:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getFixture = async (req, res) => {
    try {
        const { id } = req.params;
        const sport = req.params && req.params.sport ? req.params.sport : req.query.sport;
        const row = await getFixtureById(id, sport);
        if (!row) return res.status(404).json({ error: 'Fixture not found' });

        const predictions = await getPredictionsForFixtures([row]);
        res.json({ ...row, oracle_prediction: predictions[row.id] || null });
    } catch (err) {
        console.error('Error en getFixture:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Endpoints previously proxied to external api: return 501 Not Implemented
export const notImplemented = async (req, res) => {
    res.status(501).json({ error: 'Not implemented on local DB controller' });
};

// Per-game handlers
export const getFixturesCS2 = (req, res) => {
    req.params.sport = 'cs2';
    return listFixtures(req, res);
};

export const getFixtureByIdCS2 = (req, res) => {
    req.params.sport = 'cs2';
    return getFixture(req, res);
};

export const getFixturesLOL = (req, res) => {
    req.params.sport = 'lol';
    return listFixtures(req, res);
};

export const getFixtureByIdLOL = (req, res) => {
    req.params.sport = 'lol';
    return getFixture(req, res);
};

export const getFixturesDOTA2 = (req, res) => {
    req.params.sport = 'dota2';
    return listFixtures(req, res);
};

export const getFixtureByIdDOTA2 = (req, res) => {
    req.params.sport = 'dota2';
    return getFixture(req, res);
};
