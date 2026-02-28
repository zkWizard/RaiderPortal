/**
 * metaforgeApi.js
 *
 * Wrapper for the MetaForge ARC Raiders API.
 * https://metaforge.app/arc-raiders/api
 *
 * Usage guidelines from MetaForge:
 *  - Cache data locally; avoid repeated direct calls on every page load.
 *  - Large requests may be throttled.
 *  - Attribute metaforge.app/arc-raiders in public projects.
 *  - Endpoints may change without warning — check docs periodically.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = 'https://metaforge.app/api/arc-raiders';

const CACHE_PREFIX = 'rp_mf_'; // "raiderportal_metaforge_" — short to save space

/** Max records the API will return per page (hard cap confirmed by probing). */
const API_PAGE_LIMIT = 100;

/**
 * Per-endpoint cache TTLs (milliseconds).
 * Events are time-sensitive; reference data like ARCs and quests is stable.
 */
const TTL = {
  items:          15 * 60 * 1000, //  15 min — large dataset (527 items), changes on patches
  arcs:           30 * 60 * 1000, //  30 min — 19 ARC enemies, rarely updated
  quests:         30 * 60 * 1000, //  30 min — 85 quests, rarely updated
  traders:        10 * 60 * 1000, //  10 min — 5 traders / 93 items, prices shift each patch
  eventsSchedule:  5 * 60 * 1000, //   5 min — 225 scheduled events, time-sensitive
};

// ─────────────────────────────────────────────────────────────────────────────
// ERROR CLASS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structured error thrown by all fetch functions.
 *
 * @property {number}  status    HTTP status code (0 for network errors)
 * @property {string}  endpoint  The relative API path that failed
 * @property {boolean} retryable Whether a retry is likely to succeed
 */
