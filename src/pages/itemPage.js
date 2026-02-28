/**
 * itemPage.js
 *
 * Renders the detail page for a single item.
 * Data sourced from fetchItems() (full list, cached) and fetchTraders()
 * (cross-referenced to find which traders sell this item).
 *
 * Layout: hero row + two-column body (main content + sidebar).
 */

import { fetchItems, fetchTraders } from '../services/metaforgeApi.js';

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

// ─── Stat block — human-readable labels ───────────────────────
// Only keys listed here are shown; zero / empty / null values are skipped.

const STAT_LABELS = {
  // ── Weapon primaries ──────────────────────────────────────
  ammo:                          'Ammo Type',
  firingMode:                    'Firing Mode',
  damage:                        'Damage',
  range:                         'Range',
  magazineSize:                  'Magazine Size',
  fireRate:                      'Fire Rate',
  stability:                     'Stability',
  agility:                       'Agility',
  stealth:                       'Stealth',
  // ── General ───────────────────────────────────────────────
  health:                        'Health',
  shield:                        'Shield',
  radius:                        'Radius (m)',
  weight:                        'Weight',
  arcStun:                       'ARC Stun',
  healing:                       'Healing',
  stamina:                       'Stamina',
  useTime:                       'Use Time (s)',
  duration:                      'Duration (s)',
  stackSize:                     'Stack Size',
  raiderStun:                    'Raider Stun',
  weightLimit:                   'Weight Limit',
  augmentSlots:                  'Augment Slots',
  healingSlots:                  'Healing Slots',
  reducedNoise:                  'Reduced Noise',
  shieldCharge:                  'Shield Charge',
  backpackSlots:                 'Backpack Slots',
  quickUseSlots:                 'Quick-Use Slots',
  damagePerSecond:               'Damage / Sec',
  safePocketSlots:               'Safe Pocket Slots',
  damageMitigation:              'Damage Mitigation',
  healingPerSecond:              'Healing / Sec',
  staminaPerSecond:              'Stamina / Sec',
  reducedEquipTime:              'Reduced Equip Time',
  increasedADSSpeed:             'ADS Speed Bonus',
  increasedFireRate:             'Fire Rate Bonus',
  reducedReloadTime:             'Reduced Reload Time',
  illuminationRadius:            'Illumination Radius',
  reducedUnequipTime:            'Reduced Unequip Time',
  increasedEquipTime:            'Increased Equip Time',
  increasedUnequipTime:          'Increased Unequip Time',
  movementPenalty:               'Movement Penalty',
  reducedVerticalRecoil:         'Reduced Vert. Recoil',
  increasedVerticalRecoil:       'Increased Vert. Recoil',
  increasedBulletVelocity:       'Bullet Velocity Bonus',
  reducedMaxShotDispersion:      'Reduced Max Dispersion',
  reducedPerShotDispersion:      'Reduced Per-Shot Dispersion',
  reducedDurabilityBurnRate:     'Durability Burn Rate',
  reducedRecoilRecoveryTime:     'Reduced Recoil Recovery',
  increasedRecoilRecoveryTime:   'Increased Recoil Recovery',
  reducedDispersionRecoveryTime: 'Reduced Dispersion Recovery',
  damageMult:                    'Damage Multiplier',
};

// ─── Section builders ─────────────────────────────────────────

function buildIconHtml(item) {
  if (item.icon) {
    return `
      <div class="hero-icon-wrap">
        <img class="hero-icon" src="${esc(item.icon)}" alt=""
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="hero-icon-placeholder" style="display:none">📦</div>
      </div>`;
  }
  return `<div class="hero-icon-wrap"><div class="hero-icon-placeholder">📦</div></div>`;
}

