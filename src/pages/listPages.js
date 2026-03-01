/**
 * listPages.js
 *
 * Renders index/listing pages for every nav category.
 * Routes: #/items  #/quests  #/arc  #/traders  #/events
 */

import { fetchItems, fetchArcs, fetchQuests, fetchTraders } from '../services/metaforgeApi.js';
import { normalizeBaseName, nameToSlug } from '../services/searchIndex.js';

// ─── Utilities ────────────────────────────────────────────────

function traderAvatar(name, sizeClass) {
  const slug = name.toLowerCase().replace(/\s+/g, '');
  const caps = name.match(/[A-Z]/g);
  const initials = caps && caps.length >= 2 ? caps.slice(0, 2).join('') : name.slice(0, 2).toUpperCase();
  return `<div class="trader-avatar ${sizeClass} trader-avatar--${slug}" aria-hidden="true">${initials}</div>`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rarityClass(rarity) {
  return 'rarity-' + (rarity ?? 'common').toLowerCase().replace(/\s+/g, '-');
}

function breadcrumb(label) {
  return `
    <nav class="detail-breadcrumb" aria-label="Breadcrumb">
      <a class="bc-link" href="#">Home</a>
      <span class="bc-sep">›</span>
      <span class="bc-current">${esc(label)}</span>
    </nav>`;
}

function bannerHeader(title, sub) {
  return `
    <div>
      <h1 class="unified-title">${esc(title)}</h1>
      ${sub ? `<p class="hero-sub" style="margin-top:6px">${esc(sub)}</p>` : ''}
    </div>`;
}

// ─── Items ─────────────────────────────────────────────────────

const RARITY_RANK = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };

// Maps exact API item_type values (lowercased) to one of the 6 display buckets.
// Based on the real item_type values observed in the MetaForge API (see data-audit.md).
// Returns null for types that don't belong in any bucket — those items still appear
// under "All" but are hidden when any specific filter is active.
const BUCKET_MAP = new Map([
  // ── Weapons ────────────────────────────────────────────
  ['weapon',            'Weapons'],
  // ── Attachments ────────────────────────────────────────
  ['modification',      'Attachments'],
  ['mods',              'Attachments'],
  // ── Consumables ────────────────────────────────────────
  ['quick use',         'Consumables'],
  ['consumable',        'Consumables'],
  // ── Materials ──────────────────────────────────────────
  ['topside material',  'Materials'],
  ['refined material',  'Materials'],
  ['basic material',    'Materials'],
  ['advanced material', 'Materials'],
  ['material',          'Materials'],
  // ── Blueprints ─────────────────────────────────────────
  ['blueprint',         'Blueprints'],
  // ── Armor ──────────────────────────────────────────────
  ['shield',            'Armor'],
]);

// Tracks item_type values seen that don't map to any bucket (logged once each).
const _loggedUncategorized = new Set();

// Returns the bucket name for an item_type, or null if uncategorized.
function getBucket(itemType) {
  if (!itemType) return null;
  const key = itemType.toLowerCase().trim();
  const bucket = BUCKET_MAP.get(key) ?? null;
  if (bucket === null && !_loggedUncategorized.has(itemType)) {
    console.log(`[Items] Uncategorized item_type: "${itemType}"`);
    _loggedUncategorized.add(itemType);
  }
  return bucket;
}

const BUCKET_LABELS = ['Weapons', 'Attachments', 'Consumables', 'Materials', 'Blueprints', 'Armor'];

