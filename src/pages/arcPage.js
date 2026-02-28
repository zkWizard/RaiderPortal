/**
 * arcPage.js
 *
 * Renders the detail page for a single ARC enemy.
 * The MetaForge API does not expose per-ARC loot tables, so loot data is
 * derived by cross-referencing items whose loot_area includes "ARC".
 * This gives a general list of ARC-enemy drops shared across all ARC types.
 */

import { fetchArcs } from '../services/metaforgeApi.js';

// ─── Utilities ────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function itemLink(id, name) {
  return `<a href="#/item/${encodeURIComponent(id)}">${esc(name)}</a>`;
}

function rarityClass(rarity) {
  return 'rarity-' + (rarity ?? 'common').toLowerCase().replace(/\s+/g, '-');
}

// ─── Loot table from arc.loot (requires includeLoot=true fetch) ─────────────

function buildLootTable(loot) {
  if (!loot?.length) {
    return `<p class="empty-note">No loot data available for this ARC.</p>`;
  }

  const rows = loot.map(({ item }) => {
    if (!item) return '';
    const rc       = rarityClass(item.rarity);
    const iconHtml = item.icon
      ? `<img class="er-icon" src="${esc(item.icon)}" alt="" loading="lazy"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <div class="er-icon-ph" style="display:none">📦</div>`
      : `<div class="er-icon-ph">📦</div>`;

    return `
      <div class="entity-row">
        ${iconHtml}
        <div class="er-info">
          <div class="er-name">${itemLink(item.id, item.name)}</div>
          <div class="er-sub">
            ${item.rarity ? `<span class="${rc}">${esc(item.rarity)}</span>` : ''}
            ${item.item_type ? ` · ${esc(item.item_type)}` : ''}
          </div>
        </div>
      </div>`;
  }).filter(Boolean).join('');

  return `<div class="entity-list">${rows}</div>`;
}

// ─── Main export ──────────────────────────────────────────────

export async function renderArc(id, container) {
  const arcs = await fetchArcs();

  const arc = arcs.find((a) => a.id === id);
  if (!arc) {
    container.innerHTML = `<div class="detail-not-found">ARC "<strong>${esc(id)}</strong>" not found.</div>`;
    return;
  }

  document.title = `${arc.name} — RaiderPortal`;

  const breadcrumb = `
    <nav class="detail-breadcrumb" aria-label="Breadcrumb">
      <a class="bc-link" href="#">Home</a>
      <span class="bc-sep">›</span>
      <span class="bc-cat">ARCs</span>
      <span class="bc-sep">›</span>
      <span class="bc-current">${esc(arc.name)}</span>
    </nav>`;

  const hero = `
    <div class="detail-hero">
      ${arc.icon
        ? `<div class="hero-icon-wrap">
             <img class="hero-icon" src="${esc(arc.icon)}" alt="" loading="eager"
                  onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
             <div class="hero-icon-placeholder" style="display:none">🤖</div>
           </div>`
        : `<div class="hero-icon-wrap"><div class="hero-icon-placeholder">🤖</div></div>`}
      <div class="hero-meta">
        <div class="hero-badges">
          <span class="hero-badge arc">ARC</span>
        </div>
        <h1 class="hero-name">${esc(arc.name)}</h1>
      </div>
    </div>`;

  // Full-resolution artwork
  const artwork = arc.image
    ? `<img class="detail-artwork" src="${esc(arc.image)}" alt="${esc(arc.name)} artwork" loading="lazy"
            onerror="this.remove()">`
    : '';

  const descriptionSection = arc.description ? `
    <div class="detail-section">
      <div class="section-title">Description</div>
      <p class="detail-description">${esc(arc.description)}</p>
    </div>` : '';

  const lootSection = `
    <div class="detail-section">
      <div class="section-title">Drops</div>
      ${buildLootTable(arc.loot)}
    </div>`;

  container.innerHTML = `
    ${breadcrumb}
    ${hero}
    <div class="detail-full">
      ${artwork}
      ${descriptionSection}
      ${lootSection}
    </div>`;
}
