/**
 * MoodPanel - Holophone panel for mood/expression controls
 *
 * Displayed on holophone when in mood mode (viewing emotion carousels).
 * Controls undertone intensity and wobble toggle.
 *
 * Uses a horizontal slider for undertone selection (fits in limited height).
 */

import { MenuPanel } from './menu-panel.js';

// Available undertones from the engine (reduced to fit slider)
const UNDERTONES = [
  { id: 'clear', label: 'CLEAR' },
  { id: 'subdued', label: 'SUBDUED' },
  { id: 'confident', label: 'CONFIDENT' },
  { id: 'intense', label: 'INTENSE' },
  { id: 'nervous', label: 'NERVOUS' }
];

// Accent color - teal (matches other panels)
const ACCENT_COLOR = '#84CFC5';
const ACCENT_RGB = '132, 207, 197';

export class MoodPanel extends MenuPanel {
  constructor(options = {}) {
    super({
      ...options,
      id: 'mood',
      title: 'EXPRESSION'
    });

    // Current undertone index
    this.selectedUndertoneIndex = 0;  // Default to 'clear'

    // Reference to mascot for applying undertones
    this.mascot = options.mascot || null;

    // Wobble toggle state
    this.wobbleEnabled = false;

    // Currently displayed emotion (updated when user selects from carousel)
    this._currentEmotion = null;

    // Callbacks
    this.onUndertoneChange = options.onUndertoneChange || null;
    this.onWobbleChange = options.onWobbleChange || null;

    // Hit regions (set during render)
    this._customRegions = [];
    this._bracketRegions = [];
    this._infoRegions = [];

    // Slider drag state
    this._sliderDragging = false;

    // Tooltip state
    this._activeTooltip = null;
    this._tooltipTimeout = null;
    this._tooltipRegion = null;
  }

  /**
   * Called when panel is shown
   */
  _onShow() {
    // Sync wobble state with mascot using public API
    if (this.mascot && typeof this.mascot.wobbleEnabled !== 'undefined') {
      this.wobbleEnabled = this.mascot.wobbleEnabled;
    }

    // Sync undertone index from mascot's current state
    this._syncUndertoneFromMascot();

    // Clear any lingering tooltip
    this._activeTooltip = null;
    this._tooltipRegion = null;
    if (this._tooltipTimeout) clearTimeout(this._tooltipTimeout);
  }

  /**
   * Sync the undertone selector with the mascot's current undertone
   */
  _syncUndertoneFromMascot() {
    if (!this.mascot) return;

    // Use the public .undertone property on the 3D mascot
    const currentUndertone = this.mascot.undertone || 'clear';

    // Find the index for this undertone
    const index = UNDERTONES.findIndex(u => u.id === currentUndertone);
    if (index !== -1) {
      this.selectedUndertoneIndex = index;
    }
  }

  /**
   * Override _showTitle to show the mascot's current emotion and undertone
   * instead of static "EXPRESSION" text
   */
  _showTitle() {
    if (!this.titleElement) return;

    // Get current state from mascot
    const emotion = this._getCurrentEmotionLabel();
    const undertone = this._getCurrentUndertoneLabel();

    // Update title with current emotion
    const titleName = this.titleElement.querySelector('.title-name');
    if (titleName) {
      titleName.textContent = emotion;
    }

    // Update subtitle with current undertone (only if not 'clear')
    const titleSubtitle = this.titleElement.querySelector('.title-subtitle');
    if (titleSubtitle) {
      titleSubtitle.textContent = undertone !== 'CLEAR' ? undertone : '';
    }

    // Show the element
    this.titleElement.classList.remove('hidden');
  }

  /**
   * Get the current emotion label from mascot
   */
  _getCurrentEmotionLabel() {
    // Use the public .emotion property on the 3D mascot
    const emotion = this.mascot?.emotion || 'neutral';

    // Convert to uppercase label (e.g., 'joy' -> 'JOY')
    return emotion.toUpperCase();
  }