export async function renderItemsList(container) {
  const items = await fetchItems();
  document.title = 'Items — RaiderPortal';

  // ── Filter bar ────────────────────────────────────────────────
  const filterBar = `
    <div class="item-filter-bar">
      <div class="item-filter-top">
        <div class="item-search-wrap">
          <svg class="item-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input id="itemSearch" class="item-search" type="search"
                 placeholder="Search items…" autocomplete="off" spellcheck="false"
                 aria-label="Search items"/>
        </div>
        <div class="item-sort-wrap">
          <select id="itemSort" class="item-sort" aria-label="Sort items">
            <option value="name-asc">Name A→Z</option>
            <option value="name-desc">Name Z→A</option>
            <option value="rarity-desc" selected>Rarity: High→Low</option>
            <option value="rarity-asc">Rarity: Low→High</option>
            <option value="value-desc">Value: High→Low</option>
            <option value="value-asc">Value: Low→High</option>
          </select>
        </div>
      </div>
      <div class="item-filter-pills" id="itemFilterPills">
        <button class="if-pill active" data-bucket="">All</button>
        ${BUCKET_LABELS.map((b) => `<button class="if-pill" data-bucket="${b}">${b}</button>`).join('')}
      </div>
    </div>`;

  // ── Group items by base slug (collapses tiers/blueprints) ─────
  //    e.g. "Anvil I", "Anvil II", "Anvil Blueprint" → slug "anvil"
  const groupMap = new Map(); // slug → { slug, baseName, items[] }
  for (const item of items) {
    const baseName = normalizeBaseName(item.name);
    const slug     = nameToSlug(baseName);
    if (!groupMap.has(slug)) groupMap.set(slug, { slug, baseName, items: [] });
    groupMap.get(slug).items.push(item);
  }

  // Numeric tier rank for an item name (higher = later tier).
  // Blueprints/Recipes return -1 so they're never chosen as representative.
  function tierIdx(name) {
    const n = name.trim();
    if (/\bBlueprint\b/i.test(n) || /\bRecipe\b/i.test(n)) return -1;
    const rv = n.match(/\s+(I{1,3}|IV|V)$/i);
    if (rv) return { I: 0, II: 1, III: 2, IV: 3, V: 4 }[rv[1].toUpperCase()] ?? 0;
    const mk  = n.match(/\s+[Mm][Kk]\.\s*(\d+)/);
    if (mk)  return parseInt(mk[1], 10) - 1;
    const num = n.match(/\s+(\d+)$/);
    if (num) return parseInt(num[1], 10) - 1;
    return 0; // base / single item
  }

  // Pick the highest-tier non-blueprint/recipe item as representative.
  // Its rarity is what we display on the card.
  function pickRep(groupItems) {
    const nonBP     = groupItems.filter(
      (i) => !['blueprint', 'recipe'].includes((i.item_type ?? '').toLowerCase())
    );
    const candidates = nonBP.length ? nonBP : groupItems;
    return candidates.reduce((best, cur) =>
      tierIdx(cur.name) > tierIdx(best.name) ? cur : best
    );
  }

  // ── Card builder (one card per group) ─────────────────────────
  function buildGroupCard({ slug, baseName, items: g }) {
    const rep        = pickRep(g);
    const href       = `#/item/${encodeURIComponent(slug)}`;
    const rarity     = rep.rarity ?? 'Common'; // rarity of the highest tier
    const bucket     = getBucket(rep.item_type);
    const maxValue   = Math.max(...g.map((i) => i.value ?? 0));
    const weight     = rep.stat_block?.weight;

    const iconHtml = rep.icon
      ? `<img class="ic-icon" src="${esc(rep.icon)}" alt="" loading="lazy"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <div class="ic-icon-ph" style="display:none">📦</div>`
      : `<div class="ic-icon-ph">📦</div>`;

    const tierBadge = g.length > 1
      ? `<span class="ic-tier-badge">${g.length} tiers</span>`
      : '';

    const metaParts = [];
    if (maxValue) metaParts.push(`${maxValue.toLocaleString()} RC`);
    if (weight)   metaParts.push(`${weight} kg`);

    return `
      <a class="item-card" href="${esc(href)}"
         data-name="${esc(baseName.toLowerCase())}"
         data-bucket="${esc(bucket)}"
         data-rarity="${esc(rarity)}"
         data-value="${maxValue}">
        <div class="ic-icon-wrap">
          ${iconHtml}
          ${tierBadge}
        </div>
        <div class="ic-body">
          <div class="ic-name">${esc(baseName)}</div>
          <div class="ic-footer">
            ${rep.item_type ? `<span class="ic-cat">${esc(rep.item_type)}</span>` : ''}
            <span class="ic-rarity">${esc(rarity)}</span>
          </div>
          ${metaParts.length ? `<div class="ic-meta">${metaParts.join(' · ')}</div>` : ''}
        </div>
      </a>`;
  }

  // Initial render: rarity desc (Legendary first), then name A→Z within each rarity
  const groups = [...groupMap.values()].sort((a, b) => {
    const aRar = RARITY_RANK[pickRep(a.items).rarity] ?? 0;
    const bRar = RARITY_RANK[pickRep(b.items).rarity] ?? 0;
    if (bRar !== aRar) return bRar - aRar;
    return a.baseName.localeCompare(b.baseName);
  });
  const initialCards = groups.map(buildGroupCard).join('');

  container.innerHTML = `
    <div class="page-item">
      <div class="detail-banner">
        ${breadcrumb('Items')}
        ${bannerHeader('Items', `${groups.length.toLocaleString()} items · ${items.length.toLocaleString()} variants`)}
      </div>
      <div class="list-body">
        ${filterBar}
        <div class="item-grid" id="itemGrid">
          ${initialCards}
          <p class="item-empty-msg" id="itemNoResults" style="display:none">No items match your filter.</p>
        </div>
      </div>
    </div>`;

  // ── Interactive logic ─────────────────────────────────────────
  const searchEl    = container.querySelector('#itemSearch');
  const sortEl      = container.querySelector('#itemSort');
  const pillsEl     = container.querySelector('#itemFilterPills');
  const gridEl      = container.querySelector('#itemGrid');
  const noResultsEl = container.querySelector('#itemNoResults');
  let activeBucket  = '';  // '' = All

  function applyFilter() {
    const q = searchEl.value.trim().toLowerCase();
    let visible = 0;
    for (const card of gridEl.querySelectorAll('.item-card')) {
      const show = (!q || card.dataset.name.includes(q))
                && (!activeBucket || card.dataset.bucket === activeBucket);
      // Use inline style — overrides display:flex in author stylesheet
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    }
    noResultsEl.style.display = visible > 0 ? 'none' : '';
  }

  function applySort() {
    const val   = sortEl.value;
    const cards = [...gridEl.querySelectorAll('.item-card')];
    cards.sort((a, b) => {
      switch (val) {
        case 'name-asc':    return a.dataset.name.localeCompare(b.dataset.name);
        case 'name-desc':   return b.dataset.name.localeCompare(a.dataset.name);
        case 'rarity-asc':  return (RARITY_RANK[a.dataset.rarity] ?? 99) - (RARITY_RANK[b.dataset.rarity] ?? 99);
        case 'rarity-desc': return (RARITY_RANK[b.dataset.rarity] ?? 99) - (RARITY_RANK[a.dataset.rarity] ?? 99);
        case 'value-asc':   return Number(a.dataset.value) - Number(b.dataset.value);
        case 'value-desc':  return Number(b.dataset.value) - Number(a.dataset.value);
        default:            return 0;
      }
    });
    for (const card of cards) gridEl.insertBefore(card, noResultsEl);
    applyFilter();
  }

  searchEl.addEventListener('input', applyFilter);
  sortEl.addEventListener('change', applySort);

  pillsEl.addEventListener('click', (e) => {
    const pill = e.target.closest('.if-pill');
    if (!pill) return;
    const bucket = pill.dataset.bucket;
    // Toggle: clicking the active bucket deselects it (returns to All)
    activeBucket = activeBucket === bucket ? '' : bucket;
    for (const p of pillsEl.querySelectorAll('.if-pill')) {
      p.classList.toggle('active', p.dataset.bucket === activeBucket);
    }
    applyFilter();
  });
}

