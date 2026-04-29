class TomtomTrafficCard extends HTMLElement {
  static getStubConfig() {
    return {
      api_key: "",
      center: [-82.9988, 39.9612],
      zoom: 11,
      height: "500px",
      flow_style: "relative",
      opacity: 0.85,
    };
  }

  static getConfigElement() {
    return document.createElement("tomtom-traffic-card-editor");
  }

  setConfig(config) {
    if (!config || !config.api_key) {
      throw new Error("tomtom-traffic-card: api_key is required");
    }

    const defaults = {
      center: [-82.9988, 39.9612],
      zoom: 11,
      height: "500px",
      flow_style: "relative",
      opacity: 0.85,
    };

    const merged = { ...defaults, ...config };
    const validStyles = ["absolute", "relative", "relative-delay"];

    if (!Array.isArray(merged.center) || merged.center.length !== 2) {
      throw new Error("tomtom-traffic-card: center must be [lng, lat]");
    }

    if (!validStyles.includes(merged.flow_style)) {
      throw new Error(
        `tomtom-traffic-card: flow_style must be one of ${validStyles.join(", ")}`
      );
    }

    this._config = merged;

    if (this._map && this._mapReady) {
      this._updateMapFromConfig();
    }
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  constructor() {
    super();
    this._config = null;
    this._hass = null;
    this._map = null;
    this._mapReady = false;
    this._mapContainer = null;
    this._loadPromise = null;
    this._initialized = false;

    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this._render();
  }

  disconnectedCallback() {
    if (this._map) {
      this._map.remove();
      this._map = null;
      this._mapReady = false;
      this._initialized = false;
    }
  }

  getCardSize() {
    return 5;
  }

  _render() {
    if (!this._config) {
      return;
    }

    if (!this.shadowRoot.querySelector("ha-card")) {
      this.shadowRoot.innerHTML = `
        <ha-card header="TomTom Traffic">
          <div id="map" part="map"></div>
        </ha-card>
        <style>
          :host {
            display: block;
          }
          ha-card {
            overflow: hidden;
          }
          #map {
            width: 100%;
            min-height: 250px;
          }
        </style>
      `;
    }

    this._mapContainer = this.shadowRoot.getElementById("map");
    this._mapContainer.style.height = this._config.height || "500px";

    if (!this._initialized) {
      this._initialized = true;
      this._initMap();
    }
  }

  async _initMap() {
    try {
      await this._ensureMapLibreLoaded();

      if (!this._mapContainer || this._map) {
        return;
      }

      const { center, zoom } = this._config;

      this._map = new window.maplibregl.Map({
        container: this._mapContainer,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: [
                "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
              ],
              tileSize: 256,
              attribution:
                "© OpenStreetMap contributors, Traffic © TomTom",
            },
          },
          layers: [
            {
              id: "osm-base",
              type: "raster",
              source: "osm",
              minzoom: 0,
              maxzoom: 22,
            },
          ],
        },
        center,
        zoom,
      });

      this._map.addControl(new window.maplibregl.NavigationControl(), "top-right");

      this._map.on("load", () => {
        this._addOrUpdateFlowLayer();
        this._mapReady = true;
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("tomtom-traffic-card: failed to initialize map", error);
      this.shadowRoot.innerHTML = `
        <ha-card>
          <div style="padding: 16px; color: var(--error-color);">
            Failed to load map. Check browser console for details.
          </div>
        </ha-card>
      `;
    }
  }

  _updateMapFromConfig() {
    if (!this._map || !this._config) {
      return;
    }

    this._mapContainer.style.height = this._config.height || "500px";
    this._map.setCenter(this._config.center);
    this._map.setZoom(this._config.zoom);
    this._addOrUpdateFlowLayer();
    this._map.resize();
  }

  _addOrUpdateFlowLayer() {
    if (!this._map || !this._config) {
      return;
    }

    const sourceId = "tomtom-flow-source";
    const layerId = "tomtom-flow-layer";

    const tileUrl = `https://api.tomtom.com/traffic/map/4/tile/flow/${this._config.flow_style}/{z}/{x}/{y}.png?key=${encodeURIComponent(this._config.api_key)}`;

    const existingLayer = this._map.getLayer(layerId);
    if (existingLayer) {
      this._map.removeLayer(layerId);
    }

    const existingSource = this._map.getSource(sourceId);
    if (existingSource) {
      this._map.removeSource(sourceId);
    }

    this._map.addSource(sourceId, {
      type: "raster",
      tiles: [tileUrl],
      tileSize: 256,
    });

    this._map.addLayer({
      id: layerId,
      type: "raster",
      source: sourceId,
      paint: {
        "raster-opacity": this._config.opacity,
      },
    });
  }

  _ensureMapLibreLoaded() {
    if (window.maplibregl) {
      return Promise.resolve();
    }

    if (this._loadPromise) {
      return this._loadPromise;
    }

    this._loadPromise = new Promise((resolve, reject) => {
      const existingCss = document.querySelector(
        'link[data-tomtom-traffic-card="maplibre-css"]'
      );
      if (!existingCss) {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
        css.dataset.tomtomTrafficCard = "maplibre-css";
        document.head.appendChild(css);
      }

      const existingScript = document.querySelector(
        'script[data-tomtom-traffic-card="maplibre-js"]'
      );

      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener(
          "error",
          () => reject(new Error("Failed to load MapLibre script")),
          { once: true }
        );

        if (window.maplibregl) {
          resolve();
        }
        return;
      }

      const script = document.createElement("script");
      script.src = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
      script.async = true;
      script.dataset.tomtomTrafficCard = "maplibre-js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load MapLibre script"));
      document.head.appendChild(script);
    });

    return this._loadPromise;
  }
}

class TomtomTrafficCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = {
      ...TomtomTrafficCard.getStubConfig(),
      ...(config || {}),
    };
    this._render();
  }

  _render() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }

    this.shadowRoot.innerHTML = `
      <div class="editor-note">
        Visual editor is not available yet for this card.<br />
        Continue editing the YAML configuration directly.
      </div>
      <style>
        .editor-note {
          font-size: 0.95rem;
          line-height: 1.4;
          color: var(--secondary-text-color);
          padding: 12px 0;
        }
      </style>
    `;
  }
}

customElements.define("tomtom-traffic-card-editor", TomtomTrafficCardEditor);

customElements.define("tomtom-traffic-card", TomtomTrafficCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "tomtom-traffic-card",
  name: "TomTom Traffic Card",
  description:
    "Displays an OpenStreetMap base map with TomTom Traffic Flow raster overlay.",
});
