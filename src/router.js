/**
 * router.js
 *
 * Hash-based SPA router. Listens for #/type/id patterns and delegates
 * rendering to the appropriate page module. Manages landing ↔ detail
 * visibility so only one view is shown at a time.
 *
 * Supported patterns:
 *   #/item/:id    → itemPage.js
 *   #/arc/:id     → arcPage.js
 *   #/quest/:id   → questPage.js
 *   #/trader/:id  → traderPage.js
 *
 * Anything else → shows the landing page.
 */

import { renderItem }   from './pages/itemPage.js';
import { renderQuest }  from './pages/questPage.js';
import { renderArc }    from './pages/arcPage.js';
import { renderTrader } from './pages/traderPage.js';

const RENDERERS = {
  item:   renderItem,
  arc:    renderArc,
  quest:  renderQuest,
  trader: renderTrader,
};

/** Pattern that matches valid detail-page hashes. */
const ROUTE_RE = /^#\/(item|arc|quest|trader)\/(.+)$/;

const DEFAULT_TITLE = 'RaiderPortal — ARC Raiders Database';

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Reads `window.location.hash`, shows the appropriate view, and calls the
 * matching renderer. Called on hashchange and on initial page load.
 */
async function handleRoute() {
  const landing    = document.getElementById('landing');
  const detailView = document.getElementById('detailView');
  const content    = document.getElementById('detailContent');

  const hash  = window.location.hash;
  const match = hash.match(ROUTE_RE);

  if (!match) {
    // No detail route — restore landing
    landing.hidden    = false;
    detailView.hidden = true;
    document.title    = DEFAULT_TITLE;
    return;
  }

  const [, type, rawId] = match;
  const id = decodeURIComponent(rawId);

  // Switch to detail view
  landing.hidden    = true;
  detailView.hidden = false;
  window.scrollTo(0, 0);

  // Show loading state immediately
  content.innerHTML = `
    <div class="detail-loading">
      <div class="dl-spinner"></div>
      Loading…
    </div>`;

  try {
    await RENDERERS[type](id, content);
  } catch (err) {
    console.error('[router]', type, id, err);
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
