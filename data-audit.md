# RaiderPortal — Location Data Audit

> Conducted: 2026-02-28
> Source: MetaForge ARC Raiders API (`https://metaforge.app/api/arc-raiders`)
> Total items audited: **527**

---

## 1. Item Field Inventory

Every item in the API returns the same 21 fields at 100% coverage (all fields present even when null/empty):

| Field | Type | Coverage | Notes |
|---|---|---|---|
| `id` | string | 100% | URL-safe slug, e.g. `"acoustic-guitar"` |
| `name` | string | 100% | Display name |
| `description` | string | 100% | Some empty string `""` |
| `item_type` | string | 100% | 24 distinct values (see §4) |
| `loadout_slots` | array | 100% | Empty `[]` for non-equippable items |
| `icon` | string | 100% | CDN URL — `https://cdn.metaforge.app/arc-raiders/icons/{id}.webp` |
| `rarity` | string | 100% | Common / Uncommon / Rare / Epic / Legendary |
| `value` | number | 100% | Base Raider Coins value |
| `workbench` | string\|null | 100% | Crafting bench name, null if not craftable |
| `stat_block` | object | 100% | ~40 numeric stat fields |
| `flavor_text` | string\|null | 100% | Empty string or null when absent |
| `subcategory` | string\|null | 100% | E.g. `"Hand Cannon"`, often null |
| `created_at` | string | 100% | ISO timestamp |
| `updated_at` | string | 100% | ISO timestamp |
| `shield_type` | string\|null | 100% | `"heavy"` / `"light"` / null |
| `loot_area` | string\|null | 36% | Comma-separated zone types — **see §2** |
| `sources` | null | 0% | **Always null — no data** |
| `ammo_type` | string\|null | 100% | Empty string or null when absent |
| `locations` | array | 3% | Sparse — **see §3** |
| `guide_links` | array | 6% | 29 items have community guide URLs |
| `game_asset_id` | number | 100% | **Always `-9999` — placeholder, not useful** |

---

## 2. `loot_area` Field

- **189 items** (36%) have a non-empty `loot_area` string.
- **338 items** (64%) have null or empty `loot_area`.
- Format: **comma-separated zone type strings** — this is a zone *category* (e.g. `"Electrical"`, `"Mechanical"`), **not a map name**.
- There is no map-to-zone mapping in the API.

### loot_area value frequency (descending)

| Value | Count |
|---|---|
| `ARC` | 38 |
| `Exodus` | 21 |
| `Residential` | 20 |
| `Nature` | 13 |
| `Commercial, Residential` | 13 |
| `Security` | 12 |
| `Industrial` | 9 |
| `Mechanical` | 7 |
| `Medical` | 6 |
| `Electrical` | 5 |
| `Technological` | 4 |
| `Residential, Commercial` | 4 |
| `Raider, Security` | 4 |
| `Commercial` | 3 |
| `Old World, Commercial, Residential` | 3 |
| `Old World, Residential` | 3 |
| `Security, Industrial` | 2 |
| `Residential, Old World` | 2 |
| `Electrical, Commercial, Residential` | 2 |
| `Mechanical, Industrial` | 2 |
| *(15 more single-item combinations)* | 15 |

---

## 3. `locations[]` Field

- **16 items** (3%) have a non-empty `locations` array. **All 16 are Key items.**
- **511 items** (97%) have `locations: []`.

### Location entry schema

Each entry has exactly **2 fields**:

```json
{ "id": "uuid-or-hash", "map": "dam" }
```

- `id` — UUID/hash that likely references a spawn point or container in a (not-yet-available) `/game-map-data` endpoint.
- `map` — lowercase map slug. Values seen: `"dam"`, `"buried-city"`.

### All 16 items with location data

| Item | `loot_area` | Location entries | Maps |
|---|---|---|---|
| Blue Gate Cellar Key | *(empty)* | 2 | `dam`, `dam` |
| Blue Gate Communication Tower Key | *(empty)* | 1 | `dam` |
| Blue Gate Confiscation Room Key | *(empty)* | 1 | `dam` |
| Buried City Hospital Key | *(empty)* | 1 | `dam` |
| Buried City Residential Master Key | *(empty)* | 3 | `dam`, `dam`, `dam` |
| Buried City Town Hall Key | *(empty)* | 1 | `buried-city` ✓ |
| Dam Control Center Tower Key | *(empty)* | 1 | `dam` |
| Dam Staff Room Key | *(empty)* | 1 | `dam` |
| Dam Surveillance Key | *(empty)* | 1 | `dam` |
| Dam Testing Annex Key | *(empty)* | 2 | `dam`, `dam` |
| Patrol Car Key | *(empty)* | 1 | `dam` |
| Spaceport Container Storage Key | *(empty)* | 1 | `dam` |
| Spaceport Control Tower Key | *(empty)* | 1 | `dam` |
| Spaceport Trench Tower Key | *(empty)* | 1 | `dam` |
| Spaceport Warehouse Key | *(empty)* | 1 | `dam` |
| Stella Montis Archives Key | *(empty)* | 1 | `dam` |

