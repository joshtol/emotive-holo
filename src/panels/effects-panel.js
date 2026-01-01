/**
 * EffectsPanel - Visual Effects Toggle Panel
 *
 * Matches the VISUALS section from 3d-example-style.css:
 * - Header with inline Particles toggle pill
 * - Stacked toggle rows: Core Glow, Blinking, Breathing, Auto-Rotate
 *
 * Uses HoloPhone's shared drawing methods for consistent carousel styling.
 * Extends MenuPanel for common lifecycle and rendering utilities.
 */

import { MenuPanel } from './menu-panel.js';

// Brand teal color (Eye Tea Green)
const ACCENT_COLOR = '#84CFC5';
const ACCENT_RGB = '132, 207, 197';

// Toggle rows with descriptions (displayed in stacked list below header)
const TOGGLE_ROWS = [
  { id: 'particles', label: 'Particles', desc: 'Floating ambient particles around the crystal' },
  { id: 'glow', label: 'Core Glow', desc: 'Inner illumination that pulses with breathing' },
  { id: 'blink', label: 'Blinking', desc: 'Periodic dimming like an eye blink' },
  { id: 'breathing', label: 'Breathing', desc: 'Slow rhythmic scale and intensity pulsing' },
  { id: 'autorotate', label: 'Auto-Rotate', desc: 'Gentle automatic spinning' }
];

export class EffectsPanel extends MenuPanel {
  constructor(options = {}) {
    super({
      id: 'effects',
      title: 'Effects',
      ...options
    });

    // Effect toggle states
    this.effectStates = {
      particles: true,
      glow: true,
      blink: false,  // Disabled by default - blink is distracting for most use cases
      breathing: true,
      autorotate: true
    };

    // Track original states to restore on cancel
    this._originalStates = { ...this.effectStates };

    // Reference to main app for applying toggles
    this.app = options.app;

    // Hit regions (set during render)
    this._toggleRegions = [];
    this._infoRegions = [];
    this._bracketRegions = [];

    // Tooltip state
    this._activeTooltip = null;
    this._tooltipTimeout = null;
    this._tooltipRegion = null;  // Hit region for active tooltip
  }

  /**
   * Called when panel is shown
   */
  _onShow() {
    // Store original values to restore on cancel
    this._originalStates = { ...this.effectStates };
    // Clear any lingering tooltip
    this._activeTooltip = null;
    this._tooltipRegion = null;
    if (this._tooltipTimeout) clearTimeout(this._tooltipTimeout);
  }

  /**
   * Render the effects panel content
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   * @param {HoloPhone} holoPhone - HoloPhone instance for shared drawing
   */
  render(ctx, w, h, holoPhone) {
    // Background - dark panel style matching 3d-example-style.css
    const bgGradient = ctx.createLinearGradient(0, 0, w, h);
    bgGradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    bgGradient.addColorStop(1, 'rgba(10, 20, 30, 0.9)');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, w, h);

    // Use HoloPhone's shared bracket drawing
    if (holoPhone && holoPhone.drawPanelBrackets) {
      this._bracketRegions = holoPhone.drawPanelBrackets(ctx, w, h);
    }

    // Content area (between brackets)
    const bracketWidth = 80;
    const bracketInset = 4;
    const contentX = bracketWidth + bracketInset + 16;
    const contentW = w - (bracketWidth + bracketInset) * 2 - 32;
    const rowEndX = contentX + contentW;

    // Clear hit regions
    this._toggleRegions = [];
    this._infoRegions = [];

    // === TOGGLE ROWS ===
    // Canvas height is 228px, title is now floating holo text above phone
    // Full height available for 5 rows with comfortable spacing
    const rowStartY = 14;
    const rowHeight = 42;

