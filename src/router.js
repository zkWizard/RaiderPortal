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

import { renderItemGroup } from './pages/itemPage.js';
import { renderQuest }     from './pages/questPage.js';
import { renderArc }       from './pages/arcPage.js';
import { renderTrader }    from './pages/traderPage.js';

const RENDERERS = {
  item:   renderItemGroup,
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

  const hash  = window.location.hash;
  const match = hash.match(ROUTE_RE);

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

  if (!match) {
    setDetailActive(false);
    document.title = DEFAULT_TITLE;
    document.dispatchEvent(new CustomEvent('rp:showLanding'));
    return;
  }

  const [, type, rawId] = match;
  const id = decodeURIComponent(rawId);

  setDetailActive(true);
  detail.scrollTop = 0;

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
