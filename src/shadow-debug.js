/**
 * Shadow Debug Tool (SVG version)
 * Draggable corner handles for positioning SVG polygon shadows
 * Usage: Add ?shadow-debug to URL or call window.shadowDebug.init()
 */

export class ShadowDebugTool {
  constructor() {
    this.layers = {
      contact: { corners: [], polygon: null, filterId: 'contact-blur' },
      penumbra: { corners: [], polygon: null, filterId: 'penumbra-blur' },
      ambient: { corners: [], polygon: null, filterId: 'ambient-blur' }
    };
    this.isDragging = false;
    this.dragCorner = null;
    this.dragLayer = null;
    this.panel = null;
    this.svg = null;
  }

  init() {
    // Get SVG and polygon elements
    this.svg = document.getElementById('emitter-shadows-svg');
    if (!this.svg) {
      console.error('SVG #emitter-shadows-svg not found');
      return;
    }

    this.layers.contact.polygon = document.getElementById('shadow-contact');
    this.layers.penumbra.polygon = document.getElementById('shadow-penumbra');
    this.layers.ambient.polygon = document.getElementById('shadow-ambient');

    // Parse existing polygon points
    for (const [layerName, layer] of Object.entries(this.layers)) {
      if (layer.polygon) {
        const points = layer.polygon.getAttribute('points');
        layer.corners = this.parsePoints(points);
      }
    }

    this.createCornerHandles();
    this.createControlPanel();

    console.log('Shadow debug (SVG) initialized. Drag handles to position shadows.');
    console.log('Red/Green/Blue/Yellow = Contact shadow');
    console.log('Pink/Cyan/Orange/Purple = Penumbra shadow');
    console.log('Lime/Teal/Coral/Violet = Ambient shadow');
  }

  parsePoints(pointsStr) {
    // Parse "x1,y1 x2,y2 x3,y3 x4,y4" format
    return pointsStr.trim().split(/\s+/).map(pair => {
      const [x, y] = pair.split(',').map(Number);
      return { x, y };
    });
  }

  pointsToString(corners) {
    return corners.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  }

