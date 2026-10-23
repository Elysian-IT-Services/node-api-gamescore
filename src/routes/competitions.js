//src/routes/competitions.js

import express from 'express';
import { fetchFromApi } from '../controllers/apiController.js';
import {
  getCompetitionsCS2,
  getCompetitionConflictsCS2,
  getCompetitionByIdCS2,
  getCompetitionsLOL,
  getCompetitionConflictsLOL,
  getCompetitionByIdLOL,
  getCompetitionsDOTA2,
  getCompetitionConflictsDOTA2,
  getCompetitionByIdDOTA2
} from '../controllers/competitionsController.js';

const router = express.Router();

// CS2 routes
router.get('/cs2', getCompetitionsCS2);
router.get('/cs2/conflicts', getCompetitionConflictsCS2);
router.get('/cs2/:id', getCompetitionByIdCS2);

// LOL routes
router.get('/lol', getCompetitionsLOL);
router.get('/lol/conflicts', getCompetitionConflictsLOL);
router.get('/lol/:id', getCompetitionByIdLOL);

// DOTA2 routes
router.get('/dota2', getCompetitionsDOTA2);
router.get('/dota2/conflicts', getCompetitionConflictsDOTA2);
router.get('/dota2/:id', getCompetitionByIdDOTA2);

// Obtener participantes de una competición
router.get('/:id/participants', async (req, res) => {
    const { id } = req.params;
    console.log("🔍 Petición recibida en /competitions/:id/participants con ID:", id);
    const data = await fetchFromApi(`competitions/${id}/participants`);
    console.log("📩 Respuesta de la API en /competitions/:id/participants:", data);
    res.json(data);
});

// Obtener stages de una competición
router.get('/:id/stages', async (req, res) => {
    const { id } = req.params;
    console.log("🔍 Petición recibida en /competitions/:id/stages con ID:", id);
    const data = await fetchFromApi(`competitions/${id}/stages`);
    console.log("📩 Respuesta de la API en /competitions/:id/stages:", data);
    res.json(data);
});

// Obtener participantes de un stage
router.get('/stage/:id/participants', async (req, res) => {
    const { id } = req.params;
    console.log("🔍 Petición recibida en /competitions/stage/:id/participants con ID:", id);
    const data = await fetchFromApi(`competitions/stage/${id}/participants`);
    console.log("📩 Respuesta de la API en /competitions/stage/:id/participants:", data);
    res.json(data);
});

// Obtener fixtures de un stage
router.get('/stage/:id/stagefixtures', async (req, res) => {
    const { id } = req.params;
    console.log("🔍 Petición recibida en /competitions/stage/:id/stagefixtures con ID:", id);
    const data = await fetchFromApi(`competitions/stage/${id}/stagefixtures`);
    console.log("📩 Respuesta de la API en /competitions/stage/:id/stagefixtures:", data);
    res.json(data);
});

export default router;
