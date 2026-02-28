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
      const isBp = item.item_type === 'Blueprint' || item.item_type === 'Recipe';
      const iconUrl = isBp
        ? `https://cdn.metaforge.app/arc-raiders/icons/${item.id}.webp`
        : item.icon;
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

  // Group by trader_name (issuing NPC); quests without a trader go under "Other"
  const groups = new Map();
  for (const quest of quests) {
    const trader = quest.trader_name || 'Other';
    if (!groups.has(trader)) groups.set(trader, []);
    groups.get(trader).push(quest);
  }
  const sortedGroups = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([trader, list]) => [trader, [...list].sort((a, b) => a.name.localeCompare(b.name))]);

  let sectionsHtml = '';
  for (const [trader, list] of sortedGroups) {
    const rows = list.map((quest) => {
      const href = `#/quest/${encodeURIComponent(quest.id)}`;
      const iconHtml = quest.image
        ? `<img class="er-icon" src="${esc(quest.image)}" alt="" loading="lazy"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
           <div class="er-icon-ph" style="display:none">📜</div>`
        : `<div class="er-icon-ph">📜</div>`;
      const objCount = quest.objectives?.length ?? 0;
      return `
        <div class="entity-row">
          ${iconHtml}
          <div class="er-info">
            <div class="er-name"><a href="${esc(href)}">${esc(quest.name)}</a></div>
            <div class="er-sub">
              ${objCount ? `${objCount} objective${objCount !== 1 ? 's' : ''}` : 'No objectives listed'}
              ${quest.xp ? ` · ${quest.xp.toLocaleString()} XP` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    sectionsHtml += `
      <div class="detail-section">
        <div class="section-title">
          ${esc(trader)}<span class="list-count">${list.length}</span>
        </div>
        <div class="entity-list">${rows}</div>
      </div>`;
  }

  container.innerHTML = `
    <div class="page-quest">
      <div class="detail-banner">
        ${breadcrumb('Quests')}
        ${bannerHeader('Quests', `${quests.length.toLocaleString()} quests`)}
      </div>
      <div class="list-body detail-full">
        ${sectionsHtml}
      </div>
    </div>`;
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
