/**
 * router.js
 *
 * Hash-based SPA router. Listens for #/type/id patterns and delegates
 * rendering to the appropriate page module. Manages landing ↔ detail
 * visibility so only one view is shown at a time.
 *
 * Supported patterns:
 *   #/items          → listPages.js (items listing)
 *   #/quests         → listPages.js (quests listing)
 *   #/arc            → listPages.js (ARC listing)
 *   #/traders        → listPages.js (traders listing)
 *   #/events         → listPages.js (events placeholder)
 *   #/item/:id       → itemPage.js
 *   #/arc/:id        → arcPage.js
 *   #/quest/:id      → questPage.js
 *   #/trader/:id     → traderPage.js
 *
 * Anything else → shows the landing page.
 */

import { renderItemGroup } from './pages/itemPage.js';
import { renderQuest }     from './pages/questPage.js';
import { renderArc }       from './pages/arcPage.js';
import { renderTrader }    from './pages/traderPage.js';
import {
  renderItemsList,
  renderQuestsList,
  renderArcsList,
  renderTradersList,
  renderEventsList,
} from './pages/listPages.js';

/** Detail routes — require an :id segment. */
const RENDERERS = {
  item:   renderItemGroup,
  arc:    renderArc,
  quest:  renderQuest,
  trader: renderTrader,
};

/** Listing routes — no :id segment, one per nav category. */
const LIST_RENDERERS = {
  items:   renderItemsList,
  quests:  renderQuestsList,
  arc:     renderArcsList,
  traders: renderTradersList,
  events:  renderEventsList,
};

/** Matches detail-page hashes: #/item/:id, #/arc/:id, etc. */
const ROUTE_RE = /^#\/(item|arc|quest|trader)\/(.+)$/;

/** Matches listing-page hashes: #/items, #/quests, #/arc, #/traders, #/events. */
const LIST_RE  = /^#\/(items|quests|arc|traders|events)$/;

const DEFAULT_TITLE = 'RaiderPortal — ARC Raiders Database';

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Suppress slide animation on direct URL loads (first paint). */
let _initialLoad = true;

/**
 * Reads `window.location.hash`, shows the appropriate view, and calls the
 * matching renderer. Called on hashchange and on initial page load.
 */
async function handleRoute() {
  const body    = document.body;
  const content = document.getElementById('detailContent');
  const detail  = document.getElementById('detailView');

  const hash        = window.location.hash;
  const detailMatch = hash.match(ROUTE_RE);
  const listMatch   = hash.match(LIST_RE);

  // Toggle body.detail-active; suppress animation on first paint
  function setDetailActive(active) {
    if (_initialLoad) body.classList.add('no-transition');
    body.classList.toggle('detail-active', active);
    if (_initialLoad) {
      // Two rAFs: let the class paint before re-enabling transitions
      requestAnimationFrame(() =>
        requestAnimationFrame(() => body.classList.remove('no-transition'))
      );
    }
    _initialLoad = false;
  }

  if (!detailMatch && !listMatch) {
    setDetailActive(false);
    document.title = DEFAULT_TITLE;
    document.dispatchEvent(new CustomEvent('rp:showLanding'));
    return;
  }

  setDetailActive(true);
  detail.scrollTop = 0;

  // Show loading state immediately
  content.innerHTML = `
    <div class="detail-loading">
      <div class="dl-spinner"></div>
      Loading…
    </div>`;

  try {
    if (detailMatch) {
      const [, type, rawId] = detailMatch;
      const id = decodeURIComponent(rawId);
      await RENDERERS[type](id, content);
    } else {
      const [, listType] = listMatch;
      await LIST_RENDERERS[listType](content);
    }
  } catch (err) {
    console.error('[router]', hash, err);
    content.innerHTML = `
      <div class="detail-error">
        Failed to load — ${escHtml(err.message)}
      </div>`;
  }
}

/**
 * Call once from index.html to register the router.
 * Sets up the hashchange listener and processes the initial URL.
 */
export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
