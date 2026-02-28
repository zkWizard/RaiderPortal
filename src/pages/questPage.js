/**
 * questPage.js
 *
 * Renders the detail page for a single quest.
 * Sections: artwork, issued-by trader (linked), objectives,
 * granted items (pre-requisite items given to start),
 * required items (items you must bring), and rewards.
 */

import { fetchQuests } from '../services/metaforgeApi.js';

// ─── Utilities ────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function itemLink(id, name) {
  return `<a href="#/item/${encodeURIComponent(id)}">${esc(name)}</a>`;
}

function traderLink(name) {
  return `<a href="#/trader/${encodeURIComponent(name.toLowerCase())}">${esc(name)}</a>`;
}

function rarityClass(rarity) {
  return 'rarity-' + (rarity ?? 'common').toLowerCase().replace(/\s+/g, '-');
}

// ─── Shared item-list renderer ────────────────────────────────
// Works for required_items, granted_items, and rewards — all share
// the shape: { item: { id, icon, name, rarity, item_type }, quantity }

function buildItemList(entries) {
  if (!entries?.length) return '<p class="empty-note">None.</p>';

  const rows = entries.map(({ item, quantity }) => {
    if (!item) return '';
    const rc  = rarityClass(item.rarity);
    const qty = quantity ? `<span class="er-qty">× ${esc(String(quantity))}</span>` : '';
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
        ${qty}
      </div>`;
  }).filter(Boolean).join('');

  return `<div class="entity-list">${rows}</div>`;
}

// ─── Main export ──────────────────────────────────────────────

export async function renderQuest(id, container) {
  const quests = await fetchQuests();
  const quest  = quests.find((q) => q.id === id);

  if (!quest) {
    container.innerHTML = `<div class="detail-not-found">Quest "<strong>${esc(id)}</strong>" not found.</div>`;
    return;
  }

  document.title = `${quest.name} — RaiderPortal`;

  const breadcrumb = `
    <nav class="detail-breadcrumb" aria-label="Breadcrumb">
      <a class="bc-link" href="#">Home</a>
      <span class="bc-sep">›</span>
      <span class="bc-cat">Quests</span>
      <span class="bc-sep">›</span>
      <span class="bc-current">${esc(quest.name)}</span>
    </nav>`;

  const hero = `
    <div class="detail-hero">
      ${quest.image
        ? `<div class="hero-icon-wrap">
             <img class="hero-icon" src="${esc(quest.image)}" alt="" loading="eager"
                  onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
             <div class="hero-icon-placeholder" style="display:none">📜</div>
           </div>`
        : `<div class="hero-icon-wrap"><div class="hero-icon-placeholder">📜</div></div>`}
      <div class="hero-meta">
        <div class="hero-badges">
          <span class="hero-badge quest">Quest</span>
        </div>
        <h1 class="hero-name">${esc(quest.name)}</h1>
        <div class="hero-sub">
          Issued by ${quest.trader_name
            ? traderLink(quest.trader_name)
            : '<span>Unknown trader</span>'}
        </div>
      </div>
    </div>`;

  // Full-width artwork (if available — quests have a high-res image)
  const artwork = quest.image
    ? `<img class="detail-artwork" src="${esc(quest.image)}" alt="${esc(quest.name)} quest artwork" loading="lazy"
            onerror="this.remove()">`
    : '';

  // Objectives
  const objectiveDots = (quest.objectives ?? []).map((obj) => `
    <li class="objective-item">
      <span class="objective-dot"></span>
      ${esc(obj)}
    </li>`).join('');

  const objectivesSection = `
    <div class="detail-section">
      <div class="section-title">Objectives</div>
      ${objectiveDots
        ? `<ul class="objective-list">${objectiveDots}</ul>`
        : '<p class="empty-note">No objectives listed.</p>'}
    </div>`;

  // Granted items (items you receive when picking up the quest)
  const grantedSection = quest.granted_items?.length ? `
    <div class="detail-section">
      <div class="section-title">Items Granted on Accept</div>
      ${buildItemList(quest.granted_items)}
    </div>` : '';

  // Required items (items you must bring to complete the quest)
  const requiredSection = quest.required_items?.length ? `
    <div class="detail-section">
      <div class="section-title">Required Items</div>
      ${buildItemList(quest.required_items)}
    </div>` : '';

  // Rewards
  const rewardsSection = `
    <div class="detail-section">
      <div class="section-title">Rewards</div>
      ${buildItemList(quest.rewards)}
      ${quest.xp ? `<div style="margin-top:12px;"><span class="xp-badge">⚡ ${quest.xp.toLocaleString()} XP</span></div>` : ''}
    </div>`;

  // Guide links
  const guideSection = quest.guide_links?.length ? `
    <div class="detail-section">
      <div class="section-title">External Guides</div>
      <div class="guide-links-list">
        ${quest.guide_links.map((l) => `
          <a class="guide-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">
            ↗ ${esc(l.label || l.url)}
          </a>`).join('')}
      </div>
    </div>` : '';

  container.innerHTML = `
    ${breadcrumb}
    ${hero}
    <div class="detail-full">
      ${artwork}
      ${objectivesSection}
      ${grantedSection}
      ${requiredSection}
      ${rewardsSection}
      ${guideSection}
    </div>`;
}