function buildHero(item) {
  const rc = rarityClass(item.rarity);
  return `
    <div class="detail-hero">
      ${buildIconHtml(item)}
      <div class="hero-meta">
        <div class="hero-badges">
          <span class="hero-badge item">Item</span>
          ${item.rarity ? `<span class="${rc}" style="font-size:12px;font-weight:700;">${esc(item.rarity)}</span>` : ''}
          ${item.item_type ? `<span class="tag tag-gray">${esc(item.item_type)}</span>` : ''}
          ${item.ammo_type ? `<span class="tag tag-orange">Ammo: ${esc(item.ammo_type)}</span>` : ''}
        </div>
        <h1 class="hero-name">${esc(item.name)}</h1>
        <div class="hero-sub">
          Base value: <strong>${(item.value ?? 0).toLocaleString()}</strong>
        </div>
      </div>
    </div>`;
}

function buildStats(statBlock) {
  const entries = Object.entries(statBlock ?? {})
    .filter(([key, val]) => key in STAT_LABELS && val !== 0 && val !== '' && val !== null)
    .map(([key, val]) => ({ label: STAT_LABELS[key], val }));

  if (!entries.length) return '';

  const rows = entries.map(({ label, val }) => `
    <div class="stat-row">
      <span class="stat-name">${esc(label)}</span>
      <span class="stat-val">${typeof val === 'number' ? val.toLocaleString() : esc(String(val))}</span>
    </div>`).join('');

  return `
    <div class="detail-section">
      <div class="section-title">Stats</div>
      <div class="stat-grid">${rows}</div>
    </div>`;
}

function buildLootAreas(lootArea) {
  if (!lootArea) return '';
  const areas = lootArea.split(',').map((s) => s.trim()).filter(Boolean);
  if (!areas.length) return '';

  const tags = areas.map((a) => `<span class="tag tag-gray">${esc(a)}</span>`).join('');
  return `
    <div class="detail-section">
      <div class="section-title">Found In</div>
      <div class="tag-row">${tags}</div>
    </div>`;
}

function buildGuideLinks(links) {
  if (!links?.length) return '';
  const items = links.map((l) => `
    <a class="guide-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">
      ↗ ${esc(l.label || l.url)}
    </a>`).join('');
  return `
    <div class="detail-section">
      <div class="section-title">External Guides</div>
      <div class="guide-links-list">${items}</div>
    </div>`;
}

// ─── Tier navigation ──────────────────────────────────────
// Detects items named "{Base} I/II/III/IV" and renders a nav strip
// linking to the other tiers. Returns '' for non-tiered items.

const TIER_RE = /^(.+?)\s+(I{1,3}|IV)$/;
const TIER_LABELS = ['I', 'II', 'III', 'IV'];

function buildTierNav(currentItem, allItems) {
  const match = currentItem.name.match(TIER_RE);
  if (!match) return '';

  const baseName = match[1];
  const tiers = TIER_LABELS
    .map((t) => allItems.find((i) => i.name === `${baseName} ${t}`))
    .filter(Boolean);

  if (tiers.length < 2) return '';

  const links = tiers.map((t) => {
    if (t.id === currentItem.id) {
      return `<span class="tier-current">${esc(match[2])}</span>`;
    }
    const tierLabel = t.name.match(TIER_RE)?.[2] ?? t.name;
    return `<a class="tier-link" href="#/item/${encodeURIComponent(t.id)}">${esc(tierLabel)}</a>`;
  }).join('');

  return `
    <div class="detail-section">
      <div class="section-title">Tier Variants — ${esc(baseName)}</div>
      <div class="tier-nav">${links}</div>
    </div>`;
}

