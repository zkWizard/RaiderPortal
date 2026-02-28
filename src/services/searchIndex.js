/**
 * src/services/searchIndex.js
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
 * A single searchable entry in the unified index.
 *
 * @typedef {Object} IndexEntry
 * @property {string}  id       Unique slug from the API
 * @property {string}  name     Display name
 * @property {string}  type     "Item" | "ARC" | "Quest" | "Trader"
 * @property {string}  subtype  Category/type label (item_type, "ARC Enemy", trader_name, "Trader")
 * @property {string}  rarity   Rarity tier; empty string if not applicable
 * @property {string}  icon     Full icon URL (guaranteed absolute https://); empty string if unavailable
 * @property {object}  rawData  The complete original API object for this entity
 */

/**
 * @typedef {'idle'|'loading'|'ready'|'error'} IndexState
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
// ICON NORMALIZER
// ─────────────────────────────────────────────────────────────────────────────

const CDN = 'https://cdn.metaforge.app';

/**
 * Ensures icon URLs are absolute.
 * API data is mostly full https:// already, but guard against relative paths.
 *
 * @param {string|null|undefined} raw
 * @returns {string}  Absolute URL, or empty string if unavailable
 */
function normalizeIcon(raw) {
  if (!raw) return '';
  if (raw.startsWith('https://') || raw.startsWith('http://')) return raw;
  // Relative path like "/arc-raiders/icons/foo.webp"
  return `${CDN}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZERS — map raw API shapes to flat IndexEntry objects
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object[]} items
 * @returns {IndexEntry[]}
 */
function normalizeItems(items) {
  return items.map((item) => ({
    id:      item.id,
    name:    item.name,
    type:    'Item',
    subtype: item.item_type ?? '',
    rarity:  item.rarity ?? '',
    icon:    normalizeIcon(item.icon),
    rawData: item,
  }));
}

/**
 * @param {object[]} arcs
 * @returns {IndexEntry[]}
 */
function normalizeArcs(arcs) {
  return arcs.map((arc) => ({
    id:      arc.id,
    name:    arc.name,
    type:    'ARC',
    subtype: 'ARC Enemy',
    rarity:  '',
    icon:    normalizeIcon(arc.icon),
    rawData: arc,
  }));
}

/**
 * Quests have no `icon` field — `image` (artwork) is used instead.
 *
 * @param {object[]} quests
 * @returns {IndexEntry[]}
 */
function normalizeQuests(quests) {
  return quests.map((quest) => ({
    id:      quest.id,
    name:    quest.name,
    type:    'Quest',
    subtype: quest.trader_name ?? '',  // which NPC gives the quest
    rarity:  '',
    icon:    normalizeIcon(quest.image),
    rawData: quest,
  }));
}

/**
 * Indexes the trader NPCs as entities.
 * The trader inventory items are already covered by normalizeItems.
 *
 * @param {object} tradersData  { TraderName: TraderItem[] }
 * @returns {IndexEntry[]}
 */
function normalizeTraders(tradersData) {
  return Object.keys(tradersData).map((name) => ({
    id:      name.toLowerCase(),
    name,
    type:    'Trader',
    subtype: 'Trader',
    rarity:  '',
    icon:    '',
    rawData: { name, inventory: tradersData[name] },
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD
// ─────────────────────────────────────────────────────────────────────────────

async function _doBuild(forceRefresh) {
  _state = 'loading';
  _error = null;

  const [itemsResult, arcsResult, questsResult, tradersResult] =
    await Promise.allSettled([
      fetchItems({ forceRefresh }),
      fetchArcs({ forceRefresh }),
      fetchQuests({ forceRefresh }),
      fetchTraders({ forceRefresh }),
    ]);

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

  const counts = { Item: 0, ARC: 0, Quest: 0, Trader: 0 };
  for (const e of entries) if (e.type in counts) counts[e.type]++;
  console.log(
    `[searchIndex] Built: ${entries.length} entries` +
    ` (${counts.Item} items, ${counts.ARC} ARCs, ${counts.Quest} quests, ${counts.Trader} traders)`
  );

  return _index;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: BUILD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the search index by fetching all four endpoints.
 * Safe to call multiple times — subsequent calls return immediately.
 * Concurrent calls during an in-progress build share the same Promise.
 *
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<IndexEntry[]>}
 */
export async function buildIndex({ forceRefresh = false } = {}) {
  if (_state === 'ready' && !forceRefresh) return _index;

  if (forceRefresh) {
    _buildPromise = null;
    _index = [];
  }

  if (_buildPromise) return _buildPromise;

  _buildPromise = _doBuild(forceRefresh).catch((err) => {
    _state = 'error';
    _error = err instanceof Error ? err : new Error(String(err));
    _buildPromise = null;
    throw _error;
  });

  return _buildPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if any whitespace-delimited word in `nameLower` starts with `queryLower`.
 * Checks ALL words including the first, so "gun" matches both "Gun Rack" (word 0)
 * and "Medium Gun Parts" (word 1).
 *
 * @param {string} nameLower
 * @param {string} queryLower
 * @returns {boolean}
 */
function anyWordStartsWith(nameLower, queryLower) {
  let wordStart = 0;
  while (wordStart < nameLower.length) {
    const nextSpace = nameLower.indexOf(' ', wordStart);
    const wordEnd = nextSpace === -1 ? nameLower.length : nextSpace;
    if (
      (wordEnd - wordStart) >= queryLower.length &&
      nameLower.startsWith(queryLower, wordStart)
    ) return true;
    if (nextSpace === -1) break;
    wordStart = nextSpace + 1;
  }
  return false;
}

/**
 * Scores how well a name matches a query. Higher score = better match.
 *
 * Tier 1 — Exact match            → 100
 * Tier 2 — Name starts with query → 75
 * Tier 3 — Any word starts with query → 50
 * Tier 4 — Name contains query anywhere → 25
 * No match → 0
 */
function scoreMatch(nameLower, queryLower) {
  if (nameLower === queryLower)                 return 100;
  if (nameLower.startsWith(queryLower))         return 75;
  if (anyWordStartsWith(nameLower, queryLower)) return 50;
  if (nameLower.includes(queryLower))           return 25;
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: SEARCH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Searches the in-memory index and returns ranked results.
 *
 * Ranking (best → worst):
 *   100 — Exact match
 *    75 — Name starts with query
 *    50 — Any word in name starts with query
 *    25 — Name contains query anywhere
 * Within each tier, results are sorted A→Z by name.
 *
 * Returns an empty array (no warning) if the query is fewer than 2 characters.
 *
 * @param {string} query  Raw search string from the user
 * @param {{ limit?: number, type?: 'Item'|'ARC'|'Quest'|'Trader' }} [opts]
 *   limit — max results (default 25)
 *   type  — restrict to a single entity type
 * @returns {IndexEntry[]}
 */
export function search(query, { limit = 25, type } = {}) {
  if (_state !== 'ready') {
    console.warn(
      _state === 'loading'
        ? '[searchIndex] search() called while index is still building.'
        : '[searchIndex] search() called before buildIndex().'
    );
    return [];
  }

  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const pool = type ? _index.filter((e) => e.type === type) : _index;
  const scored = [];

  for (const entry of pool) {
    const s = scoreMatch(entry.name.toLowerCase(), q);
    if (s > 0) scored.push({ entry, score: s });
  }

  // Higher score first; alphabetical tiebreaker within each tier
  scored.sort((a, b) =>
    a.score !== b.score ? b.score - a.score : a.entry.name.localeCompare(b.entry.name)
  );

  return scored.slice(0, limit).map((r) => r.entry);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current state of the index.
 *
 * @returns {{ state: IndexState, size: number, breakdown: object, error: Error|null }}
 */
export function getIndexState() {
  const breakdown = { Item: 0, ARC: 0, Quest: 0, Trader: 0 };
  for (const entry of _index) {
    if (entry.type in breakdown) breakdown[entry.type]++;
  }
  return { state: _state, size: _index.length, breakdown, error: _error };
}

/**
 * Clears the in-memory index, allowing the next buildIndex() call to rebuild.
 */
export function clearIndex() {
  _index = [];
  _state = 'idle';
  _error = null;
  _buildPromise = null;
}
