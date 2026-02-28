/**
 * listPages.js
 *
 * Renders index/listing pages for every nav category.
 * Routes: #/items  #/quests  #/arc  #/traders  #/events
 */

import { fetchItems, fetchArcs, fetchQuests, fetchTraders } from '../services/metaforgeApi.js';
import { normalizeBaseName, nameToSlug } from '../services/searchIndex.js';

// ─── Utilities ────────────────────────────────────────────────

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

export async function renderItemsList(container) {
  const items = await fetchItems();
  document.title = 'Items — RaiderPortal';

  // Group by item_type (α-sorted); items within each group α-sorted by name
  const groups = new Map();
  for (const item of items) {
    const cat = item.item_type || 'Other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(item);
  }
  const sortedGroups = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cat, list]) => [cat, [...list].sort((a, b) => a.name.localeCompare(b.name))]);

  let sectionsHtml = '';
  for (const [cat, list] of sortedGroups) {
    const rows = list.map((item) => {
      const iconUrl = item.icon;
      const iconHtml = iconUrl
        ? `<img class="er-icon" src="${esc(iconUrl)}" alt="" loading="lazy"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
           <div class="er-icon-ph" style="display:none">📦</div>`
        : `<div class="er-icon-ph">📦</div>`;
      const rc  = rarityClass(item.rarity);
      const href = `#/item/${encodeURIComponent(nameToSlug(normalizeBaseName(item.name)))}`;
      return `
        <div class="entity-row">
          ${iconHtml}
          <div class="er-info">
            <div class="er-name"><a href="${esc(href)}">${esc(item.name)}</a></div>
            <div class="er-sub">
              ${item.rarity ? `<span class="${rc}">${esc(item.rarity)}</span>` : ''}
              ${item.value  ? ` · ${item.value.toLocaleString()} RC` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    sectionsHtml += `
      <div class="detail-section">
        <div class="section-title">
          ${esc(cat)}<span class="list-count">${list.length}</span>
        </div>
        <div class="entity-list">${rows}</div>
      </div>`;
  }

  container.innerHTML = `
    <div class="page-item">
      <div class="detail-banner">
        ${breadcrumb('Items')}
        ${bannerHeader('Items', `${items.length.toLocaleString()} items across ${sortedGroups.length} categories`)}
      </div>
      <div class="list-body">
        ${sectionsHtml}
      </div>
    </div>`;
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

  const cards = sorted.map((name) => {
    const inventory = tradersData[name] ?? [];
    const href = `#/trader/${encodeURIComponent(name.toLowerCase())}`;
    return `
      <a class="entity-card" href="${esc(href)}">
        <div class="ec-icon-ph">🧑‍💼</div>
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
