/**
 * MeditatePanel - Breathing Pattern Selection Panel
 *
 * Allows users to select from various breathing patterns:
 * - 4-7-8 Relaxation: Classic calming technique
 * - Box Breathing: 4-4-4-4 tactical/focus breathing
 * - 4-4-8 Calm: Simple elongated exhale
 * - 2-4 Quick Calm: Fast stress relief
 * - 5-5 Balance: Equal inhale/exhale for balance
 *
 * Uses HoloPhone's shared drawing methods for consistent carousel styling.
 * Extends MenuPanel for common lifecycle and rendering utilities.
 */

import { MenuPanel } from './menu-panel.js';

// Brand teal color (Eye Tea Green)
const ACCENT_COLOR = '#84CFC5';

// Breathing patterns with display info (matching effects panel format)
const BREATHING_PATTERNS = [
  {
    id: 'default',
    label: 'Relaxation',
    desc: 'Classic 4-7-8 breathing for deep relaxation and sleep',
    pattern: { inhale: 4, holdIn: 7, exhale: 8, holdOut: 0 }
  },
  {
    id: 'box',
    label: 'Box Breathing',
    desc: 'Equal 4-4-4-4 tactical breathing for focus and calm',
    pattern: { inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 }
  },
  {
    id: 'calm',
    label: 'Calming',
    desc: 'Extended exhale breathing for quick stress relief',
    pattern: { inhale: 4, holdIn: 4, exhale: 8, holdOut: 0 }
  },
  {
    id: 'quick',
    label: 'Quick Relief',
    desc: 'Short 2-4 pattern for fast anxiety reduction',
    pattern: { inhale: 2, holdIn: 0, exhale: 4, holdOut: 0 }
  },
  {
    id: 'balance',
    label: 'Balance',
    desc: 'Equal 5-5 breathing for mind-body equilibrium',
    pattern: { inhale: 5, holdIn: 0, exhale: 5, holdOut: 0 }
  }
];

export class MeditatePanel extends MenuPanel {
  constructor(options = {}) {
    super({
      id: 'meditate',
      title: 'Meditate',
      ...options
    });

    // Currently selected pattern index
    this.selectedIndex = 0;

    // Reference to meditation controller
    this.meditation = options.meditation;

    // Hit regions (set during render)
    this._patternRegions = [];
    this._infoRegions = [];
    this._bracketRegions = [];

    // Tooltip state (same as effects panel)
    this._activeTooltip = null;
    this._tooltipTimeout = null;
    this._tooltipRegion = null;  // Hit region for active tooltip
  }

  /**
   * Called when panel is shown
   */
  _onShow() {
    // Reset to first pattern on show
    this.selectedIndex = 0;
    // Clear any lingering tooltip
    this._activeTooltip = null;
    this._tooltipRegion = null;
    if (this._tooltipTimeout) clearTimeout(this._tooltipTimeout);
  }

