/**
 * src/pages/mapPage.js
 *
 * Renders individual map detail pages at #/map/:id
 *
 * Sections:
 *   1. Hero banner — CDN image + name + lore description
 *   2. Available Events — from MetaForge events-schedule, filtered to this map
 *   3. Key Locations — ARDB key items whose name contains map-specific keywords
 *   4. Items Found Here — item-overrides.json mapExclusive; shows "coming soon" until populated
 *   5. Quests — no map field in MetaForge quests API; shows "coming soon"
 *   6. Contribute note — invites community contributions
 */

import { fetchEventsSchedule } from '../services/metaforgeApi.js';
import { fetchArdbItems, ardbImg } from '../services/ardbApi.js';

// ─────────────────────────────────────────────────────────────────────────────
// MAP METADATA
// ─────────────────────────────────────────────────────────────────────────────

const CDN = 'https://cdn.metaforge.app/arc-raiders/ui';

/**
 * Static map definitions.
 *
 * eventMapName — the exact string used in the MetaForge events-schedule `map` field.
 * keywords     — lower-case substrings used to match ARDB item names to this map.
 *                 Trailing space on 'dam ' prevents false-matches like "damage".
 */
const MAP_META = {
  dam: {
    name:         'Dam Battlegrounds',
    image:        `${CDN}/dambattlegrounds2.webp`,
    desc:         'The Alcantara Power Plant, or "The Dam", stands as a silent sentinel amidst a toxic, waterlogged land, nourishing a riot of resilient vegetation and fauna. A monument echoing with the memories of power once generated.',
    eventMapName: 'Dam',
    keywords:     ['dam '],
  },
  spaceport: {
    name:         'Spaceport',
    image:        `${CDN}/spaceport2.webp`,
    desc:         'Acerra Spaceport is a majestic testament to humanity\'s past ambitions. This is where the Exodus shuttles, vessels of hope and desperation, once roared into the heavens, leaving a beleaguered Earth behind.',
    eventMapName: 'Spaceport',
    keywords:     ['spaceport'],
  },
  'buried-city': {
    name:         'Buried City',
    image:        `${CDN}/buriecity2.webp`,
    desc:         'Amidst the sand dunes in this arid wasteland you will find a remnant of the old world quite unlike the cold steel spires of the Exodus age. Walk these narrow streets and empty plazas, and know that people once lived here.',
    eventMapName: 'Buried City',
    keywords:     ['buried city'],
  },
  'blue-gate': {
    name:         'Blue Gate',
    image:        `${CDN}/blue-gate2.webp`,
    desc:         'Once a steadfast symbol of defiant connection, the Blue Gate now serves as a daunting entryway into the perilous mountain ranges. The surrounding valley bears scars both new and old.',
    eventMapName: 'Blue Gate',
    keywords:     ['blue gate'],
  },
  'stella-montis': {
    name:         'Stella Montis',
    image:        `${CDN}/stella-montis2.webp`,
    desc:         'A secluded research facility amidst snow-draped peaks, Stella Montis is said to have been the last bulwark of humanity\'s preservation.',
    eventMapName: 'Stella Montis',
    keywords:     ['stella montis'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function comingSoon(title, icon = '🗺️', note = 'Community data coming soon') {
  return `
    <div class="detail-section">
      <div class="section-title">${esc(title)}</div>
      <div class="map-coming-soon">
        <span class="map-coming-soon-icon">${icon}</span>
        <span>${esc(note)}</span>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders unique events that appear on this map.
 * Events are deduplicated by name — the schedule repeats the same events across
 * many time slots, but we just want to show which event types run here.
 */
function buildEventsSection(events, mapMeta) {
  const mapEvents = events.filter((e) => e.map === mapMeta.eventMapName);
  // Deduplicate by event name (keep first occurrence for the icon URL)
  const unique = [...new Map(mapEvents.map((e) => [e.name, e])).values()];

  if (!unique.length) {
    return comingSoon('Available Events', '📅', 'No event data available for this map');
  }

  const cards = unique.map((ev) => {
    const iconHtml = ev.icon
      ? `<img class="map-ev-icon" src="${esc(ev.icon)}" alt="${esc(ev.name)}" loading="lazy"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <div class="map-ev-icon-ph" style="display:none">⚡</div>`
      : `<div class="map-ev-icon-ph">⚡</div>`;

    return `
      <div class="map-ev-card">
        <div class="map-ev-icon-wrap">${iconHtml}</div>
        <span class="map-ev-name">${esc(ev.name)}</span>
      </div>`;
  }).join('');

  return `
    <div class="detail-section">
      <div class="section-title">Available Events</div>
      <p class="map-section-note">Events that rotate across sessions on ${esc(mapMeta.name)}.</p>
      <div class="map-ev-grid">${cards}</div>
    </div>`;
}

/**
 * Renders key items whose name contains a map-specific keyword.
 * Source: ARDB items list (type === 'key').
 * Note: These keys are not yet in MetaForge so they cannot link to item detail pages.
 */
function buildKeyLocationsSection(ardbItems, mapMeta) {
  const keys = ardbItems.filter(
    (item) =>
      item.type === 'key' &&
      mapMeta.keywords.some((kw) => item.name.toLowerCase().includes(kw))
  );

  if (!keys.length) {
    return comingSoon('Key Locations', '🔑');
  }

  const rows = keys.map((k) => {
    const iconUrl = ardbImg(k.icon);
    return `
      <div class="map-key-row">
        ${iconUrl
          ? `<img class="map-key-icon" src="${esc(iconUrl)}" alt="" loading="lazy"
                  onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
             <div class="map-key-icon-ph" style="display:none">🔑</div>`
          : '<div class="map-key-icon-ph">🔑</div>'}
        <span class="map-key-name">${esc(k.name)}</span>
      </div>`;
  }).join('');

  return `
    <div class="detail-section">
      <div class="section-title">Key Locations</div>
      <p class="map-section-note">Keys found on ${esc(mapMeta.name)}. Use these to unlock locked rooms and caches.</p>
      <div class="map-key-list">${rows}</div>
    </div>`;
}

/**
 * "Items Found Here" — currently shows coming-soon because:
 *  - MetaForge loot_area values are zone categories (ARC, Electrical, etc.), not map-specific.
 *  - item-overrides.json has no mapExclusive entries yet.
 * Will populate as community overrides are added to item-overrides.json.
 */
function buildItemsSection() {
  return comingSoon('Items Found Here', '📦');
}

/**
 * "Quests" — shows coming-soon because MetaForge quests have no map field.
 */
function buildQuestsSection() {
  return comingSoon('Quests', '📜');
}

/** Contribute callout at the bottom of every map page. */
function buildContributeNote(mapMeta) {
  return `
    <div class="map-contribute-note">
      <div class="map-contribute-icon">✏️</div>
      <div class="map-contribute-text">
        <strong>Know something we don't?</strong>
        Help us improve the ${esc(mapMeta.name)} page — item spawn locations, quest tie-ins,
        and loot routes can be reported via
        <a href="https://github.com/zkWizard/RaiderPortal/issues"
           target="_blank" rel="noopener noreferrer">GitHub Issues</a>.
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export async function renderMap(mapId, container) {
  const mapMeta = MAP_META[mapId];
  if (!mapMeta) {
    container.innerHTML = `<div class="detail-not-found">Map "<strong>${esc(mapId)}</strong>" not found.</div>`;
    return;
  }

  document.title = `${mapMeta.name} — RaiderPortal`;

  const [eventsResult, ardbResult] = await Promise.allSettled([
    fetchEventsSchedule(),
    fetchArdbItems(),
  ]);

  const events    = eventsResult.status === 'fulfilled' ? (eventsResult.value ?? []) : [];
  const ardbItems = ardbResult.status  === 'fulfilled' ? (ardbResult.value  ?? []) : [];

  const breadcrumb = `
    <nav class="detail-breadcrumb" aria-label="Breadcrumb">
      <a class="bc-link" href="#">Home</a>
      <span class="bc-sep">›</span>
      <a class="bc-link" href="#/maps">Maps</a>
      <span class="bc-sep">›</span>
      <span class="bc-current">${esc(mapMeta.name)}</span>
    </nav>`;

  container.innerHTML = `
    <div class="page-map">
      <div class="map-hero-banner">
        <img class="map-hero-img" src="${esc(mapMeta.image)}" alt="${esc(mapMeta.name)}"
             onerror="this.parentElement.classList.add('map-hero-img-err')">
        <div class="map-hero-overlay"></div>
        <div class="map-hero-content">
          ${breadcrumb}
          <h1 class="map-hero-title">${esc(mapMeta.name)}</h1>
          <p class="map-hero-desc">${esc(mapMeta.desc)}</p>
        </div>
      </div>
      ${buildEventsSection(events, mapMeta)}
      ${buildKeyLocationsSection(ardbItems, mapMeta)}
      ${buildItemsSection()}
      ${buildQuestsSection()}
      ${buildContributeNote(mapMeta)}
    </div>`;
}
