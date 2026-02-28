# RaiderPortal — Map Data Endpoint Audit

> Conducted: 2026-02-28
> Endpoint: `https://metaforge.app/api/game-map-data` (root `/api/` path, NOT under `/api/arc-raiders/`)
> Note: Previous audit incorrectly probed `/api/arc-raiders/game-map-data` — all 404s were because of the wrong base path.

---

## 1. Endpoint Discovery

The endpoint **exists** and responds with structured JSON errors rather than HTML 404s, confirming it is a live, registered route.

---

## 2. Parameter Discovery

### Step 1 — No parameters

```
GET /api/game-map-data
HTTP 500  {"error":"mapID: null does not exist"}
```

The API requires a `mapID` parameter.

### Step 2 — `?mapID=<value>` (slug guesses)

All tested map slugs return the same response — the API does **not** validate the `mapID` value itself, only checks that the parameter is present:

```
GET /api/game-map-data?mapID=dam           → HTTP 500  {"error":"tableID: null does not exist"}
GET /api/game-map-data?mapID=spaceport     → HTTP 500  {"error":"tableID: null does not exist"}
GET /api/game-map-data?mapID=buried-city   → HTTP 500  {"error":"tableID: null does not exist"}
GET /api/game-map-data?mapID=blue-gate     → HTTP 500  {"error":"tableID: null does not exist"}
GET /api/game-map-data?mapID=stella-montis → HTTP 500  {"error":"tableID: null does not exist"}
GET /api/game-map-data?mapID=INVALID_XYZ   → HTTP 500  {"error":"tableID: null does not exist"}
```

The API requires a second `tableID` parameter.

### Step 3 — `?mapID=<value>&tableID=<value>`

All `tableID` values tried return `"not allowed"` regardless of the `mapID` value:

```
GET /api/game-map-data?mapID=dam&tableID=spawns      → HTTP 500  {"error":"not allowed"}
GET /api/game-map-data?mapID=dam&tableID=containers  → HTTP 500  {"error":"not allowed"}
GET /api/game-map-data?mapID=dam&tableID=loot        → HTTP 500  {"error":"not allowed"}
GET /api/game-map-data?mapID=dam&tableID=items       → HTTP 500  {"error":"not allowed"}
GET /api/game-map-data?mapID=dam&tableID=locations   → HTTP 500  {"error":"not allowed"}
GET /api/game-map-data?mapID=dam&tableID=1           → HTTP 500  {"error":"not allowed"}
GET /api/game-map-data?mapID=dam&tableID=2           → HTTP 500  {"error":"not allowed"}
GET /api/game-map-data?mapID=INVALID_XYZ&tableID=spawns → HTTP 500  {"error":"not allowed"}
```

Critically: **the same `"not allowed"` response is returned for both valid and invalid `mapID` values once `tableID` is provided.** This confirms the error is an access control rejection, not a value validation error.

---

## 3. Confirmed API Shape

The endpoint takes two required query parameters:

| Parameter | Role | Notes |
|---|---|---|
| `mapID` | Identifies the map | Presence is checked; value is not validated against known slugs |
| `tableID` | Selects a data table within the map | Access-controlled; all values return `"not allowed"` for unauthenticated requests |

---

## 4. Access Status

**The endpoint is gated.** The `"not allowed"` error is an access control response, not a missing-value or wrong-value error. This means one of:

1. The endpoint requires an **API key** (passed as header or query param) that we don't have
2. The endpoint is **not yet publicly released** — it exists in the router but is not documented as publicly accessible
3. Valid `tableID` values are only discoverable through authenticated access

The public MetaForge API docs at `https://metaforge.app/arc-raiders/api` list the endpoint as `GET /api/game-map-data — Retrieve map data for specific maps` but provide no parameter documentation, no valid tableID values, and no auth instructions.

---

## 5. Alternative Parameters Ruled Out

| Param name tried | Result |
|---|---|
| `?map=dam` | `"mapID: null does not exist"` — `map` is not the correct param name |
| `?id=dam` | `"mapID: null does not exist"` — `id` is not the correct param name |
| `?mapSlug=dam` | `"mapID: null does not exist"` — not the correct param name |
| `?mapID=<uuid from locations[]>` | `"tableID: null does not exist"` — UUIDs pass mapID check, but tableID still required |

---

## 6. Conclusions

### What we now know

- The correct endpoint path is `/api/game-map-data` (root), **not** `/api/arc-raiders/game-map-data`
- The endpoint is live and parses requests properly
- It requires `mapID` + `tableID` — a two-level addressing scheme (map → data table)
- Access to any `tableID` is currently blocked for unauthenticated public requests

### What this means for RaiderPortal

- **No change to the current Locations section** — the 3-tier badge design (zone types / map pins for keys / "coming soon") is the right approach given available data
- The `locations[].id` values in item data are almost certainly `tableID` values — they identify a specific row/record in a map data table. Once MetaForge opens public access to this endpoint, those UUIDs will resolve to named containers/spawn points
- Monitor MetaForge API changelog for `/api/game-map-data` public release or API key program
- No workaround is possible without authentication credentials

### Recommended next check

If MetaForge has a Discord or community developer channel, ask about:
- Whether `/api/game-map-data` will be publicly available
- What valid `tableID` values look like (numeric vs UUID vs string)
- Whether an API key program exists for third-party tools like RaiderPortal
