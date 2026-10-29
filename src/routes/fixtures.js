//src/routes/fixtures.js

import express from 'express';
import {
    getFixturesCS2,
    getFixtureByIdCS2,
    getFixturesLOL,
    getFixtureByIdLOL,
    getFixturesDOTA2,
    getFixtureByIdDOTA2,
    getPredictionsBulk
} from '../controllers/fixture/fixtureController.js';

const router = express.Router();

// Bulk Oracle predictions lookup: /api/fixtures/predictions?ids=1,2,3
router.get('/predictions', getPredictionsBulk);

// CS2 routes (aceptan filtros por query: id, competition_id, status, start_time, end_time, scheduled_start_time)
router.get('/cs2', getFixturesCS2);
router.get('/cs2/:id', getFixtureByIdCS2);

// LOL routes
router.get('/lol', getFixturesLOL);
router.get('/lol/:id', getFixtureByIdLOL);

// DOTA2 routes
router.get('/dota2', getFixturesDOTA2);
router.get('/dota2/:id', getFixtureByIdDOTA2);

export default router;