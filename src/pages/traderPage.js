/**
 * traderPage.js
 *
 * Renders the detail page for a trader NPC.
 * The trader ID in the URL is the lowercase trader name (e.g., "apollo").
 * Inventory items are cross-linked to their item detail pages.
 */

import { fetchTraders } from '../services/metaforgeApi.js';
import { normalizeBaseName, nameToSlug } from '../services/searchIndex.js';

// ─── Utilities ────────────────────────────────────────────────

// Derive a CSS slug + initials from a trader name (e.g. "TianWen" → "tianwen", "TW")
function traderMeta(name) {
  const slug = name.toLowerCase().replace(/\s+/g, '');
  // Initials: capital letters only (e.g. "TianWen" → "TW"); fallback to first two chars
  const caps = name.match(/[A-Z]/g);
  const initials = caps && caps.length >= 2 ? caps.slice(0, 2).join('') : name.slice(0, 2).toUpperCase();
  return { slug, initials };
}

function traderAvatar(name, sizeClass) {
  const { slug, initials } = traderMeta(name);
  return `<div class="trader-avatar ${sizeClass} trader-avatar--${slug}" aria-hidden="true">${initials}</div>`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function itemLink(id, name) {
  const slug = nameToSlug(normalizeBaseName(name));
  return `<a href="#/item/${encodeURIComponent(slug)}">${esc(name)}</a>`;
}

function rarityClass(rarity) {
  return 'rarity-' + (rarity ?? 'common').toLowerCase().replace(/\s+/g, '-');
}

// ─── Main export ──────────────────────────────────────────────

export async function renderTrader(id, container) {
  // id is lowercase trader name (e.g. "apollo")
  const tradersData = await fetchTraders();

  // Match case-insensitively against the keys (Apollo, Celeste, etc.)
  const traderName = Object.keys(tradersData).find(
    (name) => name.toLowerCase() === id.toLowerCase()
  );

  if (!traderName) {
    container.innerHTML = `<div class="detail-not-found">Trader "<strong>${esc(id)}</strong>" not found.</div>`;
    return;
  }

  const inventory = tradersData[traderName] ?? [];
  document.title = `${traderName} — RaiderPortal`;

  // The MetaForge /traders endpoint returns only item arrays — no trader portrait/icon fields.
  // All CDN paths (cdn.metaforge.app/arc-raiders/traders/*, /icons/*, /npcs/*) return 404.
  // Falling back to styled initials avatars.
  console.info(`[RaiderPortal] No portrait asset available for trader "${traderName}" — using initials avatar.`);

  const breadcrumb = `
    <nav class="detail-breadcrumb" aria-label="Breadcrumb">
      <a class="bc-link" href="#">Home</a>
      <span class="bc-sep">›</span>
      <span class="bc-cat">Traders</span>
      <span class="bc-sep">›</span>
      <span class="bc-current">${esc(traderName)}</span>
    </nav>`;

  const hero = `
    <div class="detail-hero">
      <div class="hero-icon-wrap">
        ${traderAvatar(traderName, 'avatar-hero')}
      </div>
      <div class="hero-meta">
        <div class="hero-badges">
          <span class="hero-badge trader">Trader</span>
        </div>
        <h1 class="hero-name">${esc(traderName)}</h1>
        <div class="hero-sub">${inventory.length} item${inventory.length !== 1 ? 's' : ''} in stock</div>
      </div>
    </div>`;

  // Sort inventory by item_type then name for easy scanning
  const sorted = [...inventory].sort((a, b) => {
    const catCmp = (a.item_type ?? '').localeCompare(b.item_type ?? '');
    return catCmp !== 0 ? catCmp : a.name.localeCompare(b.name);
  });

  // Group by item_type
  const groups = new Map();
  for (const item of sorted) {
    const cat = item.item_type || 'Other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(item);
  }

  let inventoryHtml = '';
  for (const [category, items] of groups) {
    const rows = items.map((item) => {
      const rc      = rarityClass(item.rarity);
      const iconUrl = item.icon;
      const iconHtml = iconUrl
        ? `<img class="er-icon" src="${esc(iconUrl)}" alt="" loading="lazy"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
           <div class="er-icon-ph" style="display:none">📦</div>`
        : `<div class="er-icon-ph">📦</div>`;

      return `
        <div class="entity-row">
          ${iconHtml}
          <div class="er-info">
            <div class="er-name">
              ${itemLink(item.id, item.name)}
            </div>
            <div class="er-sub">
              ${item.rarity ? `<span class="${rc}">${esc(item.rarity)}</span>` : ''}
              ${item.description ? ` · ${esc(item.description).slice(0, 60)}${item.description.length > 60 ? '…' : ''}` : ''}
            </div>
          </div>
          ${item.trader_price != null
            ? `<span class="er-price">${item.trader_price.toLocaleString()}</span>`
            : ''}
        </div>`;
    }).join('');

    inventoryHtml += `
      <div class="detail-section">
        <div class="section-title">${esc(category)}</div>
        <div class="entity-list">${rows}</div>
      </div>`;
  }

  container.innerHTML = `
    <div class="page-trader">
      <div class="detail-banner">
        ${breadcrumb}
        ${hero}
      </div>
      <div class="detail-full">
        ${inventoryHtml || '<p class="empty-note">This trader has no listed inventory.</p>'}
      </div>
    </div>`;
}