// ─── Quests ────────────────────────────────────────────────────

export async function renderQuestsList(container) {
  const quests = await fetchQuests();
  document.title = 'Quests — RaiderPortal';

  // Alphabetical order
  const sorted = [...quests].sort((a, b) => a.name.localeCompare(b.name));

  // Unique trader names for filter pills
  const traders = [...new Set(quests.map((q) => q.trader_name).filter(Boolean))].sort();

  // Filter bar — search + trader pills
  const filterBar = `
    <div class="quest-filter-bar">
      <input id="questSearch" class="quest-search" type="search"
             placeholder="Search quests…" autocomplete="off" spellcheck="false"
             aria-label="Search quests"/>
      <div class="quest-filter-pills" id="questFilterPills">
        <button class="qf-pill active" data-trader="">All</button>
        ${traders.map((t) => `<button class="qf-pill" data-trader="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
    </div>`;

  // Builds a thumbnail row (required / rewards)
  function iconRow(entries, label) {
    if (!entries?.length) return '';
    const shown    = entries.slice(0, 3);
    const overflow = entries.length - shown.length;
    const icons = shown.map(({ item }) => {
      if (!item) return '';
      return item.icon
        ? `<img class="qc-item-icon" src="${esc(item.icon)}" alt=""
                title="${esc(item.name)}" loading="lazy"
                onerror="this.style.display='none'">`
        : `<div class="qc-item-ph" title="${esc(item.name)}">📦</div>`;
    }).filter(Boolean).join('');
    if (!icons) return '';
    const more = overflow > 0 ? `<span class="qc-item-overflow">+${overflow}</span>` : '';
    return `
      <div class="qc-items-row">
        <span class="qc-items-label">${esc(label)}</span>
        ${icons}${more}
      </div>`;
  }

  const cards = sorted.map((quest) => {
    const href = `#/quest/${encodeURIComponent(quest.id)}`;

    // Dimmed artwork banner
    const headerHtml = quest.image
      ? `<img class="qc-header-img" src="${esc(quest.image)}" alt="" loading="lazy"
              onerror="this.style.display='none'">
         <div class="qc-header-placeholder">📜</div>`
      : `<div class="qc-header-placeholder">📜</div>`;

    const traderBadge = quest.trader_name
      ? `<span class="qc-trader-badge">${esc(quest.trader_name)}</span>`
      : '';

    // First objective as preview text
    const objectivePreview = quest.objectives?.[0]
      ? `<p class="qc-objective">${esc(quest.objectives[0])}</p>`
      : '';

    const reqRow    = iconRow(quest.required_items, 'Needs');
    const rewardRow = iconRow(quest.rewards,         'Rewards');

    // Footer left: XP if known, otherwise objective count
    const objCount  = quest.objectives?.length ?? 0;
    const footerLeft = quest.xp
      ? `<span class="qc-xp">⚡ ${quest.xp.toLocaleString()} XP</span>`
      : objCount
        ? `<span class="qc-obj-count">${objCount} objective${objCount !== 1 ? 's' : ''}</span>`
        : '';

    return `
      <a class="quest-card" href="${esc(href)}"
         data-name="${esc(quest.name.toLowerCase())}"
         data-trader="${esc(quest.trader_name ?? '')}">
        <div class="qc-header">
          ${headerHtml}
          ${traderBadge}
        </div>
        <div class="qc-body">
          <div class="qc-name">${esc(quest.name)}</div>
          ${objectivePreview}
          ${reqRow}
          ${rewardRow}
        </div>
        <div class="qc-footer">
          ${footerLeft}
          <span class="qc-arrow">→</span>
        </div>
      </a>`;
  }).join('');

  container.innerHTML = `
    <div class="page-quest">
      <div class="detail-banner">
        ${breadcrumb('Quests')}
        ${bannerHeader('Quests', `${quests.length.toLocaleString()} quests`)}
      </div>
      <div class="list-body">
        ${filterBar}
        <div class="quest-grid" id="questGrid">
          ${cards || '<p class="quest-empty-msg">No quests found.</p>'}
          <p class="quest-empty-msg" id="questNoResults" hidden>No quests match your filter.</p>
        </div>
      </div>
    </div>`;

  // ── Filter logic ────────────────────────────────────────────
  const searchEl    = container.querySelector('#questSearch');
  const pillsEl     = container.querySelector('#questFilterPills');
  const gridEl      = container.querySelector('#questGrid');
  const noResultsEl = container.querySelector('#questNoResults');
  let activeTrader  = '';

  function applyFilter() {
    const q = searchEl.value.trim().toLowerCase();
    let visible = 0;
    for (const card of gridEl.querySelectorAll('.quest-card')) {
      const show = (!q || card.dataset.name.includes(q))
                && (!activeTrader || card.dataset.trader === activeTrader);
      card.hidden = !show;
      if (show) visible++;
    }
    noResultsEl.hidden = visible > 0;
  }

  searchEl.addEventListener('input', applyFilter);

  pillsEl.addEventListener('click', (e) => {
    const pill = e.target.closest('.qf-pill');
    if (!pill) return;
    activeTrader = pill.dataset.trader;
    for (const p of pillsEl.querySelectorAll('.qf-pill')) p.classList.toggle('active', p === pill);
    applyFilter();
  });
}

