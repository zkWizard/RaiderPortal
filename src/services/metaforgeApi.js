/**
 * src/services/metaforgeApi.js
 *
 * Data-fetching service for the MetaForge ARC Raiders API.
 * All requests route through the /api/metaforge/* Vercel proxy to avoid CORS.
 *
 * Docs: https://metaforge.app/arc-raiders/api
 * Attribution required for public projects: metaforge.app/arc-raiders
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Proxy base — all browser requests go here, never directly to metaforge.app */
const BASE_URL = '/api/metaforge/arc-raiders';

const CACHE_PREFIX = 'rp_mf_';

/** Max records the API returns per page. */
const API_PAGE_LIMIT = 100;

const TTL = {
  items:           15 * 60 * 1000, //  15 min
  arcs:            30 * 60 * 1000, //  30 min
  quests:          30 * 60 * 1000, //  30 min
  traders:         10 * 60 * 1000, //  10 min
  eventsSchedule:   5 * 60 * 1000, //   5 min
};

// ─────────────────────────────────────────────────────────────────────────────
// ERROR CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class MetaForgeError extends Error {
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

const memoryStore = new Map();

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

function writeStore(key, data, ttl) {
  const entry = { data, cachedAt: Date.now(), ttl };
  try {
    if (useLocalStorage) {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } else {
      memoryStore.set(key, entry);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      memoryStore.set(key, entry);
    }
  }
}

function getCache(key) {
  const entry = readStore(key);
  if (!entry) return null;
  const ageMs = Date.now() - entry.cachedAt;
  if (ageMs > entry.ttl) return null;
  return { data: entry.data, ageMs };
}

export function clearCache(key) {
  if (key) {
    if (useLocalStorage) localStorage.removeItem(CACHE_PREFIX + key);
    else memoryStore.delete(key);
    return;
  }
  if (useLocalStorage) {
    Object.keys(localStorage)
      .filter(k => k.startsWith(CACHE_PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } else {
    memoryStore.clear();
  }
}

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
// CORE FETCH HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function fetchUrl(url, pathLabel) {
  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch (networkErr) {
    throw new MetaForgeError(
      `Network error (${pathLabel}): ${networkErr.message}`,
      0,
      pathLabel
    );
  }

  if (!response.ok) {
    const msgs = {
      400: `Bad request to ${pathLabel} — check query parameters.`,
      404: `Endpoint not found: ${pathLabel} — the API may have changed.`,
      500: `MetaForge server error on ${pathLabel} — try again shortly.`,
    };
    throw new MetaForgeError(
      msgs[response.status] ?? `Unexpected HTTP ${response.status} from ${pathLabel}.`,
      response.status,
      pathLabel
    );
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
 * Fetches ALL pages of a paginated endpoint and merges the data arrays.
 *
 * Reads pagination.totalPages from the first response so it can log
 * accurate progress ("Fetching items page 3 of 12...") and fetch all
 * remaining pages in order.
 *
 * @param {string} path   Relative path including any fixed params, e.g. '/arcs?includeLoot=true'
 * @param {string} label  Human-readable name for progress logs, e.g. 'items'
 * @returns {Promise<unknown[]>}
 */
async function fetchAllPages(path, label) {
  const sep = path.includes('?') ? '&' : '?';

  // ── Page 1: discover totalPages ─────────────────────────────────────────
  console.log(`[MetaForge] Fetching ${label} page 1...`);
  const first = await fetchUrl(
    `${BASE_URL}${path}${sep}page=1&limit=${API_PAGE_LIMIT}`,
    path
  );

  const totalPages = first.pagination?.totalPages ?? 1;
  let allData = first.data ?? [];

  if (totalPages > 1) {
    console.log(`[MetaForge] Fetching ${label} page 1 of ${totalPages}... done`);
  }

  // ── Pages 2..N ───────────────────────────────────────────────────────────
  for (let page = 2; page <= totalPages; page++) {
    console.log(`[MetaForge] Fetching ${label} page ${page} of ${totalPages}...`);
    const raw = await fetchUrl(
      `${BASE_URL}${path}${sep}page=${page}&limit=${API_PAGE_LIMIT}`,
      path
    );
    allData = allData.concat(raw.data ?? []);
  }

  console.log(`[MetaForge] ${label}: ${allData.length} records loaded.`);
  return allData;
}

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
// PUBLIC FETCH FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch ALL items (527+ records across multiple pages).
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<object[]>}
 */
export async function fetchItems({ forceRefresh = false } = {}) {
  return cachedFetch(
    'items',
    () => fetchAllPages('/items', 'items'),
    forceRefresh
  );
}

/**
 * Fetch all ARC enemies with loot tables included.
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<object[]>}
 */
export async function fetchArcs({ forceRefresh = false } = {}) {
  return cachedFetch(
    'arcs',
    () => fetchAllPages('/arcs?includeLoot=true', 'arcs'),
    forceRefresh
  );
}

/**
 * Fetch all quests.
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<object[]>}
 */
export async function fetchQuests({ forceRefresh = false } = {}) {
  return cachedFetch(
    'quests',
    () => fetchAllPages('/quests', 'quests'),
    forceRefresh
  );
}

/**
 * Fetch all trader inventories.
 * Response shape: { TraderName: TraderItem[] }
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<object>}
 */
export async function fetchTraders({ forceRefresh = false } = {}) {
  return cachedFetch(
    'traders',
    async () => {
      console.log('[MetaForge] Fetching traders...');
      const raw = await fetchUrl(`${BASE_URL}/traders`, '/traders');
      const data = (raw && typeof raw.data === 'object' && !Array.isArray(raw.data))
        ? raw.data
        : (raw?.data ?? {});
      const count = Object.values(data).reduce((n, arr) => n + (arr?.length ?? 0), 0);
      console.log(`[MetaForge] traders: ${count} items across ${Object.keys(data).length} traders loaded.`);
      return data;
    },
    forceRefresh
  );
}

/**
 * Fetch the upcoming events schedule.
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<object[]>}
 */
export async function fetchEventsSchedule({ forceRefresh = false } = {}) {
  return cachedFetch(
    'eventsSchedule',
    async () => {
      console.log('[MetaForge] Fetching events-schedule...');
      const raw = await fetchUrl(`${BASE_URL}/events-schedule`, '/events-schedule');
      const data = raw.data ?? [];
      console.log(`[MetaForge] events-schedule: ${data.length} events loaded.`);
      return data;
    },
    forceRefresh
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchItemsByRarity(rarity, { forceRefresh = false } = {}) {
  const items = await fetchItems({ forceRefresh });
  return items.filter(item => item.rarity === rarity);
}

export async function fetchItemsByType(itemType, { forceRefresh = false } = {}) {
  const items = await fetchItems({ forceRefresh });
  return items.filter(item => item.item_type === itemType);
}

export async function fetchQuestsByTrader(traderName, { forceRefresh = false } = {}) {
  const quests = await fetchQuests({ forceRefresh });
  return quests.filter(q => q.trader_name === traderName);
}

export async function fetchActiveEvents({ forceRefresh = false } = {}) {
  const events = await fetchEventsSchedule({ forceRefresh });
  const now = Date.now();
  return events.filter(e => e.startTime <= now && now < e.endTime);
}

export async function fetchEventsByMap(mapName, { forceRefresh = false } = {}) {
  const events = await fetchEventsSchedule({ forceRefresh });
  return events.filter(e => e.map === mapName);
}

/**
 * Prefetch all endpoints in parallel and prime the cache.
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

  const results = await Promise.allSettled(endpoints.map(e => e.fn()));
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
