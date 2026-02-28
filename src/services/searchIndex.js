/**
 * searchIndex.js
 *
 * Builds and searches a flat in-memory index of all searchable game entities
 * sourced from the MetaForge API: items, ARC enemies, quests, and traders.
 *
 * Usage:
 *   import { buildIndex, search, getIndexState } from './searchIndex.js';
 *
 *   // Call once at app load — safe to call multiple times (builds only once).
 *   await buildIndex();
 *
 *   // Call synchronously during user input.
 *   const results = search('barricade');
 */

import {
  fetchItems,
  fetchArcs,
  fetchQuests,
  fetchTraders,
} from './metaforgeApi.js';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single searchable entry in the index.
 *
 * @typedef {Object} IndexEntry
 * @property {string}       id        Unique identifier (slug from the API)
 * @property {string}       name      Display name
 * @property {'item'|'arc'|'quest'|'trader'} type  Entity category
 * @property {string|null}  icon      CDN icon URL (null if unavailable)
 * @property {string|null}  rarity    Rarity tier for items; null for others
 * @property {string|null}  category  item_type for items; trader_name for quests; null otherwise
 */

/**
 * @typedef {'idle'|'loading'|'ready'|'error'} IndexState
 */

/**
 * @typedef {Object} SearchResult
 * @property {IndexEntry}  entry
 * @property {number}      score  Lower = better match (0 = exact, 1 = prefix, 2 = word-prefix, 3 = contains)
 */

// ─────────────────────────────────────────────────────────────────────────────
// MODULE STATE  (session-scoped, never persisted)
// ─────────────────────────────────────────────────────────────────────────────

/** @type {IndexEntry[]} */
let _index = [];

/** @type {IndexState} */
let _state = 'idle';

/** @type {Error|null} */
let _error = null;

/**
 * Singleton promise — concurrent calls to buildIndex() share the same fetch.
 * @type {Promise<IndexEntry[]>|null}
 */
let _buildPromise = null;

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZERS — map raw API shapes to flat IndexEntry objects
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {import('./metaforgeApi.js').Item[]} items
 * @returns {IndexEntry[]}
 */
function normalizeItems(items) {
  return items.map((item) => ({
    id:       item.id,
    name:     item.name,
    type:     'item',
    icon:     item.icon ?? null,
    rarity:   item.rarity ?? null,
    category: item.item_type ?? null,
  }));
}

/**
 * @param {import('./metaforgeApi.js').Arc[]} arcs
 * @returns {IndexEntry[]}
 */
function normalizeArcs(arcs) {
  return arcs.map((arc) => ({
    id:       arc.id,
    name:     arc.name,
    type:     'arc',
    icon:     arc.icon ?? null,
    rarity:   null,
    category: null,
  }));
}

/**
 * Quests have no `icon` field — `image` (full-resolution artwork) is used instead.
 *
 * @param {import('./metaforgeApi.js').Quest[]} quests
 * @returns {IndexEntry[]}
 */
function normalizeQuests(quests) {
  return quests.map((quest) => ({
    id:       quest.id,
    name:     quest.name,
    type:     'quest',
    icon:     quest.image ?? null,
    rarity:   null,
    category: quest.trader_name ?? null,  // which NPC gives the quest
  }));
}

/**
 * Indexes the five trader NPCs as entities.
 *
 * The traders API returns `{ TraderName: Item[] }` — the items in each
 * trader's inventory are already covered by the items index, so only the
 * trader NPCs themselves are added here to avoid duplicates.
 *
 * Traders have no dedicated icon endpoint. `icon` is set to null.
 *
 * @param {import('./metaforgeApi.js').TradersData} tradersData
 * @returns {IndexEntry[]}
 */
