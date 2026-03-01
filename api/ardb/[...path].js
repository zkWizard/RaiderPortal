/**
 * api/ardb/[...path].js
 *
 * Vercel catch-all serverless proxy for the ARDB ARC Raiders API.
 *
 * Forwards any request to /api/ardb/* → https://ardb.app/api/*
 * and streams the JSON response back to the caller with CORS headers set,
 * so browser clients on any origin can reach ARDB without CORS errors.
 *
 * Example:
 *   GET /api/ardb/items
 *   → https://ardb.app/api/items
 *
 *   GET /api/ardb/items/adrenaline_shot
 *   → https://ardb.app/api/items/adrenaline_shot
 */

const UPSTREAM_BASE = 'https://ardb.app/api';

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
  const segments = req.query.path;
  let upstreamPath;
  if (Array.isArray(segments) && segments.length > 0) {
    upstreamPath = segments.join('/');
  } else if (segments) {
    upstreamPath = segments;
  } else {
    const urlPath = (req.url || '').split('?')[0];
    upstreamPath = urlPath.replace(/^\/api\/ardb\/?/, '');
  }

  // Forward all query params except the internal 'path' routing key
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue;
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
    console.error('[proxy] Network error reaching ARDB:', networkErr);
    return res.status(502).json({
      error:   'upstream_unreachable',
      message: `Could not reach ARDB: ${networkErr.message}`,
      url:     upstreamUrl,
    });
  }

  let body;
  try {
    body = await upstream.json();
  } catch {
    return res.status(upstream.status).json({
      error:   'invalid_upstream_response',
      message: 'ARDB returned a non-JSON response.',
      status:  upstream.status,
      url:     upstreamUrl,
    });
  }

  res.setHeader('Content-Type', 'application/json');
  return res.status(upstream.status).json(body);
};