**Data quality issue:** 15 of 16 items have `"map": "dam"` regardless of which map their name references. Only "Buried City Town Hall Key" has a correct `"map": "buried-city"` entry. This is likely WIP/placeholder data being populated in the MetaForge database.

**Total location entries:** 20 across 16 items
**Unique map values seen:** `dam`, `buried-city` only
**Maps with zero entries:** `spaceport`, `blue-gate`, `stella-montis`

---

## 4. `item_type` Breakdown

| item_type | Count |
|---|---|
| Recyclable | 114 |
| Weapon | 75 |
| Blueprint | 74 |
| Quick Use | 47 |
| Trinket | 36 |
| Modification | 36 |
| Topside Material | 27 |
| Key | 26 |
| Misc | 24 |
| Augment | 15 |
| Nature | 13 |
| Refined Material | 9 |
| Ammunition | 6 |
| Basic Material | 5 |
| Throwable | 4 |
| Quest Item | 3 |
| Shield | 3 |
| Advanced Material | 2 |
| Cosmetic | 2 |
| Material | 2 |
| Consumable | 1 |
| Gadget | 1 |
| Quick use | 1 |
| Mods | 1 |

---

## 5. Map Data Endpoints — Probe Results

All 18 candidate endpoint patterns were probed directly against `https://metaforge.app/api/arc-raiders/*`.

| Endpoint | Status | Result |
|---|---|---|
| `/game-map-data` | 404 | HTML error page |
| `/maps` | 404 | HTML error page |
| `/locations` | 404 | HTML error page |
| `/game-map-data?map=dam` | 404 | HTML error page |
| `/game-map-data?map=spaceport` | 404 | HTML error page |
| `/game-map-data?map=buried-city` | 404 | HTML error page |
| `/game-map-data?map=blue-gate` | 404 | HTML error page |
| `/game-map-data?map=stella-montis` | 404 | HTML error page |
| `/maps/dam` | 404 | HTML error page |
| `/maps/spaceport` | 404 | HTML error page |
| `/maps/buried-city` | 404 | HTML error page |
| `/maps/blue-gate` | 404 | HTML error page |
| `/maps/stella-montis` | 404 | HTML error page |
| `/locations/dam` | 404 | HTML error page |
| `/locations/spaceport` | 404 | HTML error page |
| `/locations/buried-city` | 404 | HTML error page |
| `/locations/blue-gate` | 404 | HTML error page |
| `/locations/stella-montis` | 404 | HTML error page |

**`/items?map=<name>` bonus check:** Returns HTTP 200 but the `?map=` param is silently ignored — all 527 items are returned regardless. The filter does nothing.

---

## 6. Conclusions & Implications for Locations UI

### What we have
- `loot_area` — zone-type hint for 36% of items. Useful for a "Found In" label but not map-specific.
- `locations[]` — 16 Key items only; shape `{ id, map }`. `id` is an opaque reference to a spawn point in a not-yet-available game map data endpoint. Map values are mostly wrong (data entry WIP at MetaForge).

### What we don't have
- No map-specific data for any item type other than Keys.
- No spawn coordinates, container types, zone-within-map, or community votes.
- No dedicated map/locations API endpoint — all 404.
- `sources` is always null.
- `game_asset_id` is always `-9999` (placeholder).

### Recommended approach for the Locations section
1. **Keep the 5-map card grid UI** — it is correctly future-proofed for when MetaForge populates the data.
2. **Show "No location data yet"** for 511/527 items — this is accurate and honest.
3. **For the 16 Key items** — show the map name from `locations[].map` if it resolves to one of our 5 known maps; skip/ignore entries with data-quality issues (wrong map for the item name) until MetaForge fixes their data.
4. **The `loot_area` "Found In" section** remains the best current source of location-adjacent context — keep it as a separate section.
5. **The `locations[].id` field** will become meaningful once MetaForge ships a `/game-map-data` endpoint — at that point the IDs can be resolved to named containers/rooms. No action needed now.
6. **Do not use `?map=` on `/items`** — it is a no-op.