export class MetaForgeError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {string} endpoint
   */
  constructor(message, status, endpoint) {
    super(message);
    this.name = 'MetaForgeError';
    this.status = status;
    this.endpoint = endpoint;
    this.retryable = status === 500 || status === 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CACHE LAYER  (localStorage → in-memory fallback)
// ─────────────────────────────────────────────────────────────────────────────

/** In-memory fallback used when localStorage is unavailable (e.g. incognito blocks). */
const memoryStore = new Map();

/** @returns {boolean} */
function localStorageAvailable() {
  try {
    const probe = '__rp_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

const useLocalStorage = localStorageAvailable();

/**
 * @param {string} key
 * @returns {{ data: unknown, cachedAt: number, ttl: number } | null}
 */
function readStore(key) {
  try {
    if (useLocalStorage) {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    }
    return memoryStore.get(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {string}  key
 * @param {unknown} data
 * @param {number}  ttl   Milliseconds until stale
 */
function writeStore(key, data, ttl) {
  const entry = { data, cachedAt: Date.now(), ttl };
  try {
    if (useLocalStorage) {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } else {
      memoryStore.set(key, entry);
    }
  } catch (err) {
    // localStorage quota exceeded — fall through to memory
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      memoryStore.set(key, entry);
    }
  }
}

/**
 * Returns cached data if present and not yet stale; otherwise null.
 *
 * @param {string}  key
 * @returns {{ data: unknown, ageMs: number } | null}
 */
function getCache(key) {
  const entry = readStore(key);
  if (!entry) return null;
  const ageMs = Date.now() - entry.cachedAt;
  if (ageMs > entry.ttl) return null;
  return { data: entry.data, ageMs };
}

/**
 * Removes a single cache entry, or all MetaForge entries if no key given.
 *
 * @param {string} [key]  One of: 'items' | 'arcs' | 'quests' | 'traders' | 'eventsSchedule'
 */
export function clearCache(key) {
  if (key) {
    if (useLocalStorage) localStorage.removeItem(CACHE_PREFIX + key);
    else memoryStore.delete(key);
    return;
  }
  // Clear all
  if (useLocalStorage) {
    Object.keys(localStorage)
      .filter(k => k.startsWith(CACHE_PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } else {
    memoryStore.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CACHE STATUS (useful for "last updated X min ago" UI labels)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef  {Object} CacheStatus
 * @property {boolean}      cached
 * @property {number|null}  ageMs       Milliseconds since data was fetched
 * @property {number|null}  ttlMs       Configured TTL for this endpoint
 * @property {number|null}  expiresInMs Milliseconds until stale (negative if already stale)
 * @property {Date|null}    cachedAt
 */

/**
 * Returns cache metadata for a single endpoint without making a network call.
 *
 * @param {'items'|'arcs'|'quests'|'traders'|'eventsSchedule'} key
 * @returns {CacheStatus}
 */
export function getCacheStatus(key) {
  const entry = readStore(key);
  if (!entry) {
    return { cached: false, ageMs: null, ttlMs: TTL[key] ?? null, expiresInMs: null, cachedAt: null };
  }
  const ageMs = Date.now() - entry.cachedAt;
  return {
    cached: ageMs <= entry.ttl,
    ageMs,
    ttlMs: entry.ttl,
    expiresInMs: entry.ttl - ageMs,
    cachedAt: new Date(entry.cachedAt),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE FETCH HELPER
// ─────────────────────────────────────────────────────────────────────────────

const ERROR_MESSAGES = {
  400: (ep) => `Bad request to ${ep} — check query parameters.`,
  404: (ep) => `Endpoint not found: ${ep} — the API may have changed.`,
  413: (ep) => `Request payload too large for ${ep}.`,
  500: (ep) => `MetaForge server error on ${ep} — try again shortly.`,
};

/**
 * Fetches a single URL (absolute) and throws a typed MetaForgeError on failure.
 *
 * @param {string} url      Full URL
 * @param {string} pathLabel  For error messages
 * @returns {Promise<unknown>}
 */
async function fetchUrl(url, pathLabel) {
  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch (networkErr) {
    throw new MetaForgeError(
      `Network error reaching MetaForge (${pathLabel}): ${networkErr.message}`,
      0,
      pathLabel
    );
  }

  if (!response.ok) {
    const messageFn = ERROR_MESSAGES[response.status];
    const message = messageFn
      ? messageFn(pathLabel)
      : `Unexpected HTTP ${response.status} from ${pathLabel}.`;
    throw new MetaForgeError(message, response.status, pathLabel);
  }

  try {
    return await response.json();
  } catch {
    throw new MetaForgeError(
      `Invalid JSON response from ${pathLabel}.`,
      response.status,
      pathLabel
    );
  }
}

/**
 * Fetches a MetaForge endpoint (relative path).
 *
 * @param {string} path  Relative path, e.g. '/items'
 * @returns {Promise<unknown>}
 */
async function metaforgeFetch(path) {
  return fetchUrl(`${BASE_URL}${path}`, path);
}

/**
 * Fetches ALL pages of a paginated endpoint and merges the `data` arrays.
 *
 * The API caps results at 100 per page. This transparently follows
 * `pagination.hasNextPage` until all records are collected.
 *
 * @param {string} path   Relative path, e.g. '/items'
 * @returns {Promise<unknown[]>}  Flat merged array of all records
 */
async function fetchAllPages(path) {
  let page = 1;
  let allData = [];
  let hasNextPage = true;

  while (hasNextPage) {
    const sep = path.includes('?') ? '&' : '?';
    const raw = await fetchUrl(
      `${BASE_URL}${path}${sep}page=${page}&limit=${API_PAGE_LIMIT}`,
      path
    );

    allData = allData.concat(raw.data ?? []);
    hasNextPage = raw.pagination?.hasNextPage ?? false;
    page++;
  }

  return allData;
}

/**
 * Shared logic: return cached data or fetch, cache, then return.
 *
 * @param {string}  cacheKey      One of the TTL keys
 * @param {() => Promise<unknown>} fetcher  Async function that returns normalized data
 * @param {boolean} forceRefresh  Bypass cache if true
 * @returns {Promise<unknown>}
 */
async function cachedFetch(cacheKey, fetcher, forceRefresh = false) {
  if (!forceRefresh) {
    const hit = getCache(cacheKey);
    if (hit) return hit.data;
  }

  const data = await fetcher();
  writeStore(cacheKey, data, TTL[cacheKey]);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE TYPES (JSDoc — no TS compiler needed)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} StatBlock
 * @property {number} range
 * @property {number} value
 * @property {number} damage
 * @property {number} health
 * @property {number} radius
 * @property {number} shield
 * @property {number} weight
 * @property {number} magazineSize
 * @property {number} fireRate
 * @property {number} stability
 * @property {number} stackSize
 * // …plus the full set of stat fields from the API
 */

/**
 * @typedef {Object} Item
 * @property {string}    id
 * @property {string}    name
 * @property {string}    description
 * @property {string}    item_type
 * @property {string[]}  loadout_slots
 * @property {string}    icon           CDN URL
 * @property {string}    rarity         'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary'
 * @property {number}    value          In-game coin value
 * @property {string|null} workbench
 * @property {StatBlock} stat_block
 * @property {string}    flavor_text
 * @property {string}    subcategory
 * @property {string}    ammo_type
 * @property {string}    shield_type
 * @property {string}    loot_area
 * @property {unknown[]} locations
 * @property {Array<{url:string,label:string}>} guide_links
 * @property {string}    created_at
 * @property {string}    updated_at
 */

/**
 * @typedef {Object} Arc
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} icon    CDN URL
 * @property {string} image   CDN URL
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} QuestRewardItem
 * @property {string} id
 * @property {string} icon
 * @property {string} name
 * @property {string} rarity
 * @property {string} item_type
 */

/**
 * @typedef {Object} QuestReward
 * @property {string}          id
 * @property {QuestRewardItem} item
 * @property {string}          item_id
 * @property {string}          quantity
 */

/**
 * @typedef {Object} Quest
 * @property {string}         id
 * @property {string}         name
 * @property {string[]}       objectives
 * @property {number}         xp
 * @property {unknown[]}      granted_items
 * @property {unknown[]}      required_items
 * @property {QuestReward[]}  rewards
 * @property {string}         trader_name
 * @property {number}         sort_order
 * @property {{x:number,y:number}} position
 * @property {string}         image        CDN URL
 * @property {Array<{url:string,label:string}>} guide_links
 * @property {string|null}    marker_category
 * @property {unknown[]}      locations
 * @property {string}         created_at
 * @property {string}         updated_at
 */

/**
 * @typedef {Object} TraderItem
 * @property {string} id
 * @property {string} icon         CDN URL
 * @property {string} name
 * @property {number} value        Base coin value
 * @property {string} rarity
 * @property {string} item_type
 * @property {string} description
 * @property {number} trader_price Sell price at this trader (typically 3× value)
 */

/**
 * @typedef {Object} TradersData
 * @property {TraderItem[]} Apollo
 * @property {TraderItem[]} [Celeste]
 * @property {TraderItem[]} [Viktor]
 * // …any trader name the API returns
 */

/**
 * @typedef {Object} GameEvent
 * @property {string} name
 * @property {string} map
 * @property {string} icon       CDN URL
 * @property {number} startTime  Unix timestamp ms
 * @property {number} endTime    Unix timestamp ms
 */

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch ALL items from the MetaForge database.
 *
 * The API paginates at 100/page; this function auto-fetches all pages
 * and returns the merged flat array (527 items as of patch 1.4).
 *
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<Item[]>}
 */
export async function fetchItems({ forceRefresh = false } = {}) {
  return cachedFetch(
    'items',
    () => fetchAllPages('/items'),
    forceRefresh
  );
}

/**
 * Fetch all ARC enemy entries.
 *
 * 19 records, single page — no pagination needed.
 *
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<Arc[]>}
 */
export async function fetchArcs({ forceRefresh = false } = {}) {
  return cachedFetch(
    'arcs',
    async () => {
      const raw = await metaforgeFetch('/arcs');
      return raw.data ?? [];
    },
    forceRefresh
  );
}

/**
 * Fetch all quests including objectives, required items, and rewards.
 *
 * 85 records fit within one limit=100 request — no multi-page loop needed,
 * but uses fetchAllPages defensively in case more quests are added later.
 *
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<Quest[]>}
 */
export async function fetchQuests({ forceRefresh = false } = {}) {
  return cachedFetch(
    'quests',
    () => fetchAllPages('/quests'),
    forceRefresh
  );
}

/**
 * Fetch all trader inventories.
 *
 * The raw API returns `{ success: true, data: { Apollo: [...], Celeste: [...], ... } }`.
 * This function normalises it to a plain `{ [traderName]: TraderItem[] }` object,
 * discarding the `success` field.
 *
 * Traders as of patch 1.4: Apollo (20), Celeste (26), Lance (16), Shani (3), TianWen (28).
 *
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<TradersData>}
 */
export async function fetchTraders({ forceRefresh = false } = {}) {
  return cachedFetch(
    'traders',
    async () => {
      const raw = await metaforgeFetch('/traders');
      // `raw.data` is the keyed trader object; `raw.success` is discarded.
      if (raw && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
        return raw.data;
      }
      return raw?.data ?? {};
    },
    forceRefresh
  );
}

/**
 * Fetch the upcoming events schedule.
 *
 * Returns 225 events. `startTime` / `endTime` are Unix timestamps in milliseconds
 * — pass directly to `new Date(event.startTime)`.
 *
 * The response also includes a top-level `cachedAt` timestamp (server-side cache).
 *
 * Note: the older `/event-timers` path is deprecated — this uses `/events-schedule`.
 *
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<GameEvent[]>}
 */
export async function fetchEventsSchedule({ forceRefresh = false } = {}) {
  return cachedFetch(
    'eventsSchedule',
    async () => {
      const raw = await metaforgeFetch('/events-schedule');
      return raw.data ?? [];
    },
    forceRefresh
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch items filtered by rarity.
 *
 * Filtering is done client-side from the cached dataset — no extra API call.
 *
 * @param {'Common'|'Uncommon'|'Rare'|'Epic'|'Legendary'} rarity
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<Item[]>}
 */
export async function fetchItemsByRarity(rarity, { forceRefresh = false } = {}) {
  const items = await fetchItems({ forceRefresh });
  return items.filter((item) => item.rarity === rarity);
}

/**
 * Fetch items filtered by type (e.g. 'Quick Use', 'Armor', 'Weapon').
 *
 * @param {string} itemType
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<Item[]>}
 */
export async function fetchItemsByType(itemType, { forceRefresh = false } = {}) {
  const items = await fetchItems({ forceRefresh });
  return items.filter((item) => item.item_type === itemType);
}

/**
 * Fetch quests for a specific trader.
 *
 * @param {string} traderName  e.g. 'Celeste', 'Apollo', 'Viktor'
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<Quest[]>}
 */
export async function fetchQuestsByTrader(traderName, { forceRefresh = false } = {}) {
  const quests = await fetchQuests({ forceRefresh });
  return quests.filter((q) => q.trader_name === traderName);
}

/**
 * Fetch only events that are currently active (startTime <= now < endTime).
 *
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<GameEvent[]>}
 */
export async function fetchActiveEvents({ forceRefresh = false } = {}) {
  const events = await fetchEventsSchedule({ forceRefresh });
  const now = Date.now();
  return events.filter((e) => e.startTime <= now && now < e.endTime);
}

/**
 * Fetch events for a specific map.
 *
 * @param {string} mapName  e.g. 'Spaceport', 'Dam', 'Blue Gate', 'Buried City', 'Stella Montis'
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<GameEvent[]>}
 */
export async function fetchEventsByMap(mapName, { forceRefresh = false } = {}) {
  const events = await fetchEventsSchedule({ forceRefresh });
  return events.filter((e) => e.map === mapName);
}

/**
 * Prefetch all endpoints in parallel and prime the cache.
 * Call this once on app init to ensure zero latency on subsequent reads.
 *
 * Failures are collected and returned — a single bad endpoint won't abort the rest.
 *
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<{ ok: string[], failed: Array<{ endpoint: string, error: MetaForgeError }> }>}
 */
export async function prefetchAll({ forceRefresh = false } = {}) {
  const endpoints = [
    { key: 'items',          fn: () => fetchItems({ forceRefresh }) },
    { key: 'arcs',           fn: () => fetchArcs({ forceRefresh }) },
    { key: 'quests',         fn: () => fetchQuests({ forceRefresh }) },
    { key: 'traders',        fn: () => fetchTraders({ forceRefresh }) },
    { key: 'eventsSchedule', fn: () => fetchEventsSchedule({ forceRefresh }) },
  ];

  const results = await Promise.allSettled(endpoints.map((e) => e.fn()));

  const ok = [];
  const failed = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      ok.push(endpoints[i].key);
    } else {
      failed.push({ endpoint: endpoints[i].key, error: result.reason });
    }
  });

  return { ok, failed };
}