  /**
   * Render the meditate panel content
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   * @param {HoloPhone} holoPhone - HoloPhone instance for shared drawing
   */
  render(ctx, w, h, holoPhone) {
    // Background - dark panel style matching effects panel
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
    this._patternRegions = [];
    this._infoRegions = [];

    // === PATTERN ROWS ===
    const rowStartY = 14;
    const rowHeight = 42;

    BREATHING_PATTERNS.forEach((pattern, index) => {
      const rowCenterY = rowStartY + index * rowHeight + rowHeight / 2;
      const isSelected = index === this.selectedIndex;

      this._drawPatternRow(ctx, contentX, rowCenterY, rowEndX, pattern, isSelected, index, rowHeight);

      // Add subtle separator line (except after last row)
      if (index < BREATHING_PATTERNS.length - 1) {
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
   * Draw a pattern row with label, info icon, and radio selection (matching effects panel)
   */
  _drawPatternRow(ctx, startX, centerY, endX, pattern, isSelected, index, rowHeight) {
    const togglePadding = 12; // Padding from right edge
    const radioRadius = 12; // Filled circle radio button
    const radioX = endX - togglePadding - radioRadius;

    // Label - vertically centered, matching effects panel style
    const labelPadding = 8;
    ctx.font = '500 18px Poppins, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '0.5px';
    ctx.fillText(pattern.label, startX + labelPadding, centerY);
    ctx.letterSpacing = '0px';

    // Position info icon aligned to the left of the radio with padding
    const infoIconRadius = 14;
    const infoPadding = 16;
    const infoIconX = radioX - radioRadius - infoPadding - infoIconRadius;

    // Draw info icon (circle with "?") - matching effects panel
    ctx.beginPath();
    ctx.arc(infoIconX, centerY, infoIconRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(132, 207, 197, 0.2)';
    ctx.fill();
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw "?" in the circle
    ctx.font = '700 18px Poppins, sans-serif';
    ctx.fillStyle = ACCENT_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', infoIconX, centerY + 1);

    // Add hit region for info icon
    this._infoRegions.push({
      name: `info-${pattern.id}`,
      x: infoIconX - infoIconRadius - 4,
      y: centerY - infoIconRadius - 4,
      w: (infoIconRadius + 4) * 2,
      h: (infoIconRadius + 4) * 2,
      extra: { patternId: pattern.id, desc: pattern.desc, iconX: infoIconX, iconY: centerY }
    });

    // Draw radio selection indicator - filled circle
    this._drawRadioCircle(ctx, radioX, centerY, radioRadius, isSelected);

    // Add hit region for the ENTIRE ROW (not just radio)
    this._patternRegions.push({
      name: `pattern-${index}`,
      x: startX,
      y: centerY - rowHeight / 2,
      w: endX - startX,
      h: rowHeight,
      extra: { index, patternId: pattern.id }
    });
  }

  /**
   * Draw radio selection indicator - simple filled circle
   */
  _drawRadioCircle(ctx, x, y, radius, selected) {
    if (selected) {
      // Selected: solid teal filled circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT_COLOR;
      ctx.fill();
    } else {
      // Unselected: dark fill with teal outline
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fill();
      ctx.strokeStyle = ACCENT_COLOR;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  /**
   * Get hit regions including brackets, info icons, and pattern rows
   * Tooltip region comes first so clicks on tooltip dismiss it instead of selecting patterns
   */
  getHitRegions() {
    const regions = [...this._bracketRegions];
    // Add tooltip region first if active (so it intercepts clicks)
    if (this._tooltipRegion) {
      regions.push(this._tooltipRegion);
    }
    return [...regions, ...this._infoRegions, ...this._patternRegions];
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

    // Handle pattern selection
    if (regionName.startsWith('pattern-')) {
      // Dismiss any active tooltip
      this._activeTooltip = null;
      this._tooltipRegion = null;
      if (this._tooltipTimeout) clearTimeout(this._tooltipTimeout);

      const index = extra?.index;
      if (index !== undefined && index !== this.selectedIndex) {
        this.selectedIndex = index;
        console.log(`Selected pattern: ${BREATHING_PATTERNS[index].label}`);
        this.updatePhoneDisplay();
      }
    }
  }

  /**
   * Draw tooltip bubble near the info icon (same as effects panel)
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
    const tooltipH = lines.length * lineHeight + padding * 2 - 6;

    // Always position tooltip to the left of the info icon
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
   * Handle confirm - start meditation with selected pattern
   */
  _handleConfirm() {
    const selectedPattern = BREATHING_PATTERNS[this.selectedIndex];

    // Set pattern on meditation controller
    if (this.meditation) {
      // Add the pattern if it doesn't exist
      if (!this.meditation.patterns[selectedPattern.id]) {
        this.meditation.patterns[selectedPattern.id] = selectedPattern.pattern;
      }
      this.meditation.setPattern(selectedPattern.id);
    }

    // Notify parent with selected pattern
    this.onConfirm({
      patternId: selectedPattern.id,
      patternName: selectedPattern.label,
      pattern: selectedPattern.pattern
    });

    // Hide panel
    this.hide();
  }

  /**
   * Get current panel state
   */
  getState() {
    return {
      id: this.id,
      selectedIndex: this.selectedIndex,
      selectedPattern: BREATHING_PATTERNS[this.selectedIndex]
    };
  }

  /**
   * Restore panel state
   */
  restoreState(state) {
    if (state.selectedIndex !== undefined) {
      this.selectedIndex = state.selectedIndex;
    }
  }
}

// Export breathing patterns for use elsewhere
export { BREATHING_PATTERNS };
export default MeditatePanel;