// ─── ARC ───────────────────────────────────────────────────────

export async function renderArcsList(container) {
  const arcs = await fetchArcs();
  document.title = 'ARC Enemies — RaiderPortal';

  const sorted = [...arcs].sort((a, b) => a.name.localeCompare(b.name));

  const cards = sorted.map((arc) => {
    const href = `#/arc/${encodeURIComponent(arc.id)}`;
    const iconHtml = arc.icon
      ? `<img class="ec-icon" src="${esc(arc.icon)}" alt="" loading="lazy"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <div class="ec-icon-ph" style="display:none">🤖</div>`
      : `<div class="ec-icon-ph">🤖</div>`;
    return `
      <a class="entity-card" href="${esc(href)}">
        ${iconHtml}
        <div class="ec-name">${esc(arc.name)}</div>
      </a>`;
  }).join('');

  container.innerHTML = `
    <div class="page-arc">
      <div class="detail-banner">
        ${breadcrumb('ARC')}
        ${bannerHeader('ARC Enemies', `${arcs.length.toLocaleString()} enemies`)}
      </div>
      <div class="list-body detail-full">
        <div class="entity-grid">
          ${cards || '<p class="empty-note">No ARC enemies found.</p>'}
        </div>
      </div>
    </div>`;
}

// ─── Traders ───────────────────────────────────────────────────

