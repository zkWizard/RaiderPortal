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

// ─────────────────────────────────────────────────────────────────────────────
// ARC ENEMIES  (list + per-enemy detail with markers and relatedMaps)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enemy list shape (from /api/arc-enemies):
 *   { id, name, updatedAt, icon }
 *
 * Enemy detail shape (from /api/arc-enemies/:id) adds:
 *   dropTable[]         — items dropped by this enemy (name, id, rarity, icon, type, value, foundIn)
 *   image               — hero image path (relative, use ardbImg())
 *   relatedMaps[]       — map objects this enemy appears on, each with:
 *                           id, name, description, image, tileLayers[]
 *                           tileLayers: { id, name, width, height, tilesize, tileUrl, maxZoom, minZoom, maxNativeZoom }
 *   markers[]           — spawn point coordinates: { coordinate: [x, y], mapId }
 *   relatedLocationTypes — internal location type tags (array of strings)
 *
 * Enemy map coverage (from probe 2025-02):
 *   wasp, hornet, firefly, snitch, comet → relatedMaps: [] (spawn everywhere / unknown)
 *   tick, pop, fireball, surveyor, turret, sentinel, rocketeer, bastion,
 *   bombardier, spotter, leaper → all 5 maps (or 4 without Stella Montis)
 *   queen, matriarch → Dam, Spaceport, Blue Gate
 *   shredder          → Stella Montis only
 */

const ENEMIES_CACHE_KEY = 'rp_ardb_enemies';
const ENEMIES_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/** @type {object[]|null} */
let _enemiesCache   = null;
/** @type {Promise<object[]>|null} */
let _enemiesPromise = null;

/**
 * Fetches the ARDB arc-enemies list.
 * Cached in localStorage for 1 hour.
 *
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<object[]>}
 */
export async function fetchArdbEnemies({ forceRefresh = false } = {}) {
  if (!forceRefresh && _enemiesCache) return _enemiesCache;
  if (!forceRefresh && _enemiesPromise) return _enemiesPromise;

  _enemiesPromise = (async () => {
    if (!forceRefresh) {
      try {
        const raw = localStorage.getItem(ENEMIES_CACHE_KEY);
        if (raw) {
          const { data, at } = JSON.parse(raw);
          if (Date.now() - at < ENEMIES_CACHE_TTL) {
            _enemiesCache = data;
            _enemiesPromise = null;
            return _enemiesCache;
          }
        }
      } catch { /* ignore */ }
    }

    console.log('[ARDB] Fetching arc-enemies list...');
    const res = await fetch(`${ARDB_BASE}/arc-enemies`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`ARDB /arc-enemies returned HTTP ${res.status}`);

    const data = await res.json();
    _enemiesCache = Array.isArray(data) ? data : [];
    console.log(`[ARDB] ${_enemiesCache.length} enemies loaded.`);

    try {
      localStorage.setItem(ENEMIES_CACHE_KEY, JSON.stringify({ data: _enemiesCache, at: Date.now() }));
    } catch { /* quota exceeded */ }

    _enemiesPromise = null;
    return _enemiesCache;
  })();

  return _enemiesPromise;
}

/** @type {Map<string, object>}  enemyId → full detail */
const _enemyDetailCache = new Map();

/**
 * Fetches full detail for a single ARC enemy by id.
 * Includes dropTable, relatedMaps, markers, relatedLocationTypes.
 * Cached in-memory per session.
 *
 * @param {string} enemyId   e.g. "tick", "queen"
 * @returns {Promise<object>}
 */
export async function fetchArdbEnemy(enemyId) {
  if (_enemyDetailCache.has(enemyId)) return _enemyDetailCache.get(enemyId);

  const res = await fetch(`${ARDB_BASE}/arc-enemies/${encodeURIComponent(enemyId)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`ARDB /arc-enemies/${enemyId} returned HTTP ${res.status}`);

  const data = await res.json();
  _enemyDetailCache.set(enemyId, data);
  return data;
}