  /**
   * Get the current undertone label
   */
  _getCurrentUndertoneLabel() {
    const undertone = UNDERTONES[this.selectedUndertoneIndex];
    return undertone ? undertone.label : 'CLEAR';
  }

  /**
   * Update the floating title to reflect current emotion and undertone
   */
  _updateFloatingTitle() {
    if (!this.titleElement || !this.isVisible) return;

    const emotion = this._getCurrentEmotionLabel();
    const undertone = this._getCurrentUndertoneLabel();

    const titleName = this.titleElement.querySelector('.title-name');
    if (titleName) {
      titleName.textContent = emotion;
    }

    const titleSubtitle = this.titleElement.querySelector('.title-subtitle');
    if (titleSubtitle) {
      titleSubtitle.textContent = undertone !== 'CLEAR' ? undertone : '';
    }
  }

  /**
   * Called when panel is hidden
   */
  _onHide() {
    this._sliderDragging = false;
  }

  /**
   * Render the panel content
   */
  render(ctx, w, h, holoPhone) {
    // Draw panel brackets
    if (holoPhone?.drawPanelBrackets) {
      this._bracketRegions = holoPhone.drawPanelBrackets(ctx, w, h);
    }

    // Content area - standardized +16px inset from brackets
    const bracketWidth = 80;
    const bracketInset = 4;
    const contentX = bracketWidth + bracketInset + 16;
    const contentW = w - (bracketWidth + bracketInset) * 2 - 32;

    // Clear custom hit regions
    this._customRegions = [];
    this._infoRegions = [];

    // Calculate vertical layout - center content with generous spacing
    const totalContentHeight = 130; // Slider section + toggle section
    const startY = (h - totalContentHeight) / 2 - 10;

    // === UNDERTONE SLIDER ===
    this._drawUndertoneSlider(ctx, contentX, startY, contentW, 80);

    // === WOBBLE TOGGLE ===
    const wobbleY = startY + 95;
    this._drawWobbleToggle(ctx, contentX, wobbleY, contentW, 55);

    // Draw active tooltip if any (on top of everything)
    if (this._activeTooltip) {
      this._drawTooltip(ctx, w, h);
    }
  }

