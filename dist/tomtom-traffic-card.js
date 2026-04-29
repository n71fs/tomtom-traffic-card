class TomtomTrafficCard extends HTMLElement {
  static getStubConfig() {
    return {
      api_key: "",
      center: [-82.9988, 39.9612],
      zoom: 11,
      height: "500px",
      flow_style: "relative0",
      opacity: 0.85,
      thickness: 10,
      tile_size: 256,
      base_url: "api.tomtom.com",
      basemap: "osm",
      title: "",
      show_title: false,
      lock_map: false,
      markers: [],
    };
  }

  static getConfigElement() {
    return document.createElement("tomtom-traffic-card-editor");
  }

  setConfig(config) {
    const defaults = {
      center: [-82.9988, 39.9612],
      zoom: 11,
      height: "500px",
      flow_style: "relative0",
      opacity: 0.85,
      thickness: 10,
      tile_size: 256,
      base_url: "api.tomtom.com",
      basemap: "osm",
      title: "",
      show_title: false,
      lock_map: false,
      markers: [],
    };

    const merged = { ...defaults, ...config };
    const validStyles = ["absolute", "relative", "relative0", "relative0-dark", "relative-delay", "reduced-sensitivity"];
    const validTileSizes = [256, 512];
    const validBaseUrls = ["api.tomtom.com", "kr-api.tomtom.com"];
    const validBasemaps = ["osm", "carto_light", "carto_dark", "topo"];
    if (!Array.isArray(merged.markers)) {
      throw new Error("tomtom-traffic-card: markers must be an array");
    }

    if (!Array.isArray(merged.center) || merged.center.length !== 2) {
      throw new Error("tomtom-traffic-card: center must be [lng, lat]");
    }

    if (!validStyles.includes(merged.flow_style)) {
      throw new Error(
        `tomtom-traffic-card: flow_style must be one of ${validStyles.join(", ")}`
      );
    }

    if (merged.opacity < 0 || merged.opacity > 1) {
      throw new Error("tomtom-traffic-card: opacity must be between 0 and 1");
    }

    if (!Number.isInteger(merged.thickness) || merged.thickness < 1 || merged.thickness > 20) {
      throw new Error("tomtom-traffic-card: thickness must be an integer between 1 and 20");
    }

    if (!validTileSizes.includes(merged.tile_size)) {
      throw new Error(`tomtom-traffic-card: tile_size must be one of ${validTileSizes.join(", ")}`);
    }

    if (!validBaseUrls.includes(merged.base_url)) {
      throw new Error(`tomtom-traffic-card: base_url must be one of ${validBaseUrls.join(", ")}`);
    }
    if (!validBasemaps.includes(merged.basemap)) {
      throw new Error(`tomtom-traffic-card: basemap must be one of ${validBasemaps.join(", ")}`);
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
    this._markers = [];
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
      this._markers = [];
      this._mapReady = false;
      this._initialized = false;
    }
  }

  getCardSize() {
    return 5;
  }

  _getBasemapDefinition(basemap) {
    const basemaps = {
      osm: {
        sourceId: "osm",
        source: {
          type: "raster",
          tiles: [
            "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors, Traffic © TomTom",
        },
      },
      carto_light: {
        sourceId: "carto-light",
        source: {
          type: "raster",
          tiles: ["https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors © CARTO, Traffic © TomTom",
        },
      },
      carto_dark: {
        sourceId: "carto-dark",
        source: {
          type: "raster",
          tiles: ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors © CARTO, Traffic © TomTom",
        },
      },
      topo: {
        sourceId: "topo",
        source: {
          type: "raster",
          tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution:
            "© OpenTopoMap (CC-BY-SA) © OpenStreetMap contributors, Traffic © TomTom",
        },
      },
    };

    return basemaps[basemap] || basemaps.osm;
  }

  _buildStyleForBasemap() {
    const definition = this._getBasemapDefinition(this._config.basemap);
    return {
      version: 8,
      sources: {
        [definition.sourceId]: definition.source,
      },
      layers: [
        {
          id: "basemap-layer",
          type: "raster",
          source: definition.sourceId,
          minzoom: 0,
          maxzoom: 22,
        },
      ],
    };
  }

  _render() {
    if (!this._config) {
      return;
    }

    if (!this.shadowRoot.querySelector("ha-card")) {
      this.shadowRoot.innerHTML = `
        <ha-card>
          <div id="frame">
            <div id="map" part="map"></div>
            <div id="title" part="title"></div>
          </div>
        </ha-card>
        <style>
          :host {
            display: block;
          }
          ha-card {
            overflow: hidden;
            border-radius: 16px;
          }
          #frame {
            position: relative;
          }
          #map {
            width: 100%;
            min-height: 250px;
          }
          #title {
            position: absolute;
            top: 14px;
            left: 14px;
            right: 14px;
            z-index: 2;
            color: #fff;
            font-size: 1.05rem;
            font-weight: 600;
            letter-spacing: 0.01em;
            line-height: 1.3;
            padding: 10px 14px;
            border-radius: 12px;
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            background: linear-gradient(180deg, rgba(0, 0, 0, 0.58), rgba(0, 0, 0, 0.3));
            box-shadow: 0 8px 18px rgba(0, 0, 0, 0.24);
            pointer-events: none;
            display: none;
          }
        </style>
      `;
    }

    this._mapContainer = this.shadowRoot.getElementById("map");
    this._mapContainer.style.height = this._config.height || "500px";
    const titleEl = this.shadowRoot.getElementById("title");
    const title = (this._config.title || "").trim();
    if (this._config.show_title && title) {
      titleEl.textContent = title;
      titleEl.style.display = "block";
    } else {
      titleEl.textContent = "";
      titleEl.style.display = "none";
    }


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
        style: this._buildStyleForBasemap(),
        transformRequest: (url, resourceType) => {
          const needsReferer =
            resourceType === "Tile" &&
            (url.includes("openstreetmap.org") ||
              url.includes("opentopomap.org") ||
              url.includes("cartocdn.com"));
          if (needsReferer) {
            return { url, referrerPolicy: "origin" };
          }
          return { url };
        },
        center,
        zoom,
        dragPan: !this._config.lock_map,
        scrollZoom: !this._config.lock_map,
        doubleClickZoom: !this._config.lock_map,
        boxZoom: !this._config.lock_map,
        dragRotate: !this._config.lock_map,
        keyboard: !this._config.lock_map,
        touchZoomRotate: !this._config.lock_map,
      });

      this._map.on("load", () => {
        this._addOrUpdateFlowLayer();
        this._applyInteractionLock();
        this._addOrUpdateMarkers();
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
    this._map.setStyle(this._buildStyleForBasemap());
    this._map.once("styledata", () => {
      this._map.setCenter(this._config.center);
      this._map.setZoom(this._config.zoom);
      this._addOrUpdateFlowLayer();
      this._applyInteractionLock();
      this._addOrUpdateMarkers();
    });
    this._map.resize();
  }

  _applyInteractionLock() {
    if (!this._map) return;
    const lock = Boolean(this._config.lock_map);
    const method = lock ? "disable" : "enable";
    this._map.dragPan[method]();
    this._map.scrollZoom[method]();
    this._map.boxZoom[method]();
    this._map.dragRotate[method]();
    this._map.keyboard[method]();
    this._map.doubleClickZoom[method]();
    this._map.touchZoomRotate[method]();
  }

  _addOrUpdateMarkers() {
    if (!this._map) return;
    this._markers.forEach((marker) => marker.remove());
    this._markers = [];
    (this._config.markers || []).forEach((markerConfig) => {
      if (!Array.isArray(markerConfig?.center) || markerConfig.center.length !== 2) return;
      const markerElement = document.createElement("div");
      markerElement.style.display = "grid";
      markerElement.style.placeItems = "center";
      markerElement.style.width = "28px";
      markerElement.style.height = "28px";
      markerElement.style.borderRadius = "50%";
      markerElement.style.background = markerConfig.color || "#1d4ed8";
      markerElement.style.color = "#fff";
      markerElement.style.fontSize = "16px";
      markerElement.style.fontWeight = "700";
      markerElement.style.boxShadow = "0 2px 8px rgba(0,0,0,0.35)";
      markerElement.textContent = markerConfig.icon || "•";
      const marker = new window.maplibregl.Marker({ element: markerElement })
        .setLngLat(markerConfig.center);
      if (markerConfig.label) {
        marker.setPopup(new window.maplibregl.Popup({ offset: 20 }).setText(markerConfig.label));
      }
      marker.addTo(this._map);
      this._markers.push(marker);
    });
  }

  _addOrUpdateFlowLayer() {
    if (!this._map || !this._config) {
      return;
    }

    const sourceId = "tomtom-flow-source";
    const layerId = "tomtom-flow-layer";

    const existingLayer = this._map.getLayer(layerId);
    if (existingLayer) {
      this._map.removeLayer(layerId);
    }

    const existingSource = this._map.getSource(sourceId);
    if (existingSource) {
      this._map.removeSource(sourceId);
    }

    if (!this._config.api_key) {
      return;
    }

    const params = new URLSearchParams({
      key: this._config.api_key,
      tileSize: String(this._config.tile_size),
    });

    const thicknessCompatible = ["absolute", "relative", "relative-delay", "reduced-sensitivity"];
    if (thicknessCompatible.includes(this._config.flow_style)) {
      params.set("thickness", String(this._config.thickness));
    }

    const tileUrl = `https://${this._config.base_url}/traffic/map/4/tile/flow/${this._config.flow_style}/{z}/{x}/{y}.png?${params.toString()}`;

    this._map.addSource(sourceId, {
      type: "raster",
      tiles: [tileUrl],
      tileSize: this._config.tile_size,
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
      <div class="editor-grid">
        <label>
          Title (Optional)
          <input data-key="title" type="text" value="${this._config.title || ""}" placeholder="Traffic around Downtown" />
        </label>
        <label>
          Show Title
          <select data-key="show_title">
            <option value="false" ${this._config.show_title ? "" : "selected"}>No</option>
            <option value="true" ${this._config.show_title ? "selected" : ""}>Yes</option>
          </select>
        </label>
        <label>
          Lock Map Position
          <select data-key="lock_map">
            <option value="false" ${this._config.lock_map ? "" : "selected"}>No (Allow movement)</option>
            <option value="true" ${this._config.lock_map ? "selected" : ""}>Yes</option>
          </select>
        </label>
        <label>
          API Key
          <input data-key="api_key" type="text" value="${this._config.api_key || ""}" />
        </label>
        <label>
          Center Longitude
          <input data-key="center_lng" type="number" step="any" value="${this._config.center?.[0] ?? -82.9988}" />
        </label>
        <label>
          Center Latitude
          <input data-key="center_lat" type="number" step="any" value="${this._config.center?.[1] ?? 39.9612}" />
        </label>
        <label>
          Zoom
          <input data-key="zoom" type="number" min="0" max="22" step="0.1" value="${this._config.zoom ?? 11}" />
        </label>
        <label>
          Height
          <input data-key="height" type="text" value="${this._config.height || "500px"}" placeholder="e.g. 500px or 60vh" />
        </label>
        <label>
          Flow Style
          <select data-key="flow_style">
            ${["relative0", "relative0-dark", "relative", "absolute", "relative-delay", "reduced-sensitivity"]
              .map(
                (style) =>
                  `<option value="${style}" ${this._config.flow_style === style ? "selected" : ""}>${style}</option>`
              )
              .join("")}
          </select>
        </label>
        <label>
          Basemap
          <select data-key="basemap">
            ${[
              ["osm", "OpenStreetMap"],
              ["carto_light", "CARTO Light"],
              ["carto_dark", "CARTO Dark"],
              ["topo", "OpenTopoMap"],
            ]
              .map(
                ([key, label]) =>
                  `<option value="${key}" ${this._config.basemap === key ? "selected" : ""}>${label}</option>`
              )
              .join("")}
          </select>
        </label>
        <label>
          Overlay Opacity (0.0 - 1.0)
          <input data-key="opacity" type="number" min="0" max="1" step="0.05" value="${this._config.opacity ?? 0.85}" />
        </label>
        <label>
          Thickness (1 - 20)
          <input data-key="thickness" type="number" min="1" max="20" step="1" value="${this._config.thickness ?? 10}" />
        </label>
        <label>
          Tile Size
          <select data-key="tile_size">
            ${[256, 512]
              .map(
                (size) =>
                  `<option value="${size}" ${Number(this._config.tile_size) === size ? "selected" : ""}>${size}</option>`
              )
              .join("")}
          </select>
        </label>
        <label>
          TomTom Base URL
          <select data-key="base_url">
            ${["api.tomtom.com", "kr-api.tomtom.com"]
              .map(
                (baseUrl) =>
                  `<option value="${baseUrl}" ${this._config.base_url === baseUrl ? "selected" : ""}>${baseUrl}</option>`
              )
              .join("")}
          </select>
        </label>
        <label>
          Markers (JSON Array)
          <input data-key="markers" type="text" value='${JSON.stringify(this._config.markers || [])}' placeholder='[{"center":[-82.99,39.96],"icon":"🏠","label":"Home"}]' />
        </label>
      </div>
      <style>
        .editor-grid {
          display: grid;
          gap: 12px;
          padding: 8px 0;
        }
        label {
          display: grid;
          gap: 6px;
          font-size: 0.95rem;
          color: var(--primary-text-color);
        }
        input,
        select {
          font: inherit;
          padding: 8px;
          border-radius: 8px;
          border: 1px solid var(--divider-color);
          background: var(--card-background-color);
          color: var(--primary-text-color);
        }
      </style>
    `;

    this.shadowRoot.querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("change", (event) => this._handleChange(event));
    });
  }

  _handleChange(event) {
    const key = event.target.dataset.key;
    const value = event.target.value;
    const next = { ...this._config };

    if (key === "center_lng" || key === "center_lat") {
      const lng = Number(
        this.shadowRoot.querySelector('input[data-key="center_lng"]').value
      );
      const lat = Number(
        this.shadowRoot.querySelector('input[data-key="center_lat"]').value
      );
      next.center = [lng, lat];
    } else if (key === "zoom" || key === "opacity" || key === "thickness" || key === "tile_size") {
      next[key] = Number(value);
    } else if (key === "show_title" || key === "lock_map") {
      next[key] = value === "true";
    } else if (key === "markers") {
      try {
        next.markers = value.trim() ? JSON.parse(value) : [];
      } catch (_error) {
        return;
      }
    } else {
      next[key] = value;
    }

    this._config = next;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: next },
        bubbles: true,
        composed: true,
      })
    );
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