    TOGGLE_ROWS.forEach((toggle, index) => {
      const rowCenterY = rowStartY + index * rowHeight + rowHeight / 2;
      this._drawToggleRow(ctx, contentX, rowCenterY, rowEndX, toggle.label, this.effectStates[toggle.id], toggle.id, toggle.desc);

      // Add subtle separator line (except after last row)
      if (index < TOGGLE_ROWS.length - 1) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(contentX, rowStartY + (index + 1) * rowHeight);
        ctx.lineTo(rowEndX, rowStartY + (index + 1) * rowHeight);
        ctx.stroke();
      }
    });

    // Draw active tooltip if any
    if (this._activeTooltip) {
      this._drawTooltip(ctx, w, h);
    }
  }

  /**
   * Draw a toggle row with label, info icon, and switch
   * @param {number} centerY - The vertical center of the row
   */
  _drawToggleRow(ctx, startX, centerY, endX, label, active, id, desc) {
    const switchWidth = 46;
    const switchHeight = 24;
    const togglePadding = 12; // Padding from right edge
    const switchX = endX - switchWidth - togglePadding;
    const switchY = centerY - switchHeight / 2;

    // Label - vertically centered, larger with letter spacing for lux look
    const labelPadding = 8; // Padding from left edge
    ctx.font = '500 18px Poppins, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '0.5px'; // Subtle kerning for readability
    ctx.fillText(label, startX + labelPadding, centerY);
    ctx.letterSpacing = '0px'; // Reset

    // Position info icon aligned to the left of the toggle with padding
    const infoIconRadius = 14;
    const infoPadding = 14; // Gap between info icon and toggle
    const infoIconX = switchX - infoPadding - infoIconRadius;

    // Draw info icon (circle with "?") - larger and more visible
    ctx.beginPath();
    ctx.arc(infoIconX, centerY, infoIconRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(132, 207, 197, 0.2)'; // Teal tinted background
    ctx.fill();
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw "?" in the circle - larger and bolder
    ctx.font = '700 18px Poppins, sans-serif';
    ctx.fillStyle = ACCENT_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', infoIconX, centerY + 1);

    // Add hit region for info icon
    this._infoRegions.push({
      name: `info-${id}`,
      x: infoIconX - infoIconRadius - 4,
      y: centerY - infoIconRadius - 4,
      w: (infoIconRadius + 4) * 2,
      h: (infoIconRadius + 4) * 2,
      extra: { effectId: id, desc: desc, iconX: infoIconX, iconY: centerY }
    });

    // Use sliding toggle for all rows
    this._drawSliderToggle(ctx, switchX, switchY, switchWidth, switchHeight, centerY, active);

    // Add hit region for the switch
    this._toggleRegions.push({
      name: `toggle-${id}`,
      x: switchX - 8,
      y: switchY - 8,
      w: switchWidth + 16,
      h: switchHeight + 16,
      extra: { effectId: id }
    });
  }

  /**
   * Sliding dot toggle - iOS-style with dot that slides left/right
   */
  _drawSliderToggle(ctx, x, y, w, h, centerY, active) {
    const dotRadius = 8;
    const dotPadding = 4;

    // Dot position: left when off, right when on
    const dotX = active
      ? x + w - dotRadius - dotPadding
      : x + dotRadius + dotPadding;

    // Track (pill background)
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);

    if (active) {
      // Active: filled teal track (iOS style)
      ctx.fillStyle = ACCENT_COLOR;
      ctx.fill();

      // Black dot as negative space
      ctx.beginPath();
      ctx.arc(dotX, centerY, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.fill();
    } else {
      // Inactive: dark track with teal outline only
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fill();
      ctx.strokeStyle = ACCENT_COLOR;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Black dot as negative space
      ctx.beginPath();
      ctx.arc(dotX, centerY, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.fill();
    }
  }

  /**
   * Draw tooltip bubble near the info icon
   */
  _drawTooltip(ctx, canvasW, canvasH) {
    if (!this._activeTooltip) {
      this._tooltipRegion = null;
      return;
    }

    const { desc, x, y } = this._activeTooltip;
    const padding = 20;
    const maxWidth = 280;
    const lineHeight = 30;
    const fontSize = 20;

    // Set font for measuring
    ctx.font = `500 ${fontSize}px Poppins, sans-serif`;

    // Word wrap the description
    const words = desc.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Calculate tooltip dimensions based on actual text width
    let maxLineWidth = 0;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      if (w > maxLineWidth) maxLineWidth = w;
    }
    const tooltipW = maxLineWidth + padding * 2;
    const tooltipH = lines.length * lineHeight + padding * 2 - 6; // -6 to tighten bottom

    // Always position tooltip to the left of the info icon (icons are on right side)
    const tooltipX = x - tooltipW - 20;
    let tooltipY = y - tooltipH / 2;
    // Keep within canvas bounds vertically
    tooltipY = Math.max(10, Math.min(canvasH - tooltipH - 10, tooltipY));

    // Store tooltip region for hit detection (dismiss on tap)
    this._tooltipRegion = {
      name: 'tooltip',
      x: tooltipX,
      y: tooltipY,
      w: tooltipW,
      h: tooltipH
    };

    // Draw tooltip background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.beginPath();
    ctx.roundRect(tooltipX, tooltipY, tooltipW, tooltipH, 10);
    ctx.fill();

    // Border
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    lines.forEach((line, i) => {
      ctx.fillText(line, tooltipX + padding, tooltipY + padding + i * lineHeight);
    });
  }

  /**
   * Get hit regions including brackets, toggles, and info icons
   * Tooltip region comes first so clicks on tooltip dismiss it instead of toggling
   */
  getHitRegions() {
    const regions = [...this._bracketRegions];
    // Add tooltip region first if active (so it intercepts clicks)
    if (this._tooltipRegion) {
      regions.push(this._tooltipRegion);
    }
    return [...regions, ...this._infoRegions, ...this._toggleRegions];
  }

  /**
   * Handle custom touch regions
   */
  _handleCustomTouch(regionName, extra) {
    // Handle tooltip tap (dismiss it)
    if (regionName === 'tooltip') {
      this._activeTooltip = null;
      this._tooltipRegion = null;
      if (this._tooltipTimeout) clearTimeout(this._tooltipTimeout);
      this.updatePhoneDisplay();
      return;
    }

    // Handle info icon taps
    if (regionName.startsWith('info-')) {
      const { desc, iconX, iconY } = extra || {};
      if (desc) {
        // Toggle tooltip - if same one is showing, hide it
        if (this._activeTooltip?.desc === desc) {
          this._activeTooltip = null;
          this._tooltipRegion = null;
        } else {
          this._activeTooltip = { desc, x: iconX, y: iconY };
          // Auto-hide after 3 seconds
          if (this._tooltipTimeout) clearTimeout(this._tooltipTimeout);
          this._tooltipTimeout = setTimeout(() => {
            this._activeTooltip = null;
            this._tooltipRegion = null;
            this.updatePhoneDisplay();
          }, 3000);
        }
        this.updatePhoneDisplay();
      }
      return;
    }

    // Handle toggle taps
    if (regionName.startsWith('toggle-')) {
      // Dismiss any active tooltip
      this._activeTooltip = null;
      this._tooltipRegion = null;
      if (this._tooltipTimeout) clearTimeout(this._tooltipTimeout);

      const effectId = extra?.effectId;
      if (effectId && this.effectStates.hasOwnProperty(effectId)) {
        // Toggle the state
        this.effectStates[effectId] = !this.effectStates[effectId];

        console.log(`Toggle ${effectId}: ${this.effectStates[effectId]}`);

        // Apply immediately
        this._applyEffect(effectId, this.effectStates[effectId]);

        // Notify change
        this.onChange(this.getState());

        // Re-render
        this.updatePhoneDisplay();
      }
    }
  }

  /**
   * Apply an effect toggle
   */
  _applyEffect(effectId, enabled) {
    if (this.app && this.app.applyToggle) {
      console.log(`Calling applyToggle('${effectId}', ${enabled})`);
      this.app.applyToggle(effectId, enabled);
    } else {
      console.warn('EffectsPanel: app.applyToggle not available');
    }
  }

  /**
   * Handle cancel - restore original states
   */
  _handleCancel() {
    // Restore all original states
    Object.keys(this._originalStates).forEach(effectId => {
      if (this.effectStates[effectId] !== this._originalStates[effectId]) {
        this.effectStates[effectId] = this._originalStates[effectId];
        this._applyEffect(effectId, this.effectStates[effectId]);
      }
    });

    // Call parent cancel
    super._handleCancel();
  }

  /**
   * Handle confirm - keep the new states
   */
  _handleConfirm() {
    // Update original states to current (effects are already applied)
    this._originalStates = { ...this.effectStates };

    // Call parent confirm
    super._handleConfirm();
  }

  /**
   * Get current panel state
   */
  getState() {
    return {
      id: this.id,
      effects: { ...this.effectStates }
    };
  }

  /**
   * Restore panel state
   */
  restoreState(state) {
    if (state.effects) {
      this.effectStates = { ...state.effects };
      this._originalStates = { ...state.effects };
    }
  }
}

export default EffectsPanel;