function normalizeTraders(tradersData) {
  return Object.keys(tradersData).map((name) => ({
    id:       name.toLowerCase(),
    name,
    type:     'trader',
    icon:     null,
    rarity:   null,
    category: null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Performs the actual fetch + normalize + merge.
 * Not exported — call buildIndex() instead.
 *
 * @param {boolean} forceRefresh  Passed through to the API layer's localStorage cache.
 * @returns {Promise<IndexEntry[]>}
 */
async function _doBuild(forceRefresh) {
  _state = 'loading';
  _error = null;

  // Fetch all four endpoints in parallel. Each independently falls back to
  // localStorage cache via metaforgeApi, so a single failing endpoint won't
  // block the others.
  const [itemsResult, arcsResult, questsResult, tradersResult] =
    await Promise.allSettled([
      fetchItems({ forceRefresh }),
      fetchArcs({ forceRefresh }),
      fetchQuests({ forceRefresh }),
      fetchTraders({ forceRefresh }),
    ]);

  // Warn on partial failures — still index what succeeded.
  const warn = (label, reason) =>
    console.warn(`[searchIndex] ${label} failed, skipping:`, reason?.message ?? reason);

  const entries = [
    ...(itemsResult.status   === 'fulfilled' ? normalizeItems(itemsResult.value)     : (warn('items',   itemsResult.reason),   [])),
    ...(arcsResult.status    === 'fulfilled' ? normalizeArcs(arcsResult.value)       : (warn('arcs',    arcsResult.reason),    [])),
    ...(questsResult.status  === 'fulfilled' ? normalizeQuests(questsResult.value)   : (warn('quests',  questsResult.reason),  [])),
    ...(tradersResult.status === 'fulfilled' ? normalizeTraders(tradersResult.value) : (warn('traders', tradersResult.reason), [])),
  ];

  _index = entries;
  _state = 'ready';

  return _index;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: BUILD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the search index by fetching all four endpoints, then caches the
 * result in memory for the lifetime of the session.
 *
 * Safe to call multiple times — subsequent calls return the already-built
 * index immediately without re-fetching. Concurrent calls during an in-progress
 * build share the same Promise.
 *
 * @param {{ forceRefresh?: boolean }} [opts]
 *   forceRefresh: bypass both the in-memory index and the localStorage API cache.
 * @returns {Promise<IndexEntry[]>}  The completed flat index.
 */
export async function buildIndex({ forceRefresh = false } = {}) {
  // Already built and not forcing — return instantly.
  if (_state === 'ready' && !forceRefresh) {
    return _index;
  }

  // Force rebuild: discard any prior singleton promise.
  if (forceRefresh) {
    _buildPromise = null;
    _index = [];
  }

  // Already in flight — return the same promise (no duplicate requests).
  if (_buildPromise) {
    return _buildPromise;
  }

  _buildPromise = _doBuild(forceRefresh).catch((err) => {
    _state = 'error';
    _error = err instanceof Error ? err : new Error(String(err));
    _buildPromise = null; // allow retry on next call
    throw _error;
  });

  return _buildPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if any whitespace-delimited word in `nameLower` starts with `queryLower`.
 * Used for the word-boundary tier between prefix and contains.
 *
 * "Advanced ARC Powercell" + "arc"  → true  (word "arc..." exists)
 * "Barricade Kit"          + "arc"  → false (no word starts with "arc")
 *
 * @param {string} nameLower
 * @param {string} queryLower
 * @returns {boolean}
 */
function anyWordStartsWith(nameLower, queryLower) {
  // Skip the first word — if the whole name starts with the query, it was
  // already caught by the prefix tier (score 1).
  const spaceIndex = nameLower.indexOf(' ');
  if (spaceIndex === -1) return false;   // single-word name, already handled

  let wordStart = spaceIndex + 1;
  while (wordStart < nameLower.length) {
    const nextSpace = nameLower.indexOf(' ', wordStart);
    const wordEnd = nextSpace === -1 ? nameLower.length : nextSpace;
    const wordLen = wordEnd - wordStart;

    if (
      wordLen >= queryLower.length &&
      nameLower.startsWith(queryLower, wordStart)
    ) {
      return true;
    }

    if (nextSpace === -1) break;
    wordStart = nextSpace + 1;
  }
  return false;
}

/**
 * Scores how well a lowercased name matches a lowercased query.
 *
 * Score tiers (lower = better):
 *   0 — exact match
 *   1 — name starts with query (prefix)
 *   2 — any subsequent word in name starts with query (word-boundary prefix)
 *   3 — name contains query anywhere
 *   Infinity — no match
 *
 * @param {string} nameLower  Pre-lowercased entry name
 * @param {string} queryLower Pre-lowercased search query
 * @returns {number}
 */
function scoreMatch(nameLower, queryLower) {
  if (nameLower === queryLower)                     return 0;
  if (nameLower.startsWith(queryLower))             return 1;
  if (anyWordStartsWith(nameLower, queryLower))     return 2;
  if (nameLower.includes(queryLower))               return 3;
  return Infinity;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: SEARCH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Searches the in-memory index and returns ranked matches.
 *
 * Ranking (best → worst):
 *   1. Exact name match
 *   2. Name begins with the query
 *   3. Any interior word of the name begins with the query
 *   4. Name contains the query anywhere
 *   Within each tier, results are sorted A → Z by name.
 *
 * The index must be built before calling this. If it isn't, an empty array is
 * returned and a console warning is emitted — this lets UI components call
 * search() without crashing during the loading window.
 *
 * @param {string} query  Raw search string from the user.
 * @param {{ limit?: number, type?: 'item'|'arc'|'quest'|'trader' }} [opts]
 *   limit — max results to return (default 50)
 *   type  — restrict results to a single entity type (optional)
 * @returns {IndexEntry[]}
 */
export function search(query, { limit = 50, type } = {}) {
  if (_state !== 'ready') {
    if (_state === 'loading') {
      console.warn('[searchIndex] search() called while index is still building.');
    } else {
      console.warn('[searchIndex] search() called before buildIndex().');
    }
    return [];
  }

  const q = query.trim().toLowerCase();
  if (!q) return [];

  /** @type {Array<{ entry: IndexEntry, score: number }>} */
  const scored = [];

  const pool = type ? _index.filter((e) => e.type === type) : _index;

  for (const entry of pool) {
    const s = scoreMatch(entry.name.toLowerCase(), q);
    if (s < Infinity) {
      scored.push({ entry, score: s });
    }
  }

  // Primary sort: score (lower = better).
  // Secondary sort: name A→Z within the same score tier.
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.entry.name.localeCompare(b.entry.name);
  });

  return scored.slice(0, limit).map((r) => r.entry);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current state of the index.
 *
 * @returns {{
 *   state: IndexState,
 *   size: number,
 *   breakdown: { items: number, arcs: number, quests: number, traders: number },
 *   error: Error|null,
 * }}
 */
export function getIndexState() {
  const breakdown = { items: 0, arcs: 0, quests: 0, traders: 0 };
  for (const entry of _index) {
    if (entry.type in breakdown) breakdown[entry.type]++;
  }
  return {
    state: _state,
    size:  _index.length,
    breakdown,
    error: _error,
  };
}

/**
 * Clears the in-memory index, allowing the next buildIndex() call to
 * rebuild from scratch (using the API layer's localStorage cache unless
 * forceRefresh is also passed).
 */
export function clearIndex() {
  _index = [];
  _state = 'idle';
  _error = null;
  _buildPromise = null;
}