  createCornerHandles() {
    document.querySelectorAll('.shadow-debug-handle').forEach(el => el.remove());

    const container = document.body;
    const labels = ['TL', 'TR', 'BR', 'BL'];

    // Colors for each layer
    const colors = {
      contact: ['#ff4444', '#44ff44', '#4444ff', '#ffff44'],
      penumbra: ['#ff88cc', '#44ffff', '#ff8844', '#aa44ff'],
      ambient: ['#88ff44', '#44ffaa', '#ff6666', '#cc88ff']
    };

    const prefixes = { contact: 'C', penumbra: 'P', ambient: 'A' };

    for (const [layerName, layer] of Object.entries(this.layers)) {
      layer.handles = [];

      layer.corners.forEach((pos, i) => {
        const handle = this.createHandle(pos, labels[i], colors[layerName][i], prefixes[layerName]);
        container.appendChild(handle);
        layer.handles.push(handle);

        handle.addEventListener('mousedown', (e) => {
          this.isDragging = true;
          this.dragCorner = i;
          this.dragLayer = layerName;
          e.preventDefault();
        });
      });
    }

    document.addEventListener('mousemove', (e) => this.onDrag(e));
    document.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.dragCorner = null;
      this.dragLayer = null;
    });
  }

  createHandle(pos, label, color, prefix) {
    const handle = document.createElement('div');
    handle.className = 'shadow-debug-handle';
    handle.style.cssText = `
      position: fixed;
      left: ${pos.x}%;
      top: ${pos.y}%;
      width: 20px;
      height: 20px;
      background: ${color};
      border: 2px solid white;
      border-radius: 50%;
      cursor: move;
      z-index: 10000;
      transform: translate(-50%, -50%);
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      pointer-events: auto;
    `;

    const labelEl = document.createElement('span');
    labelEl.style.cssText = `
      position: absolute;
      top: -20px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      font-weight: bold;
      color: white;
      background: rgba(0,0,0,0.8);
      padding: 2px 5px;
      border-radius: 3px;
      font-family: monospace;
      white-space: nowrap;
    `;
    labelEl.textContent = `${prefix}-${label}`;
    handle.appendChild(labelEl);

    return handle;
  }

  createControlPanel() {
    document.querySelector('.shadow-debug-panel')?.remove();

    this.panel = document.createElement('div');
    this.panel.className = 'shadow-debug-panel';
    this.panel.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0,0,0,0.95);
      color: white;
      padding: 15px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 11px;
      z-index: 10001;
      min-width: 350px;
      max-height: 90vh;
      overflow-y: auto;
      pointer-events: auto;
    `;

    this.panel.innerHTML = `
      <div style="margin-bottom: 10px; font-weight: bold; color: #ff6b6b; font-size: 14px;">
        Shadow Debug Tool (SVG)
      </div>

      <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,68,68,0.2); border-radius: 4px;">
        <div style="font-weight: bold; color: #ff6b6b; margin-bottom: 5px;">Contact Shadow (C-*)</div>
        <div id="contact-coords" style="line-height: 1.6;"></div>
        <div style="margin-top: 8px;">
          <label>Opacity: <input type="range" id="contact-opacity" min="10" max="100" value="85" style="width: 80px; vertical-align: middle;"></label>
          <span id="contact-opacity-val" style="margin-left: 5px;">0.85</span>
        </div>
        <div style="margin-top: 5px;">
          <label>Blur: <input type="range" id="contact-blur-slider" min="0" max="30" value="6" step="1" style="width: 80px; vertical-align: middle;"></label>
          <span id="contact-blur-val" style="margin-left: 5px;">0.6</span>
        </div>
      </div>

      <div style="margin-bottom: 15px; padding: 10px; background: rgba(68,255,255,0.2); border-radius: 4px;">
        <div style="font-weight: bold; color: #44ffff; margin-bottom: 5px;">Penumbra Shadow (P-*)</div>
        <div id="penumbra-coords" style="line-height: 1.6;"></div>
        <div style="margin-top: 8px;">
          <label>Opacity: <input type="range" id="penumbra-opacity" min="5" max="80" value="40" style="width: 80px; vertical-align: middle;"></label>
          <span id="penumbra-opacity-val" style="margin-left: 5px;">0.40</span>
        </div>
        <div style="margin-top: 5px;">
          <label>Blur: <input type="range" id="penumbra-blur-slider" min="5" max="50" value="14" step="1" style="width: 80px; vertical-align: middle;"></label>
          <span id="penumbra-blur-val" style="margin-left: 5px;">1.4</span>
        </div>
      </div>

      <div style="margin-bottom: 15px; padding: 10px; background: rgba(136,255,68,0.2); border-radius: 4px;">
        <div style="font-weight: bold; color: #88ff44; margin-bottom: 5px;">Ambient Shadow (A-*)</div>
        <div id="ambient-coords" style="line-height: 1.6;"></div>
        <div style="margin-top: 8px;">
          <label>Opacity: <input type="range" id="ambient-opacity" min="5" max="50" value="20" style="width: 80px; vertical-align: middle;"></label>
          <span id="ambient-opacity-val" style="margin-left: 5px;">0.20</span>
        </div>
        <div style="margin-top: 5px;">
          <label>Blur: <input type="range" id="ambient-blur-slider" min="10" max="80" value="30" step="1" style="width: 80px; vertical-align: middle;"></label>
          <span id="ambient-blur-val" style="margin-left: 5px;">3.0</span>
        </div>
      </div>

      <div style="margin-bottom: 15px;">
        <button id="shadow-copy-svg" style="padding: 8px 12px; cursor: pointer; margin-right: 8px; font-weight: bold;">
          Copy SVG
        </button>
        <button id="shadow-done" style="padding: 8px 12px; cursor: pointer;">
          Done
        </button>
      </div>
    `;

    document.body.appendChild(this.panel);

    // Set initial slider values from current SVG
    this.initSliderValues();

    // Contact shadow controls
    document.getElementById('contact-opacity').addEventListener('input', (e) => {
      const val = e.target.value / 100;
      document.getElementById('contact-opacity-val').textContent = val.toFixed(2);
      this.updatePolygonFill('contact', val);
    });

    document.getElementById('contact-blur-slider').addEventListener('input', (e) => {
      const val = e.target.value / 10; // stdDeviation in SVG units
      document.getElementById('contact-blur-val').textContent = val.toFixed(1);
      this.updateFilterBlur('contact-blur', val);
    });

    // Penumbra shadow controls
    document.getElementById('penumbra-opacity').addEventListener('input', (e) => {
      const val = e.target.value / 100;
      document.getElementById('penumbra-opacity-val').textContent = val.toFixed(2);
      this.updatePolygonFill('penumbra', val);
    });

    document.getElementById('penumbra-blur-slider').addEventListener('input', (e) => {
      const val = e.target.value / 10;
      document.getElementById('penumbra-blur-val').textContent = val.toFixed(1);
      this.updateFilterBlur('penumbra-blur', val);
    });

    // Ambient shadow controls
    document.getElementById('ambient-opacity').addEventListener('input', (e) => {
      const val = e.target.value / 100;
      document.getElementById('ambient-opacity-val').textContent = val.toFixed(2);
      this.updatePolygonFill('ambient', val);
    });

    document.getElementById('ambient-blur-slider').addEventListener('input', (e) => {
      const val = e.target.value / 10;
      document.getElementById('ambient-blur-val').textContent = val.toFixed(1);
      this.updateFilterBlur('ambient-blur', val);
    });

    document.getElementById('shadow-copy-svg').addEventListener('click', () => this.copySVG());
    document.getElementById('shadow-done').addEventListener('click', () => this.cleanup());

    this.updateCoordsDisplay();
  }

  initSliderValues() {
    // Read current values from SVG and set sliders
    const contactFill = this.layers.contact.polygon?.getAttribute('fill');
    const penumbraFill = this.layers.penumbra.polygon?.getAttribute('fill');
    const ambientFill = this.layers.ambient.polygon?.getAttribute('fill');

    // Extract opacity from rgba
    const extractOpacity = (fill) => {
      const match = fill?.match(/rgba\([\d,\s]+,([\d.]+)\)/);
      return match ? parseFloat(match[1]) : 0.5;
    };

    const contactOpacity = extractOpacity(contactFill);
    const penumbraOpacity = extractOpacity(penumbraFill);
    const ambientOpacity = extractOpacity(ambientFill);

    document.getElementById('contact-opacity').value = contactOpacity * 100;
    document.getElementById('contact-opacity-val').textContent = contactOpacity.toFixed(2);

    document.getElementById('penumbra-opacity').value = penumbraOpacity * 100;
    document.getElementById('penumbra-opacity-val').textContent = penumbraOpacity.toFixed(2);

    document.getElementById('ambient-opacity').value = ambientOpacity * 100;
    document.getElementById('ambient-opacity-val').textContent = ambientOpacity.toFixed(2);

    // Read blur values from filters
    const getBlur = (filterId) => {
      const filter = document.getElementById(filterId);
      const blur = filter?.querySelector('feGaussianBlur');
      return parseFloat(blur?.getAttribute('stdDeviation') || '1');
    };

    const contactBlur = getBlur('contact-blur');
    const penumbraBlur = getBlur('penumbra-blur');
    const ambientBlur = getBlur('ambient-blur');

    document.getElementById('contact-blur-slider').value = contactBlur * 10;
    document.getElementById('contact-blur-val').textContent = contactBlur.toFixed(1);

    document.getElementById('penumbra-blur-slider').value = penumbraBlur * 10;
    document.getElementById('penumbra-blur-val').textContent = penumbraBlur.toFixed(1);

    document.getElementById('ambient-blur-slider').value = ambientBlur * 10;
    document.getElementById('ambient-blur-val').textContent = ambientBlur.toFixed(1);
  }

  updatePolygonFill(layerName, opacity) {
    const polygon = this.layers[layerName]?.polygon;
    if (polygon) {
      polygon.setAttribute('fill', `rgba(0,0,0,${opacity})`);
    }
  }

  updateFilterBlur(filterId, stdDeviation) {
    const filter = document.getElementById(filterId);
    const blur = filter?.querySelector('feGaussianBlur');
    if (blur) {
      blur.setAttribute('stdDeviation', stdDeviation.toString());
    }
  }

  onDrag(e) {
    if (!this.isDragging || this.dragCorner === null || !this.dragLayer) return;

    const layer = this.layers[this.dragLayer];
    const corner = layer.corners[this.dragCorner];

    // Convert to percentage (viewBox is 0-100)
    corner.x = (e.clientX / window.innerWidth) * 100;
    corner.y = (e.clientY / window.innerHeight) * 100;

    // Update handle position
    layer.handles[this.dragCorner].style.left = corner.x + '%';
    layer.handles[this.dragCorner].style.top = corner.y + '%';

    // Update SVG polygon
    this.updatePolygon(this.dragLayer);
    this.updateCoordsDisplay();
  }

  updatePolygon(layerName) {
    const layer = this.layers[layerName];
    if (layer.polygon && layer.corners.length === 4) {
      layer.polygon.setAttribute('points', this.pointsToString(layer.corners));
    }
  }

  updateCoordsDisplay() {
    const labels = ['TL', 'TR', 'BR', 'BL'];
    const colors = {
      contact: ['#ff4444', '#44ff44', '#4444ff', '#ffff44'],
      penumbra: ['#ff88cc', '#44ffff', '#ff8844', '#aa44ff'],
      ambient: ['#88ff44', '#44ffaa', '#ff6666', '#cc88ff']
    };

    for (const [layerName, layer] of Object.entries(this.layers)) {
      const coordsDiv = document.getElementById(`${layerName}-coords`);
      if (coordsDiv && layer.corners.length) {
        coordsDiv.innerHTML = layer.corners.map((c, i) =>
          `<span style="color: ${colors[layerName][i]};">${labels[i]}:</span> (${c.x.toFixed(1)}, ${c.y.toFixed(1)})`
        ).join(' &nbsp;');
      }
    }
  }

  copySVG() {
    const contactOpacity = document.getElementById('contact-opacity').value / 100;
    const penumbraOpacity = document.getElementById('penumbra-opacity').value / 100;
    const ambientOpacity = document.getElementById('ambient-opacity').value / 100;

    const contactBlur = document.getElementById('contact-blur-slider').value / 10;
    const penumbraBlur = document.getElementById('penumbra-blur-slider').value / 10;
    const ambientBlur = document.getElementById('ambient-blur-slider').value / 10;

    const svg = `<!-- SVG for emitter shadows with blur -->
