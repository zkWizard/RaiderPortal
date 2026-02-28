/**
 * api/metaforge/[...path].js
 *
 * Vercel catch-all serverless proxy for the MetaForge ARC Raiders API.
 *
 * Forwards any request to /api/metaforge/* → https://metaforge.app/api/*
 * and streams the JSON response back to the caller with CORS headers set,
 * so browser clients on any origin can reach MetaForge without CORS errors.
 *
 * Example:
 *   GET /api/metaforge/arc-raiders/items?page=1&limit=100
 *   → https://metaforge.app/api/arc-raiders/items?page=1&limit=100
 */

const UPSTREAM_BASE = 'https://metaforge.app/api';

module.exports = async function handler(req, res) {
  // ── CORS — allow any origin (public read-only data proxy) ─────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  // Preflight — browsers send OPTIONS before cross-origin GETs
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Only proxy GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Build the upstream URL ─────────────────────────────────────────────
  // req.query.path is the [...path] catch-all: an array of path segments.
  const segments = req.query.path;
  const upstreamPath = Array.isArray(segments)
    ? segments.join('/')
    : (segments || '');

  // Forward all query params except the internal 'path' routing key
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue; // injected by Vercel routing, not a real param
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, v));
    } else {
      params.set(key, value);
    }
  }

  const qs          = params.toString();
  const upstreamUrl = `${UPSTREAM_BASE}/${upstreamPath}${qs ? `?${qs}` : ''}`;

  // ── Proxy the request ──────────────────────────────────────────────────
  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      method:  'GET',
      headers: {
        Accept:       'application/json',
        'User-Agent': 'RaiderPortal/1.0 (https://raiderportal.vercel.app)',
      },
    });
  } catch (networkErr) {
    console.error('[proxy] Network error reaching MetaForge:', networkErr);
    return res.status(502).json({
      error:   'upstream_unreachable',
      message: `Could not reach MetaForge: ${networkErr.message}`,
      url:     upstreamUrl,
    });
  }

  // Read the body regardless of status so we can forward error bodies too
  let body;
  try {
    body = await upstream.json();
  } catch {
    return res.status(upstream.status).json({
      error:   'invalid_upstream_response',
      message: 'MetaForge returned a non-JSON response.',
      status:  upstream.status,
      url:     upstreamUrl,
    });
  }

  res.setHeader('Content-Type', 'application/json');
  return res.status(upstream.status).json(body);
};
