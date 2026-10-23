// src/services/oracle/oracleEnrichmentService.js
//
// Merges Oracle's Liquipedia/HLTV-sourced competition enrichment into this
// API's own GSK-backed /competitions response. See ticket 869fa9urd.
//
// Oracle's enrichment lives in its own Supabase (`shelf_fact_current`), keyed
// by gsk_id, one row per field ("long" format). That table also carries
// GSK-sourced facts (event_name, start/end_date, location, organiser,
// series, team_count, prize_pool_player_share_usd, ...) that duplicate what
// this repo already stores directly from GSK — those are deliberately left
// out of ENRICHMENT_FIELDS below, per the ticket's "don't duplicate existing
// GSK data" requirement. Only facts that add real new value (sourced from
// Liquipedia/HLTV) get surfaced.
//
// Found while building this, beyond the Oct 14 2026 Liquipedia-hosting
// deadline the original Oracle 9 report flagged: the enrichment pipeline
// itself has been frozen since 2026-09-06 (confirmed live — that's the max
// `fetched_at` across the whole table as of this writing). So
// `event_state_at_capture` on these rows is stale too, computed back when
// the pipeline last ran — it can't be trusted to tell whether an event has
// since ended. That's why the known "stale TBD placeholder" bug (Section 1
// of the report) is handled here by simply never surfacing a literal "TBD"
// placement value, regardless of state — not by branching on event timing.

import axios from "axios";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const ENRICHMENT_FIELDS = [
  "tier",
  "publisher_tier",
  "format",
  "format_line_0", "format_line_1", "format_line_2", "format_line_3", "format_line_4",
  "format_line_5", "format_line_6", "format_line_7", "format_line_8", "format_line_9",
  "prize_pool_stated",
  "prize_table_total_usd",
  "prize_pool_usd", // HLTV's own headline figure — distinct from GSK's prize_pool_player_share_usd
  "placement_1_team", "placement_2_team", "placement_3_team", "placement_4_team",
  "placement_5-8_team", "placement_9-16_team", "placement_17-24_team", "placement_25-32_team",
  "placement_MVP_team",
  "page_url", "official_website", "rulebook_url", "hltv_url",
  "map_pool", "qualification_routes", "participating_teams",
];

// "S-Tier" (Liquipedia/publisher_tier style) -> "S" (GSK's own format), so
// the two don't read as a disagreement once merged. See ticket 869fa9vhm.
function normalizeTier(rawTier) {
  if (!rawTier) return null;
  // The competitions table defaults this (and several other GSK-sourced
  // columns) to this literal placeholder before GSK has actually supplied a
  // value — treat it as "no tier yet", not as a real tier string.
  if (String(rawTier).trim().toLowerCase() === "waiting for information") return null;
  const match = String(rawTier).trim().match(/^([A-Za-z+]+)[\s-]*Tier$/i);
  if (match) return match[1].toUpperCase();
  return String(rawTier).trim().toUpperCase();
}

// GSK's and HLTV's own prize-pool fields are suffixed `_usd` in Oracle's own
// schema — a guarantee Oracle itself makes. Liquipedia's `prize_pool_stated`
// has no such suffix, so Oracle doesn't actually promise it's USD; in every
// record checked so far it has been (no currency symbol/code ever seen),
// but that's convention, not a guarantee. If one ever does carry a non-USD
// symbol/code, treat it as unusable rather than silently parsing the number
// as if it were dollars (869fa9vhm).
const NON_USD_CURRENCY_PATTERN = /[€£¥₽]|EUR|GBP|JPY|RUB/i;

function parseMoneyLike(value) {
  if (value == null) return null;
  if (NON_USD_CURRENCY_PATTERN.test(String(value))) return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// How far apart numeric candidates have to be before it's a genuine
// disagreement worth flagging, not just rounding — ticket 869fa9vhm.
// 1% catches the real case the Oracle 9 report found (HLTV $2,000,000 vs
// Liquipedia $2,025,000, 1.25% apart) without false-positiving on cents.
const CONFLICT_RELATIVE_THRESHOLD = 0.01;

function hasGenuineConflict(values) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (nums.length < 2) return false;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  if (min === 0) return max !== 0;
  return (max - min) / min > CONFLICT_RELATIVE_THRESHOLD;
}

// Source-priority rule for prize pool, per the Oracle 9 report's findings.
// GSK's own figure is a player-share payout, not the tournament's full
// announced pool — a different metric entirely, not just a lower-priority
// source — so per Andy's feedback (869fa9vhm) it's never returned as
// `prize_pool` at all, not even as a last resort: prefer Liquipedia's own
// prize table total (it tends to reconcile per-placement payouts), then its
// stated headline figure, then HLTV's; otherwise null.
function resolvePrizePool({ liquipediaTableTotal, liquipediaStated, hltvValue }) {
  if (liquipediaTableTotal != null) return { value: liquipediaTableTotal, source: "liquipedia_table_total" };
  if (liquipediaStated != null) return { value: liquipediaStated, source: "liquipedia_stated" };
  if (hltvValue != null) return { value: hltvValue, source: "hltv" };
  return { value: null, source: null };
}

function pivotRows(rows) {
  const byGskId = {};
  for (const row of rows) {
    if (!ENRICHMENT_FIELDS.includes(row.field)) continue;
    const bucket = (byGskId[row.gsk_id] ??= { fields: {}, latestFetchedAt: null });
    bucket.fields[row.field] = row.value_num ?? row.value_text ?? null;
    if (row.fetched_at && (!bucket.latestFetchedAt || row.fetched_at > bucket.latestFetchedAt)) {
      bucket.latestFetchedAt = row.fetched_at;
    }
  }
  return byGskId;
}

