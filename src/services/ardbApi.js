/**
 * src/services/ardbApi.js
 *
 * Data-fetching service for the ARDB ARC Raiders API.
 * All requests route through the /api/ardb/* Vercel proxy to avoid CORS.
 *
 * Docs:        https://ardb.app/developers/api
 * Attribution: https://ardb.app
 * Image base:  https://ardb.app/static (relative icon paths are prepended with https://ardb.app)
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const ARDB_BASE  = '/api/ardb';
const ARDB_IMAGE = 'https://ardb.app';

const LIST_CACHE_KEY = 'rp_ardb_items';
const LIST_CACHE_TTL = 30 * 60 * 1000; // 30 min

// ─────────────────────────────────────────────────────────────────────────────
// URL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a relative ARDB asset path to an absolute URL.
 * e.g. "/items/icons/chemicals.webp" → "https://ardb.app/items/icons/chemicals.webp"
 *
 * @param {string|null|undefined} path
 * @returns {string}
 */
export function ardbImg(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return ARDB_IMAGE + (path.startsWith('/') ? '' : '/') + path;
}

// ─────────────────────────────────────────────────────────────────────────────
// ITEMS LIST  (all 483 items — list subset only)
// ─────────────────────────────────────────────────────────────────────────────

/** @type {object[]|null} */
let _listCache   = null;
/** @type {Promise<object[]>|null} */
let _listPromise = null;

/**
 * Fetches the full ARDB items list (all items, list-subset shape).
 * Cached in localStorage for 30 minutes; safe to call multiple times.
 *
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<object[]>}
 */
export async function fetchArdbItems({ forceRefresh = false } = {}) {
  if (!forceRefresh && _listCache) return _listCache;
  if (!forceRefresh && _listPromise) return _listPromise;

  _listPromise = (async () => {
    // Try localStorage first
    if (!forceRefresh) {
      try {
        const raw = localStorage.getItem(LIST_CACHE_KEY);
        if (raw) {
          const { data, at } = JSON.parse(raw);
          if (Date.now() - at < LIST_CACHE_TTL) {
            _listCache = data;
            _listPromise = null;
            return _listCache;
          }
        }
      } catch { /* ignore parse/quota errors */ }
    }

    console.log('[ARDB] Fetching items list...');
    const res = await fetch(`${ARDB_BASE}/items`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`ARDB /items returned HTTP ${res.status}`);

    const data = await res.json();
    _listCache = Array.isArray(data) ? data : [];
    console.log(`[ARDB] ${_listCache.length} items loaded.`);

    try {
      localStorage.setItem(LIST_CACHE_KEY, JSON.stringify({ data: _listCache, at: Date.now() }));
    } catch { /* quota exceeded — in-memory cache still works */ }

    _listPromise = null;
    return _listCache;
  })();

  return _listPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// ITEM DETAIL  (single item — full shape with crafting, recycling, sources, etc.)
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Map<string, object>} ardbId → full detail object */
const _detailCache = new Map();

/**
 * Fetches the full ARDB detail for a single item by ARDB id.
 * Cached in-memory per session.
 *
 * @param {string} ardbId   e.g. "adrenaline_shot"
 * @returns {Promise<object>}
 */
export async function fetchArdbItem(ardbId) {
  if (_detailCache.has(ardbId)) return _detailCache.get(ardbId);

  const res = await fetch(`${ARDB_BASE}/items/${encodeURIComponent(ardbId)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`ARDB /items/${ardbId} returned HTTP ${res.status}`);

  const data = await res.json();
  _detailCache.set(ardbId, data);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-REFERENCE  (MetaForge item name → ARDB list item)
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Map<string, object>|null}  lowerCaseName → ardb list item */
let _crossRef        = null;
/** @type {Promise<Map>|null} */
let _crossRefPromise = null;

/**
 * Builds and caches a Map<lowerCaseName, ardbListItem> from the ARDB items list.
 * Safe to call multiple times — builds only once per session.
 *
 * @returns {Promise<Map<string, object>>}
 */
export async function buildArdbCrossRef() {
  if (_crossRef) return _crossRef;
  if (_crossRefPromise) return _crossRefPromise;

  _crossRefPromise = fetchArdbItems().then((items) => {
    _crossRef = new Map();
    for (const item of items) {
      if (item.name) _crossRef.set(item.name.trim().toLowerCase(), item);
    }
    console.log(`[ARDB] Cross-ref built: ${_crossRef.size} names indexed.`);
    _crossRefPromise = null;
    return _crossRef;
  });

  return _crossRefPromise;
}

/**
 * Look up an ARDB list item by a display name (case-insensitive).
 * Returns the ARDB list-item object (with `.id` field) or null if not found.
 *
 * @param {string} name         MetaForge item display name
 * @param {Map}    crossRef     The map returned by buildArdbCrossRef()
 * @returns {object|null}
 */
export function lookupArdbByName(name, crossRef) {
  if (!crossRef || !name) return null;
  return crossRef.get(name.trim().toLowerCase()) ?? null;
}