  /**
   * Draw undertone horizontal slider with labeled stops - premium design
   */
  _drawUndertoneSlider(ctx, x, y, w, h) {
    // Section header - larger, bolder typography
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '700 17px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('UNDERTONE', x + w / 2, y);

    // Slider track - thicker, more substantial
    const trackY = y + 38;
    const trackH = 6;
    const trackRadius = trackH / 2;

    // Calculate positions
    const stopCount = UNDERTONES.length;
    const edgePadding = 8; // Padding from edges so stops don't touch brackets
    const effectiveWidth = w - edgePadding * 2;
    const stopSpacing = effectiveWidth / (stopCount - 1);
    const trackStartX = x + edgePadding;
    const selectedX = trackStartX + this.selectedUndertoneIndex * stopSpacing;

    // Subtle outer glow behind entire track
    ctx.strokeStyle = `rgba(${ACCENT_RGB}, 0.15)`;
    ctx.lineWidth = trackH + 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(trackStartX, trackY + trackH / 2);
    ctx.lineTo(trackStartX + effectiveWidth, trackY + trackH / 2);
    ctx.stroke();

    // Background track (full width)
    ctx.beginPath();
    ctx.roundRect(trackStartX, trackY, effectiveWidth, trackH, trackRadius);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fill();

    // Active portion glow
    if (this.selectedUndertoneIndex > 0) {
      const activeWidth = selectedX - trackStartX;
      // Glow behind active portion
      ctx.strokeStyle = `rgba(${ACCENT_RGB}, 0.3)`;
      ctx.lineWidth = trackH + 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(trackStartX, trackY + trackH / 2);
      ctx.lineTo(selectedX, trackY + trackH / 2);
      ctx.stroke();

      // Active fill
      ctx.beginPath();
      ctx.roundRect(trackStartX, trackY, activeWidth, trackH, trackRadius);
      ctx.fillStyle = `rgba(${ACCENT_RGB}, 0.6)`;
      ctx.fill();
    }

    // Draw stop markers and labels
    ctx.textBaseline = 'top';

    for (let i = 0; i < stopCount; i++) {
      const stopX = trackStartX + i * stopSpacing;
      const isSelected = i === this.selectedUndertoneIndex;
      const isActive = i <= this.selectedUndertoneIndex;

      // Stop tick mark - larger, more visible
      const stopRadius = isSelected ? 5 : 4;

      // Glow for active/selected stops
      if (isActive) {
        ctx.beginPath();
        ctx.arc(stopX, trackY + trackH / 2, stopRadius + 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ACCENT_RGB}, ${isSelected ? 0.3 : 0.15})`;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(stopX, trackY + trackH / 2, stopRadius, 0, Math.PI * 2);
      ctx.fillStyle = isActive
        ? ACCENT_COLOR
        : 'rgba(255, 255, 255, 0.35)';
      ctx.fill();

      // Label below - larger, better contrast for mobile readability
      ctx.fillStyle = isSelected ? ACCENT_COLOR : 'rgba(255, 255, 255, 0.75)';
      ctx.font = isSelected ? '700 14px Poppins, sans-serif' : '600 13px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(UNDERTONES[i].label, stopX, trackY + trackH + 12);

      // Hit region for each stop - generous touch targets
      this._customRegions.push({
        name: `undertone-${i}`,
        x: stopX - stopSpacing / 2 - 5,
        y: trackY - 20,
        w: stopSpacing + 10,
        h: 65,
        extra: { index: i, undertoneId: UNDERTONES[i].id }
      });
    }

    // === PREMIUM SLIDER THUMB ===
    const thumbY = trackY + trackH / 2;

    // Outer ambient glow
    const outerGlow = ctx.createRadialGradient(selectedX, thumbY, 0, selectedX, thumbY, 22);
    outerGlow.addColorStop(0, `rgba(${ACCENT_RGB}, 0.4)`);
    outerGlow.addColorStop(0.5, `rgba(${ACCENT_RGB}, 0.15)`);
    outerGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(selectedX, thumbY, 22, 0, Math.PI * 2);
    ctx.fill();

    // Thumb outer ring
    ctx.beginPath();
    ctx.arc(selectedX, thumbY, 14, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Thumb inner fill - gradient
    const thumbGradient = ctx.createRadialGradient(
      selectedX - 4, thumbY - 4, 0,
      selectedX, thumbY, 12
    );
    thumbGradient.addColorStop(0, 'rgba(60, 55, 45, 0.95)');
    thumbGradient.addColorStop(0.6, 'rgba(40, 35, 30, 0.9)');
    thumbGradient.addColorStop(1, 'rgba(30, 28, 25, 0.85)');
    ctx.beginPath();
    ctx.arc(selectedX, thumbY, 11, 0, Math.PI * 2);
    ctx.fillStyle = thumbGradient;
    ctx.fill();

    // Accent dot in center
    const dotGlow = ctx.createRadialGradient(selectedX, thumbY, 0, selectedX, thumbY, 8);
    dotGlow.addColorStop(0, `rgba(${ACCENT_RGB}, 0.7)`);
    dotGlow.addColorStop(0.5, `rgba(${ACCENT_RGB}, 0.25)`);
    dotGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = dotGlow;
    ctx.beginPath();
    ctx.arc(selectedX, thumbY, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(selectedX, thumbY, 4, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT_COLOR;
    ctx.fill();

    // Highlight on dot
    ctx.beginPath();
    ctx.arc(selectedX - 1, thumbY - 1, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fill();

    // Full slider hit region for dragging
    this._customRegions.push({
      name: 'undertone-slider',
      x: trackStartX - 10,
      y: trackY - 20,
      w: effectiveWidth + 20,
      h: 65,
      extra: { sliderX: trackStartX, sliderW: effectiveWidth, stopCount: stopCount }
    });
  }

  /**
   * Draw wobble toggle with info icon - matches effects panel style
   */
  _drawWobbleToggle(ctx, x, y, w, h) {
    const toggleWidth = 46;
    const toggleHeight = 24;
    const togglePadding = 12;
    const toggleX = x + w - toggleWidth - togglePadding;
    const toggleY = y + (h - toggleHeight) / 2;
    const centerY = y + h / 2;

    // Label - larger, bolder, high contrast (with letter-spacing like effects panel)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.font = '700 17px Poppins, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '0.5px';
    ctx.fillText('WOBBLE', x, centerY);
    ctx.letterSpacing = '0px';

    // Info icon (circle with "?") - positioned between label and toggle
    const infoIconRadius = 14;
    const infoPadding = 14;
    const infoIconX = toggleX - infoPadding - infoIconRadius;
    const wobbleDesc = 'Adds gentle periodic rotation sway to the mascot for a more lively, organic feel.';

    // Draw info icon circle (matches effects panel standard)
    ctx.beginPath();
    ctx.arc(infoIconX, centerY, infoIconRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${ACCENT_RGB}, 0.2)`;
    ctx.fill();
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw "?" text (matches effects panel: 18px, weight 700)
    ctx.font = '700 18px Poppins, sans-serif';
    ctx.fillStyle = ACCENT_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', infoIconX, centerY + 1);

    // Add hit region for info icon
    this._infoRegions.push({
      name: 'info-wobble',
      x: infoIconX - infoIconRadius - 4,
      y: centerY - infoIconRadius - 4,
      w: (infoIconRadius + 4) * 2,
      h: (infoIconRadius + 4) * 2,
      extra: { desc: wobbleDesc, iconX: infoIconX, iconY: centerY }
    });

    // === iOS-STYLE SLIDER TOGGLE (matches effects panel) ===
    const dotRadius = 8;
    const dotPadding = 4;

    // Dot position: left when off, right when on
    const dotX = this.wobbleEnabled
      ? toggleX + toggleWidth - dotRadius - dotPadding
      : toggleX + dotRadius + dotPadding;

    // Track (pill background)
    ctx.beginPath();
    ctx.roundRect(toggleX, toggleY, toggleWidth, toggleHeight, toggleHeight / 2);

    if (this.wobbleEnabled) {
      // Active: filled accent track
      ctx.fillStyle = ACCENT_COLOR;
      ctx.fill();

      // Black dot as negative space
      ctx.beginPath();
      ctx.arc(dotX, centerY, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.fill();
    } else {
      // Inactive: dark track with accent outline only
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

    // Hit region for toggle (larger touch target)
    this._customRegions.push({
      name: 'toggle-wobble',
      x: toggleX - 8,
      y: toggleY - 8,
      w: toggleWidth + 16,
      h: toggleHeight + 16,
      extra: {}
    });
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

    // Set font for measuring (matches effects panel standard)
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

    // Position tooltip to the left of the info icon
    const tooltipX = x - tooltipW - 16;
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

    // Draw tooltip background (matches effects panel standard)
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
   * Get hit regions including brackets, custom regions, and info icons
   * Tooltip region comes first so clicks on tooltip dismiss it instead of toggling
   */
  getHitRegions() {
    const regions = [...this._bracketRegions];
    // Add tooltip region first if active (so it intercepts clicks)
    if (this._tooltipRegion) {
      regions.push(this._tooltipRegion);
    }
    return [...regions, ...this._infoRegions, ...this._customRegions];
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
      return true;
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
      return true;
    }

    // Handle undertone stop selection
    if (regionName.startsWith('undertone-') && regionName !== 'undertone-slider') {
      // Dismiss any active tooltip
      this._activeTooltip = null;
      this._tooltipRegion = null;
      if (this._tooltipTimeout) clearTimeout(this._tooltipTimeout);

      const index = extra?.index;
      if (index !== undefined && index !== this.selectedUndertoneIndex) {
        this.selectedUndertoneIndex = index;
        const undertone = UNDERTONES[index];
        console.log(`Selected undertone: ${undertone.label}`);

        // Apply undertone to mascot
        this._applyUndertone(undertone.id);

        // Trigger redraw
        this.updatePhoneDisplay();
      }
      return true;
    }

    // Handle slider drag
    if (regionName === 'undertone-slider') {
      // Slider tap/drag is handled via individual stop regions
      return true;
    }

    // Handle wobble toggle
    if (regionName === 'toggle-wobble') {
      // Dismiss any active tooltip
      this._activeTooltip = null;
      this._tooltipRegion = null;
      if (this._tooltipTimeout) clearTimeout(this._tooltipTimeout);

      this.wobbleEnabled = !this.wobbleEnabled;
      console.log(`Wobble: ${this.wobbleEnabled ? 'enabled' : 'disabled'}`);

      // Apply wobble to mascot
      this._applyWobble(this.wobbleEnabled);

      // Trigger redraw
      this.updatePhoneDisplay();
      return true;
    }

    return false;
  }

  /**
   * Apply undertone to mascot
   */
  _applyUndertone(undertoneId) {
    if (!this.mascot) return;

    const undertone = undertoneId === 'clear' ? null : undertoneId;

    // Use setUndertone or updateUndertone if available
    if (this.mascot.setUndertone) {
      this.mascot.setUndertone(undertone);
    } else if (this.mascot.updateUndertone) {
      this.mascot.updateUndertone(undertone);
    }

    // Update the floating title to show new undertone
    this._updateFloatingTitle();

    // Notify callback if set
    if (this.onUndertoneChange) {
      this.onUndertoneChange(undertoneId);
    }
  }

  /**
   * Apply wobble setting to mascot
   */
  _applyWobble(enabled) {
    if (!this.mascot) return;

    // Use the public API for enabling/disabling wobble
    if (enabled) {
      if (this.mascot.enableWobble) {
        this.mascot.enableWobble();
      }
    } else {
      if (this.mascot.disableWobble) {
        this.mascot.disableWobble();
      }
    }

    // Notify callback if set
    if (this.onWobbleChange) {
      this.onWobbleChange(enabled);
    }
  }

  /**
   * Handle confirm - close panel
   */
  _handleConfirm() {
    // Notify parent
    if (this.onConfirm) {
      this.onConfirm({
        undertone: UNDERTONES[this.selectedUndertoneIndex].id,
        wobbleEnabled: this.wobbleEnabled
      });
    }

    // Hide panel
    this.hide();
  }

  /**
   * Get current panel state
   */
  getState() {
    return {
      id: this.id,
      selectedUndertoneIndex: this.selectedUndertoneIndex,
      selectedUndertone: UNDERTONES[this.selectedUndertoneIndex],
      wobbleEnabled: this.wobbleEnabled
    };
  }

  /**
   * Restore panel state
   */
  restoreState(state) {
    if (state.selectedUndertoneIndex !== undefined) {
      this.selectedUndertoneIndex = state.selectedUndertoneIndex;
    }
    if (state.wobbleEnabled !== undefined) {
      this.wobbleEnabled = state.wobbleEnabled;
    }
  }

  /**
   * Set undertone by ID (for external control)
   */
  setUndertone(undertoneId) {
    const index = UNDERTONES.findIndex(u => u.id === undertoneId);
    if (index !== -1) {
      this.selectedUndertoneIndex = index;
      this._applyUndertone(undertoneId);
    }
  }

  /**
   * Get current undertone ID
   */
  getUndertone() {
    return UNDERTONES[this.selectedUndertoneIndex].id;
  }
}

export default MoodPanel;
