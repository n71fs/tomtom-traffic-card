# tomtom-traffic-card

A **frontend-only** Home Assistant Lovelace custom card that renders a MapLibre map with:

- Selectable raster basemap (`osm`, `carto_light`, `carto_dark`, `topo`)
- OpenStreetMap raster base tiles
- TomTom Traffic Flow raster tile overlay

> ⚠️ **Security warning:** This version is frontend-only, so your TomTom API key is exposed to users in the browser/dev tools/network requests. A future backend/proxy integration could hide and protect the key.

## Features

- HACS-compatible dashboard card
- Custom element: `tomtom-traffic-card`
- Uses `<ha-card>`
- Dynamically loads MapLibre GL JS + CSS from CDN (if not already loaded)
- Supports TomTom `flow_style` values:
  - `absolute`
  - `relative`
  - `relative-delay`

## Installation

### Option 1: HACS Custom Repository (recommended)

1. In Home Assistant, open **HACS** → **⋮** (top-right) → **Custom repositories**.
2. Add this repository URL.
3. Category: **Dashboard**.
4. Click **Add**.
5. Search for **TomTom Traffic Card** in HACS and install it.
6. Restart Home Assistant (or reload frontend resources).

HACS metadata uses `content_in_root: false`, so the card is discovered from the `dist/` folder while the resource filename remains `tomtom-traffic-card.js`.

HACS will install/register the frontend resource from:

```text
tomtom-traffic-card.js
```

### Option 2: Manual install

1. Copy `tomtom-traffic-card.js` into your Home Assistant `www` folder, for example:

```text
/config/www/tomtom-traffic-card.js
```

2. Add the resource in Home Assistant:

- **Settings** → **Dashboards** → **Resources** → **Add resource**
- URL: `/local/tomtom-traffic-card.js`
- Resource type: `JavaScript Module`

3. Refresh the browser.

## Lovelace usage

### Minimal

```yaml
type: custom:tomtom-traffic-card
api_key: YOUR_TOMTOM_API_KEY
```

### Full example

```yaml
type: custom:tomtom-traffic-card
api_key: YOUR_TOMTOM_API_KEY
center:
  - -82.9988
  - 39.9612
zoom: 11
height: 500px
flow_style: relative
opacity: 0.85
```

## Card configuration

| Key | Type | Required | Default | Notes |
|---|---|---|---|---|
| `api_key` | string | ❌ | — | TomTom API key for traffic overlay (base map still loads without it). |
| `center` | `[lng, lat]` | ❌ | `[-82.9988, 39.9612]` | Map center coordinates. |
| `zoom` | number | ❌ | `11` | Initial zoom. |
| `height` | string | ❌ | `"500px"` | CSS height for map container. |
| `flow_style` | string | ❌ | `"relative"` | One of: `absolute`, `relative`, `relative-delay`. |
| `opacity` | number | ❌ | `0.85` | Traffic layer opacity (0 to 1). |

## TomTom traffic tile URL used

```text
https://api.tomtom.com/traffic/map/4/tile/flow/{flow_style}/{z}/{x}/{y}.png?key={api_key}
```

## Notes

- This is a standalone custom card and does **not** use Home Assistant’s built-in map card.
- The card validates that `api_key` is present.
- Includes `getCardSize()` and `window.customCards` registration.
- Cleans up the MapLibre instance when disconnected.