export async function renderTradersList(container) {
  const tradersData = await fetchTraders();
  document.title = 'Traders — RaiderPortal';

  const sorted = Object.keys(tradersData).sort((a, b) => a.localeCompare(b));

  // MetaForge /traders returns only item arrays — no trader portrait fields; CDN paths return 404.
  console.info('[RaiderPortal] No trader portrait assets available from MetaForge CDN — using initials avatars.');

  const cards = sorted.map((name) => {
    const inventory = tradersData[name] ?? [];
    const href = `#/trader/${encodeURIComponent(name.toLowerCase())}`;
    return `
      <a class="entity-card" href="${esc(href)}">
        ${traderAvatar(name, 'avatar-card')}
        <div class="ec-name">${esc(name)}</div>
        <div class="ec-sub">${inventory.length} item${inventory.length !== 1 ? 's' : ''} in stock</div>
      </a>`;
  }).join('');

  container.innerHTML = `
    <div class="page-trader">
      <div class="detail-banner">
        ${breadcrumb('Traders')}
        ${bannerHeader('Traders', `${sorted.length} traders`)}
      </div>
      <div class="list-body detail-full">
        <div class="entity-grid entity-grid--traders">
          ${cards || '<p class="empty-note">No traders found.</p>'}
        </div>
      </div>
    </div>`;
}

// ─── Maps ──────────────────────────────────────────────────────

const CDN = 'https://cdn.metaforge.app/arc-raiders/ui';

const MAPS = [
  {
    id:    'dam',
    name:  'Dam Battlegrounds',
    image: `${CDN}/dambattlegrounds2.webp`,
    desc:  'The Alcantara Power Plant, a toxic waterlogged stronghold and hotspot for ARC skirmishes.',
  },
  {
    id:    'spaceport',
    name:  'Spaceport',
    image: `${CDN}/spaceport2.webp`,
    desc:  'Where the Exodus shuttles once launched, now a multi-level combat zone.',
  },
  {
    id:    'buried-city',
    name:  'Buried City',
    image: `${CDN}/buriecity2.webp`,
    desc:  'An arid wasteland with remnants of old world streets and plazas.',
  },
  {
    id:    'blue-gate',
    name:  'Blue Gate',
    image: `${CDN}/blue-gate2.webp`,
    desc:  'A daunting entryway into perilous mountain ranges with underground tunnels.',
  },
  {
    id:    'stella-montis',
    name:  'Stella Montis',
    image: `${CDN}/stella-montis2.webp`,
    desc:  'A vast abandoned research facility carved deep into the northern mountains.',
  },
];

export function renderMapsList(container) {
  document.title = 'Maps — RaiderPortal';

  const cards = MAPS.map((map) => `
    <a class="map-card" href="#/map/${esc(map.id)}">
      <div class="map-card-img-wrap">
        <img class="map-card-img" src="${esc(map.image)}" alt="${esc(map.name)}" loading="lazy"
             onerror="this.parentElement.classList.add('map-card-img-err')">
      </div>
      <div class="map-card-body">
        <h2 class="map-card-name">${esc(map.name)}</h2>
        <p class="map-card-desc">${esc(map.desc)}</p>
      </div>
    </a>`).join('');

  container.innerHTML = `
    <div class="page-maps">
      <div class="detail-banner">
        ${breadcrumb('Maps')}
        ${bannerHeader('Maps', '5 playable locations')}
      </div>
      <div class="list-body detail-full">
        <div class="map-card-grid">${cards}</div>
      </div>
    </div>`;
}

// ─── Events ────────────────────────────────────────────────────

export async function renderEventsList(container) {
  document.title = 'Events — RaiderPortal';

  container.innerHTML = `
    <div class="page-events">
      <div class="detail-banner">
        ${breadcrumb('Events')}
        ${bannerHeader('Events')}
      </div>
      <div class="list-body detail-full">
        <div class="events-placeholder">
          <div class="events-placeholder-icon">📅</div>
          <div class="events-placeholder-title">No active events</div>
          <div class="events-placeholder-body">
            Event data isn't available in the current API. Check back after the next patch.
          </div>
        </div>
      </div>
    </div>`;
}
