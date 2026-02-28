/**
 * itemPage.js
 *
 * Renders item detail pages. Tiered items (e.g. Tempest I/II/III/IV,
 * Tempest Blueprint) share a single unified page at #/item/{baseSlug}
 * with interactive tier tabs. Single-tier items render a standard layout.
 *
 * Exported: renderItemGroup(slug, container)
 *   slug — URL segment from the router (baseSlug or raw item id as fallback)
 */

import { fetchItems, fetchTraders } from '../services/metaforgeApi.js';
import { normalizeBaseName, nameToSlug } from '../services/searchIndex.js';

// ─── Utilities ────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function itemLink(id, name) {
  const slug = nameToSlug(normalizeBaseName(name));
  return `<a href="#/item/${encodeURIComponent(slug)}">${esc(name)}</a>`;
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

// ─── Tier utilities ────────────────────────────────────────────

/**
 * Extracts the tier/variant label from an item name, e.g.:
 *   "Tempest III"       → "III"
 *   "Tempest Blueprint" → "Blueprint"
 *   "Wolfpack"          → null  (no tier)
 */
function getTierLabel(itemName) {
  if (/\bBlueprint\b/i.test(itemName)) return 'Blueprint';
  if (/\bRecipe\b/i.test(itemName))    return 'Recipe';
  const mk = itemName.match(/\s+([Mm][Kk]\.\s*\d+)/);
  if (mk) return mk[1];
  const rv = itemName.match(/\s+(I{1,3}|IV|V)$/i);
  if (rv) return rv[1].toUpperCase();
  const n = itemName.match(/\s+(\d+)$/);
  if (n) return n[1];
  return null;
}

const TIER_ORDER = ['I', 'II', 'III', 'IV', 'V', '1', '2', '3', '4', '5', 'Blueprint', 'Recipe'];

function sortItemsByTier(items) {
  return [...items].sort((a, b) => {
    const la = getTierLabel(a.name);
    const lb = getTierLabel(b.name);
    // Items with no tier label (base items) sort first
    if (!la && !lb) return a.name.localeCompare(b.name);
    if (!la) return -1;
    if (!lb) return 1;
    const ia = TIER_ORDER.indexOf(la);
    const ib = TIER_ORDER.indexOf(lb);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return la.localeCompare(lb);
  });
}

// ─── Subcategory classifier ────────────────────────────────────
// Maps item_type to a CSS modifier class that drives the banner accent colour.

const ARMOR_TYPES      = new Set(['armor', 'helmet', 'backpack', 'shield', 'chest armor', 'leg armor', 'body armor', 'utility']);
const GRENADE_TYPES    = new Set(['grenade', 'throwable', 'explosive']);
const CONSUMABLE_TYPES = new Set(['consumable', 'medical', 'medical item', 'medkit', 'food', 'drink']);
const MOD_TYPES        = new Set(['mod', 'weapon mod', 'attachment']);
const MATERIAL_TYPES   = new Set(['material', 'resource', 'component', 'crafting material', 'crafting resource']);
const KEY_TYPES        = new Set(['key', 'access card', 'keycard', 'card']);

function getItemSubClass(item) {
  const t = (item.item_type ?? '').toLowerCase();
  if (t === 'blueprint' || t === 'recipe') return 'sub-blueprint';
  if (ARMOR_TYPES.has(t))      return 'sub-armor';
  if (GRENADE_TYPES.has(t))    return 'sub-grenade';
  if (CONSUMABLE_TYPES.has(t)) return 'sub-consumable';
  if (MOD_TYPES.has(t))        return 'sub-mod';
  if (MATERIAL_TYPES.has(t))   return 'sub-material';
  if (KEY_TYPES.has(t))        return 'sub-key';
  return ''; // weapons and unknown types use default orange accent
}

// ─── Section builders ──────────────────────────────────────────