<svg id="emitter-shadows-svg" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:1;">
  <defs>
    <filter id="contact-blur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${contactBlur}" />
    </filter>
    <filter id="penumbra-blur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${penumbraBlur}" />
    </filter>
    <filter id="ambient-blur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${ambientBlur}" />
    </filter>
  </defs>
  <!-- Ambient shadow - largest, most diffuse (rendered first, furthest back) -->
  <polygon
    id="shadow-ambient"
    points="${this.pointsToString(this.layers.ambient.corners)}"
    fill="rgba(0,0,0,${ambientOpacity})"
    filter="url(#ambient-blur)"
  />
  <!-- Penumbra shadow - larger, more diffuse -->
  <polygon
    id="shadow-penumbra"
    points="${this.pointsToString(this.layers.penumbra.corners)}"
    fill="rgba(0,0,0,${penumbraOpacity})"
    filter="url(#penumbra-blur)"
  />
  <!-- Contact shadow - tight, darker -->
  <polygon
    id="shadow-contact"
    points="${this.pointsToString(this.layers.contact.corners)}"
    fill="rgba(0,0,0,${contactOpacity})"
    filter="url(#contact-blur)"
  />
</svg>`;

    navigator.clipboard.writeText(svg).then(() => {
      console.log('SVG copied:\n' + svg);
      alert('SVG copied to clipboard!');
    });
  }

  cleanup() {
    document.querySelectorAll('.shadow-debug-handle').forEach(el => el.remove());
    this.panel?.remove();
    // Reload to apply any saved changes
    location.reload();
  }
}

// Auto-init from URL param
if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search);
  if (params.has('shadow-debug')) {
    window.addEventListener('DOMContentLoaded', () => {
      window.shadowDebug = new ShadowDebugTool();
      window.shadowDebug.init();
    });
  }
}