function buildSidebar(item, soldBy) {
  const rc = rarityClass(item.rarity);

  // Quick facts
  let facts = '';
  if (item.rarity)
    facts += `<div class="kv-row"><span class="kv-key">Rarity</span><span class="kv-val ${rc}">${esc(item.rarity)}</span></div>`;
  if (item.item_type)
    facts += `<div class="kv-row"><span class="kv-key">Category</span><span class="kv-val">${esc(item.item_type)}</span></div>`;
  if (item.subcategory)
    facts += `<div class="kv-row"><span class="kv-key">Subcategory</span><span class="kv-val">${esc(item.subcategory)}</span></div>`;
  if (item.value)
    facts += `<div class="kv-row"><span class="kv-key">Base Value</span><span class="kv-val">${item.value.toLocaleString()}</span></div>`;
  if (item.stat_block?.weight)
    facts += `<div class="kv-row"><span class="kv-key">Weight</span><span class="kv-val">${item.stat_block.weight}</span></div>`;
  if (item.stat_block?.stackSize > 1)
    facts += `<div class="kv-row"><span class="kv-key">Stack Size</span><span class="kv-val">${item.stat_block.stackSize}</span></div>`;
  if (item.shield_type)
    facts += `<div class="kv-row"><span class="kv-key">Shield Type</span><span class="kv-val">${esc(item.shield_type)}</span></div>`;
  if (item.ammo_type)
    facts += `<div class="kv-row"><span class="kv-key">Ammo Type</span><span class="kv-val">${esc(item.ammo_type)}</span></div>`;
  if (item.workbench)
    facts += `<div class="kv-row"><span class="kv-key">Crafted At</span><span class="kv-val">${esc(item.workbench)}</span></div>`;

  let html = `<div class="info-card"><div class="info-card-title">Quick Facts</div>${facts}</div>`;

  // Sold By
  if (soldBy.length) {
    const rows = soldBy.map(({ name, price }) => `
      <div class="sold-by-row">
        ${traderLink(name)}
        <span class="sold-by-price">${(price ?? 0).toLocaleString()}</span>
      </div>`).join('');
    html += `<div class="info-card"><div class="info-card-title">Sold By</div>${rows}</div>`;
  }

  // Loadout slots
  if (item.loadout_slots?.length) {
    const slotRows = item.loadout_slots
      .map((s) => `<div class="kv-row"><span class="kv-val">${esc(String(s))}</span></div>`)
      .join('');
    html += `<div class="info-card"><div class="info-card-title">Loadout Slots</div>${slotRows}</div>`;
  }

  return html;
}

// ─── Main export ──────────────────────────────────────────────

export async function renderItem(id, container) {
  const [items, tradersData] = await Promise.all([
    fetchItems(),
    fetchTraders().catch(() => ({})),
  ]);

  const item = items.find((i) => i.id === id);
  if (!item) {
    container.innerHTML = `<div class="detail-not-found">Item "<strong>${esc(id)}</strong>" not found.</div>`;
    return;
  }

  document.title = `${item.name} — RaiderPortal`;

  // Find which traders sell this item
  const soldBy = [];
  for (const [traderName, inventory] of Object.entries(tradersData)) {
    const listing = inventory.find((inv) => inv.id === id);
    if (listing) soldBy.push({ name: traderName, price: listing.trader_price });
  }

  const breadcrumb = `
    <nav class="detail-breadcrumb" aria-label="Breadcrumb">
      <a class="bc-link" href="#">Home</a>
      <span class="bc-sep">›</span>
      <span class="bc-cat">Items</span>
      <span class="bc-sep">›</span>
      <span class="bc-current">${esc(item.name)}</span>
    </nav>`;

  const mainContent = [
    buildTierNav(item, items),

    item.description ? `
      <div class="detail-section">
        <div class="section-title">Description</div>
        <p class="detail-description">${esc(item.description)}</p>
      </div>` : '',

    item.flavor_text ? `
      <div class="detail-section">
        <div class="section-title">Flavor Text</div>
        <p class="detail-flavor">${esc(item.flavor_text)}</p>
      </div>` : '',

    buildStats(item.stat_block),

    buildLootAreas(item.loot_area),

    buildGuideLinks(item.guide_links),
  ].filter(Boolean).join('');

  container.innerHTML = `
    ${breadcrumb}
    ${buildHero(item)}
    <div class="detail-body">
      <div class="detail-main">${mainContent}</div>
      <div class="detail-sidebar">${buildSidebar(item, soldBy)}</div>
    </div>`;
}
