// src/services/oracle/oraclePredictionService.js
//
// Merges Oracle's fixture-level predictions into this API's own GSK-backed
// /fixtures response. See ticket 869fa9vzu.
//
// Oracle keeps predictions in its own Supabase, in a table called
// `prediction_draft` — one row per prediction revision, keyed by
// `fixture_id` (the same fixture id GSK and this API both use). A fixture
// can have more than one row over time (confirmed live: 2 of 28 fixtures
// checked while building this had 2 revisions each) — only `status =
// 'approved'` rows are ever considered here, and when more than one
// approved revision exists for the same fixture, the one with the latest
// `as_of` wins.
//
// All the actual prediction work — the weighted-mean model over
// form/event-performance/h2h/rank, the shrinkage toward even, the
// editorial writing — happens entirely on Oracle's side. This module does
// not calculate anything; it selects the right row and reads specific
// fields out of its `payload`, same "trust the upstream, don't
// reinvent it" approach as oracleEnrichmentService.js.

import axios from "axios";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

/**
 * @param {Array<{id: number|string}>} fixtures
 *   Rows already fetched from this repo's own MySQL `fixtures` table.
 * @returns {Promise<Record<string, object>>} predictions keyed by fixture id (string)
 */
export async function getPredictionsForFixtures(fixtures) {
  if (!fixtures?.length) return {};
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("[oraclePrediction] SUPABASE_URL / SUPABASE_KEY not set, skipping predictions");
    return {};
  }

  const ids = fixtures.map((f) => f.id);
  let rows = [];
  try {
    const response = await axios.get(`${SUPABASE_URL}/rest/v1/prediction_draft`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      params: {
        fixture_id: `in.(${ids.join(",")})`,
        status: "eq.approved",
        select: "fixture_id,bracket_position,as_of,payload",
      },
      // Same reasoning as oracleEnrichmentService.js's timeout — fails
      // open, but only if it fails fast (869fa9urd review).
      timeout: 8000,
    });
    rows = Array.isArray(response.data) ? response.data : [];
  } catch (err) {
    console.error(
      "[oraclePrediction] Error querying Oracle Supabase:",
      err?.response?.status,
      err?.response?.data || err.message
    );
    return {};
  }

  // Latest approved revision per fixture_id — compare by `as_of` (a plain
  // YYYY-MM-DD string, so lexical comparison is also chronological).
  const latestByFixtureId = {};
  for (const row of rows) {
    const existing = latestByFixtureId[row.fixture_id];
    if (!existing || row.as_of > existing.as_of) {
      latestByFixtureId[row.fixture_id] = row;
    }
  }

  const result = {};
  for (const row of Object.values(latestByFixtureId)) {
    const prediction = row.payload?.prediction;
    const editorial = row.payload?.editorial;

    // A row can be "approved" while still being a schedule-only draft with
    // no model run yet (sourceMeta.omitted documents this on Oracle's own
    // side) — if there's no actual prediction to show, skip it rather than
    // surface an empty/half-filled object.
    if (!prediction?.modelWinPct && !prediction?.confidence) continue;

    result[row.fixture_id] = {
      model_win_pct: prediction?.modelWinPct ?? null,
      confidence_pick: prediction?.confidence?.pick ?? null,
      confidence_pct: prediction?.confidence?.pct ?? null,
      confidence_band: prediction?.confidence?.band ?? null,
      confidence_tier: prediction?.confidence?.tier ?? null,
      editorial_lede: editorial?.lede ?? null,
      bracket_position: row.bracket_position ?? null,
      as_of: row.as_of,
      source: "oracle",
    };
  }

  return result;
}