function buildFormatText(fields) {
  const lines = [];
  for (let i = 0; i < 20; i++) {
    const line = fields[`format_line_${i}`];
    if (!line) break;
    lines.push(line);
  }
  return lines.length ? lines.join("\n") : (fields.format || null);
}

// Never surfaces a literal "TBD" — that's the known stale-placeholder bug
// from the report, not a legitimate value.
function buildPlacements(fields) {
  const placements = {};
  for (const key of Object.keys(fields)) {
    if (key.startsWith("placement_") && key.endsWith("_team")) {
      const value = fields[key];
      if (value && value !== "TBD") {
        placements[key.replace(/^placement_/, "").replace(/_team$/, "")] = value;
      }
    }
  }
  return placements;
}

/**
 * @param {Array<{id: number|string, tier?: string, prize_pool_usd?: number|null, end_date?: number, manual_override?: number}>} competitions
 *   Rows already fetched from this repo's own MySQL `competitions` table —
 *   `tier`/`prize_pool_usd` are GSK's side of the precedence rules above,
 *   `end_date` backs the staleness check, and `manual_override` (truthy)
 *   makes GSK's own value win outright, skipping Oracle entirely.
 * @returns {Promise<Record<string, object>>} enrichment keyed by competition id (string)
 */
export async function getEnrichmentForCompetitions(competitions) {
  if (!competitions?.length) return {};
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("[oracleEnrichment] SUPABASE_URL / SUPABASE_KEY not set, skipping enrichment");
    return {};
  }

  const ids = competitions.map((c) => c.id);
  let rows = [];
  try {
    const response = await axios.get(`${SUPABASE_URL}/rest/v1/shelf_fact_current`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      params: {
        gsk_id: `in.(${ids.join(",")})`,
        select: "gsk_id,field,value_text,value_num,fetched_at",
      },
      // Fails open (see catch below), but only if it fails fast — without
      // this, a hung Oracle Supabase would hang the whole /competitions
      // list response (up to 50 competitions batched per call) instead of
      // falling back quickly. Flagged in review on 869fa9urd.
      timeout: 8000,
    });
    rows = Array.isArray(response.data) ? response.data : [];
  } catch (err) {
    console.error(
      "[oracleEnrichment] Error querying Oracle Supabase:",
      err?.response?.status,
      err?.response?.data || err.message
    );
    return {};
  }

  const byGskId = pivotRows(rows);
  const result = {};

  for (const comp of competitions) {
    const bucket = byGskId[comp.id];
    if (!bucket) continue;
    const { fields, latestFetchedAt } = bucket;

    const liquipediaTableTotal = parseMoneyLike(fields.prize_table_total_usd);
    const liquipediaStated = parseMoneyLike(fields.prize_pool_stated);
    const hltvValue = parseMoneyLike(fields.prize_pool_usd);

    const prizePool = resolvePrizePool({ liquipediaTableTotal, liquipediaStated, hltvValue });

    // Tier precedence (ticket 869fa9vhm): Oracle/Liquipedia wins when it has
    // a value for this competition — it's the source that specializes in
    // tier classification — GSK's own tier is the fallback when Oracle has
    // nothing. Neither ever overwrites the other in the DB; this is computed
    // fresh on each response.
    const tierOracle = normalizeTier(fields.tier || fields.publisher_tier);
    const tierGsk = normalizeTier(comp.tier);
    let tierResolved = tierOracle || tierGsk || null;
    let tierResolvedSource = tierOracle ? "oracle" : tierGsk ? "gsk" : null;
    const tierConflict = !!(tierOracle && tierGsk && tierOracle !== tierGsk);

    let prizePoolValue = prizePool.value;
    let prizePoolSource = prizePool.source;
    // GSK's player-share figure is a different metric from the prize pool
    // (see resolvePrizePool above), so it's deliberately left out of this
    // conflict check too — comparing it against the real pool would just
    // manufacture false conflicts, not catch real ones (869fa9vhm).
    const prizePoolConflict = hasGenuineConflict([liquipediaTableTotal, liquipediaStated, hltvValue]);

    // manual_override (869fa9urd): a value a human fixed by hand always
    // wins over both Oracle and GSK — never flagged as conflicting with
    // either, since a human already made the call.
    if (comp.manual_override) {
      tierResolved = tierGsk;
      tierResolvedSource = "manual";
      prizePoolValue = comp.prize_pool_usd ?? null;
      prizePoolSource = "manual";
    }

    // Staleness (869fa9vhm): this fact set predates the event's own end —
    // definitely hasn't been revisited since it finished. comp.end_date
    // defaults to a far-future sentinel (see createTables.js) when GSK
    // hasn't supplied a real one yet, which this treats as "not over", not
    // stale.
    const hasRealEndDate = Number(comp.end_date) && Number(comp.end_date) < 9999999999999;
    const enrichmentStale =
      hasRealEndDate && !!latestFetchedAt && new Date(latestFetchedAt).getTime() < Number(comp.end_date);

    result[comp.id] = {
      tier_oracle: tierOracle,
      tier_resolved: tierResolved,
      tier_resolved_source: tierResolvedSource,
      tier_conflict: comp.manual_override ? false : tierConflict,
      format: buildFormatText(fields),
      placements: buildPlacements(fields),
      prize_pool: prizePoolValue,
      prize_pool_source: prizePoolSource,
      prize_pool_conflict: comp.manual_override ? false : prizePoolConflict,
      enrichment_stale: enrichmentStale,
      links: {
        liquipedia: fields.page_url || null,
        official: fields.official_website || null,
        rulebook: fields.rulebook_url || null,
        hltv: fields.hltv_url || null,
      },
      source: "oracle",
      fetched_at: latestFetchedAt,
    };
  }

  return result;
}
