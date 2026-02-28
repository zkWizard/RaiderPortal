/**
 * src/diagnostics/locationDiag.js
 *
 * Diagnostic: logs every field available on item rawData and probes
 * potential MetaForge map-data API endpoints so we know what location
 * information is actually available before building the Locations UI.
 *
 * Runs once on page load. Remove import from index.html when done.
 */

import { fetchItems } from '../services/metaforgeApi.js';

// ─── Candidate map-data URLs to probe ─────────────────────────────────────────
// All go through the /api/metaforge proxy → https://metaforge.app/api/...

const MAP_NAMES = ['dam', 'spaceport', 'buried-city', 'blue-gate', 'stella-montis'];

const PROBE_URLS = [
  // Base endpoint — no map param
  '/api/metaforge/arc-raiders/game-map-data',
  '/api/metaforge/arc-raiders/maps',
  '/api/metaforge/arc-raiders/locations',
  // Per-map with ?map= param
  ...MAP_NAMES.map((m) => `/api/metaforge/arc-raiders/game-map-data?map=${m}`),
  // Per-map as path segment
  ...MAP_NAMES.map((m) => `/api/metaforge/arc-raiders/maps/${m}`),
  ...MAP_NAMES.map((m) => `/api/metaforge/arc-raiders/locations/${m}`),
];

// Keywords we especially care about in field names / values
const LOCATION_KEYWORDS = ['location', 'spawn', 'source', 'map', 'container', 'vote', 'zone', 'area', 'drop', 'loot_area'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function collectAllKeys(items) {
  // Returns Map<fieldName, { count, sample }> across all items
  const info = new Map();
  for (const item of items) {
    for (const [key, val] of Object.entries(item)) {
      if (!info.has(key)) {
        info.set(key, { count: 0, sample: val });
      }
      info.get(key).count++;
    }
  }
  return info;
}

function isInteresting(key, val) {
  const k = key.toLowerCase();
  if (LOCATION_KEYWORDS.some((kw) => k.includes(kw))) return true;
  if (Array.isArray(val) && val.length > 0) return true;
  if (val && typeof val === 'object' && Object.keys(val).length > 0) return true;
  return false;
}

async function probeUrl(url) {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    let body;
    try { body = await res.json(); } catch { body = null; }
    return { url, status: res.status, ok: res.ok, body };
  } catch (err) {
    return { url, status: 0, ok: false, error: err.message };
  }
}

// ─── Main diagnostic ──────────────────────────────────────────────────────────

export async function runLocationDiagnostics() {
  console.groupCollapsed('%c[LocationDiag] Starting location data investigation…', 'color:#ff5600;font-weight:bold');

  // ── 1. Item field inventory ────────────────────────────────────────────────
  let items;
  try {
    items = await fetchItems();
  } catch (err) {
    console.error('[LocationDiag] Could not fetch items:', err);
    console.groupEnd();
    return;
  }

  console.log(`[LocationDiag] Loaded ${items.length} items from cache/API.`);

  const keyMap = collectAllKeys(items);
  const total  = items.length;

  // Print full field inventory sorted by count desc
  const sorted = [...keyMap.entries()].sort((a, b) => b[1].count - a[1].count);
  console.group('── All item fields (%d unique keys across %d items)', sorted.length, total);
  for (const [key, { count, sample }] of sorted) {
    const pct     = ((count / total) * 100).toFixed(0);
    const flag    = isInteresting(key, sample) ? ' ★' : '';
    const preview = Array.isArray(sample)
      ? `Array(${sample.length})${sample.length ? ': ' + JSON.stringify(sample[0]).slice(0, 60) : ''}`
      : (sample && typeof sample === 'object')
        ? `Object{${Object.keys(sample).slice(0, 4).join(', ')}}`
        : JSON.stringify(sample)?.slice(0, 60);
    console.log(`  ${key.padEnd(30)} ${String(count).padStart(4)} items (${pct.padStart(3)}%)${flag}  →  ${preview}`);
  }
  console.groupEnd();

  // ── 2. Location-relevant fields deep-dive ─────────────────────────────────
  const interestingKeys = sorted
    .filter(([key, { sample }]) => isInteresting(key, sample))
    .map(([key]) => key);

  console.group('── Interesting / location-related fields (%d)', interestingKeys.length);
  for (const key of interestingKeys) {
    const { count, sample } = keyMap.get(key);
    console.log(`  ${key} (${count}/${total} items) — sample:`, sample);
  }
  console.groupEnd();

  // ── 3. Items with non-empty locations / loot_area ─────────────────────────
  const withLocations = items.filter((i) => Array.isArray(i.locations) && i.locations.length > 0);
  const withLootArea  = items.filter((i) => i.loot_area && String(i.loot_area).trim().length > 0);

  console.log(`[LocationDiag] Items with non-empty locations[]: ${withLocations.length}`);
  console.log(`[LocationDiag] Items with loot_area string:      ${withLootArea.length}`);

  if (withLocations.length) {
    console.group('── Sample items with locations[]');
    for (const item of withLocations.slice(0, 5)) {
      console.log(`  "${item.name}" — locations:`, item.locations);
    }
    console.groupEnd();
  }

  if (withLootArea.length) {
    console.group('── loot_area value frequency');
    const freq = new Map();
    for (const item of withLootArea) {
      const v = String(item.loot_area).trim();
      freq.set(v, (freq.get(v) ?? 0) + 1);
    }
    const freqSorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    for (const [val, n] of freqSorted)
      console.log(`  "${val}" → ${n} items`);
    console.groupEnd();
  }

  // ── 4. Sample 5 items — full raw data ─────────────────────────────────────
  console.group('── Full raw data: 5 sample items');
  for (const item of items.slice(0, 5)) {
    console.group(`  "${item.name}" (id: ${item.id})`);
    console.dir(item);
    console.groupEnd();
  }
  console.groupEnd();

  // ── 5. Probe map-data endpoints ───────────────────────────────────────────
  console.group('── Probing %d map-data endpoint candidates…', PROBE_URLS.length);
  const results = await Promise.all(PROBE_URLS.map(probeUrl));

  const ok  = results.filter((r) => r.ok);
  const bad = results.filter((r) => !r.ok);

  if (ok.length) {
    console.group(`✅ Responding endpoints (${ok.length})`);
    for (const r of ok) {
      console.group(`  ${r.url} → HTTP ${r.status}`);
      console.dir(r.body);
      console.groupEnd();
    }
    console.groupEnd();
  } else {
    console.log('  No endpoints responded with 2xx.');
  }

  if (bad.length) {
    console.group(`❌ Non-2xx / errored endpoints (${bad.length})`);
    for (const r of bad) {
      console.log(`  ${r.url} → ${r.error ?? `HTTP ${r.status}`}`, r.body ?? '');
    }
    console.groupEnd();
  }

  console.groupEnd(); // Probing group
  console.groupEnd(); // Main group

  console.log('%c[LocationDiag] Done. Check collapsed groups above for full detail.', 'color:#ff5600;font-weight:bold');
}