function buildIconHtml(item) {
  const iconUrl = item.icon;
  if (iconUrl) {
    return `
      <div class="hero-icon-wrap">
        <img class="hero-icon" src="${esc(iconUrl)}" alt=""
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
          Base value: <strong>${(item.value ?? 0).toLocaleString()} Raider Coins</strong>
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

function buildCrafting(item) {
  if (!item.workbench) return '';
  return `
    <div class="detail-section">
      <div class="section-title">Crafting</div>
      <div class="stat-grid">
        <div class="stat-row">
          <span class="stat-name">Workbench</span>
          <span class="stat-val">${esc(item.workbench)}</span>
        </div>
      </div>
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

// ─── Per-item body block (main + sidebar, no hero) ─────────────

function buildBody(item, soldBy) {
  const mainContent = [
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

    buildCrafting(item),

    buildLootAreas(item.loot_area),

    buildGuideLinks(item.guide_links),
  ].filter(Boolean).join('');

  return `
    <div class="detail-body">
      <div class="detail-main">${mainContent}</div>
      <div class="detail-sidebar">${buildSidebar(item, soldBy)}</div>
    </div>`;
}

// ─── Per-item content block (hero + body — used inside tier panels) ─

function buildItemContent(item, soldBy) {
  return `
    ${buildHero(item)}
    ${buildBody(item, soldBy)}`;
}

// ─── Main export ───────────────────────────────────────────────

export async function renderItemGroup(slug, container) {
  const [items, tradersData] = await Promise.all([
    fetchItems(),
    fetchTraders().catch(() => ({})),
  ]);

  // Primary lookup: all items whose normalised base-name slug matches the URL segment
  let group = items.filter(
    (item) => nameToSlug(normalizeBaseName(item.name)) === slug
  );

  // Fallback: direct item-ID match (handles old-style URLs and deep links)
  if (!group.length) {
    const item = items.find((i) => i.id === slug);
    if (item) group = [item];
  }

  if (!group.length) {
    container.innerHTML = `<div class="detail-not-found">Item "<strong>${esc(slug)}</strong>" not found.</div>`;
    return;
  }

  // Build a soldBy lookup keyed by item id
  const soldByMap = new Map();
  for (const [traderName, inventory] of Object.entries(tradersData)) {
    for (const listing of inventory) {
      const existing = soldByMap.get(listing.id) ?? [];
      existing.push({ name: traderName, price: listing.trader_price });
      soldByMap.set(listing.id, existing);
    }
  }

  const sorted   = sortItemsByTier(group);
  const baseName = normalizeBaseName(sorted[0].name);

  const breadcrumb = `
    <nav class="detail-breadcrumb" aria-label="Breadcrumb">
      <a class="bc-link" href="#">Home</a>
      <span class="bc-sep">›</span>
      <span class="bc-cat">Items</span>
      <span class="bc-sep">›</span>
      <span class="bc-current">${esc(baseName)}</span>
    </nav>`;

  // ── Single-item path — no tier selector ───────────────────────
  if (sorted.length === 1) {
    const item     = sorted[0];
    const soldBy   = soldByMap.get(item.id) ?? [];
    const subClass = getItemSubClass(item);
    document.title = `${item.name} — RaiderPortal`;
    container.innerHTML = `
      <div class="page-item${subClass ? ' ' + subClass : ''}">
        <div class="detail-banner">
          ${breadcrumb}
          ${buildHero(item)}
        </div>
        ${buildBody(item, soldBy)}
      </div>`;
    return;
  }

  // ── Multi-tier path — tier tabs + swappable panels ─────────────
  document.title = `${baseName} — RaiderPortal`;

  // Use the first non-blueprint/recipe item to pick the accent colour for the group
  const subClass = getItemSubClass(
    sorted.find((i) => i.item_type !== 'Blueprint' && i.item_type !== 'Recipe') ?? sorted[0]
  );

  const tierBtns = sorted.map((item, i) => {
    const label = getTierLabel(item.name) ?? item.name;
    return `<button class="tier-tab${i === 0 ? ' active' : ''}" data-ti="${i}">${esc(label)}</button>`;
  }).join('');

  const panels = sorted.map((item, i) => {
    const soldBy = soldByMap.get(item.id) ?? [];
    return `
      <div class="tier-panel" data-panel="${i}"${i !== 0 ? ' hidden' : ''}>
        ${buildItemContent(item, soldBy)}
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="page-item${subClass ? ' ' + subClass : ''}">
      <div class="detail-banner">
        ${breadcrumb}
        <div class="unified-header">
          <h1 class="unified-title">${esc(baseName)}</h1>
          <div class="tier-nav">${tierBtns}</div>
        </div>
      </div>
      ${panels}
    </div>`;

  // Wire up tab switching after innerHTML is set
  const allBtns   = container.querySelectorAll('.tier-tab');
  const allPanels = container.querySelectorAll('.tier-panel');

  allBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.ti, 10);
      allBtns.forEach((b, j)   => b.classList.toggle('active', j === idx));
      allPanels.forEach((p, j) => { p.hidden = j !== idx; });
    });
  });
}
