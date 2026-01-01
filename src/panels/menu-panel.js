/**
 * MenuPanel - Base class for all menu item panels
 *
 * Provides common lifecycle, rendering, and interaction handling
 * for panels that display on the holophone screen.
 *
 * Subclasses: EffectsPanel, MusicPanel, MeditatePanel,
 *             SettingsPanel, MoodsPanel, StoriesPanel
 */

// Brand colors from design system
export const COLORS = {
  eyeTeaGreen: '#84CFC5',      // Navigation, default theme
  magentaMajesty: '#DD4A9A',   // Cancel actions
  suppleBlue: '#32ACE2',       // Input/active states
  smoothAzure: '#4090CE',      // Processing states
  white: '#FFFFFF',
  black: '#000000',
  dimWhite: 'rgba(255, 255, 255, 0.7)',
  dimGray: 'rgba(255, 255, 255, 0.4)'
};

export class MenuPanel {
  /**
   * @param {Object} options
   * @param {string} options.id - Panel identifier (e.g., 'effects', 'music')
   * @param {string} options.title - Display title for the panel
   * @param {Object} options.holoPhone - HoloPhone3D instance
   * @param {Object} options.emitterBase - EmitterBase instance for mascot control
   * @param {Object} options.mascot - Mascot instance for float animation
   */
  constructor(options = {}) {
    this.id = options.id || 'panel';
    this.title = options.title || 'Panel';
    this.holoPhone = options.holoPhone;
    this.emitterBase = options.emitterBase;
    this.mascot = options.mascot;

    // State
    this.isVisible = false;
    this.currentIndex = 0;

    // Canvas dimensions (same as phone screen)
    this.canvasWidth = 512;
    this.canvasHeight = 228;

    // Hit regions for touch interaction
    this.hitRegions = [];

    // Callbacks
    this.onClose = options.onClose || (() => {});
    this.onConfirm = options.onConfirm || (() => {});
    this.onChange = options.onChange || (() => {});

    // DOM element for floating title
    this.titleElement = document.getElementById('panel-title');

    // Animation state
    this._originalTargetY = undefined;
    this._floatAnimationId = null;
  }

  /**
   * Show the panel
   */
  show() {
    this.isVisible = true;

    // Float mascot up during panel view
    this._animateMascotFloat(true);

    // Show and update floating title
    this._showTitle();

    // Position title dynamically
    this._updateTitlePosition();

    this._onShow();
    this.updatePhoneDisplay();
  }

  /**
   * Hide the panel
   */
  hide() {
    this.isVisible = false;

    // Float mascot back down
    this._animateMascotFloat(false);

    // Hide floating title
    this._hideTitle();

    this._onHide();
  }

  /**
   * Called when panel is shown - override in subclasses
   */
  _onShow() {
    // Override in subclass
  }

  /**
   * Called when panel is hidden - override in subclasses
   */
  _onHide() {
    // Override in subclass
  }

  // ============================================
  // Floating Title & Mascot Animation
  // ============================================

  /**
   * Show the floating holographic title
   */
  _showTitle() {
    if (!this.titleElement) return;

    // Update title text
    const titleName = this.titleElement.querySelector('.title-name');
    if (titleName) {
      titleName.textContent = this.title.toUpperCase();
    }

    // Show the element
    this.titleElement.classList.remove('hidden');
  }

  /**
   * Hide the floating holographic title
   */
  _hideTitle() {
    if (!this.titleElement) return;
    this.titleElement.classList.add('hidden');
  }

  /**
   * Dynamically position panel title between mascot bottom and emitter top
   * Uses visualViewport on mobile for accurate positioning with browser chrome
   */
  _updateTitlePosition() {
    if (!this.titleElement || !this.isVisible) return;

    // Use visualViewport for actual visible height on mobile
    const vh = window.visualViewport?.height || window.innerHeight;
    const vw = window.innerWidth;
    const isMobile = vw < 768 || vw / vh < 1;

    // Position in the gap between mascot and emitter (same as carousel)
    const mascotBottom = isMobile ? 0.53 : 0.50;
    const emitterTop = isMobile ? 0.67 : 0.65;
    const titleCenter = (mascotBottom + emitterTop) / 2;

    // Convert to bottom percentage
    const bottomPercent = (1 - titleCenter) * 100;

    this.titleElement.style.bottom = `${bottomPercent}%`;
    this.titleElement.style.top = 'auto';
  }

  /**
   * Animate mascot floating up or back down
   * @param {boolean} up - True to float up, false to return to normal
   */
  _animateMascotFloat(up) {
    const controls = this.mascot?.core3D?.renderer?.controls;
    if (!controls) return;

    // Store original target Y on first call
    if (this._originalTargetY === undefined) {
      this._originalTargetY = controls.target.y;
    }

    // Float offset - how much higher to raise during selection
    const floatOffset = 0.15;
    const targetY = up ? this._originalTargetY - floatOffset : this._originalTargetY;
    const startY = controls.target.y;
    const duration = 400; // ms
    const startTime = performance.now();

    // Cancel any existing animation
    if (this._floatAnimationId) {
      cancelAnimationFrame(this._floatAnimationId);
    }

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);

      controls.target.y = startY + (targetY - startY) * eased;
      controls.update();

      if (progress < 1) {
        this._floatAnimationId = requestAnimationFrame(animate);
      } else {
        this._floatAnimationId = null;
      }
    };

    animate();
  }

  /**
   * Update the holophone display with current panel content
   */
  updatePhoneDisplay() {
    if (!this.holoPhone || !this.isVisible) return;

    // Set panel data that HoloPhone will use to render
    // Note: render receives holoPhone as 4th param from _drawPanelState
    this.holoPhone.setPanelData({
      id: this.id,
      title: this.title,
      render: (ctx, w, h, holoPhone) => this.render(ctx, w, h, holoPhone),
      hitRegions: () => this.getHitRegions()  // Function to get latest hit regions after render
    });
  }

  /**
   * Render panel content to canvas - override in subclasses
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   * @param {HoloPhone} holoPhone - HoloPhone instance for shared drawing methods
   */
  render(ctx, w, h, holoPhone) {
    // Clear canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.fillRect(0, 0, w, h);

    // Draw default "not implemented" message
    ctx.fillStyle = COLORS.dimWhite;
    ctx.font = '600 18px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${this.title} Panel`, w / 2, h / 2 - 15);
    ctx.font = '400 14px Poppins, sans-serif';
    ctx.fillStyle = COLORS.dimGray;
    ctx.fillText('Coming soon...', w / 2, h / 2 + 15);

    // Draw brackets using shared holoPhone method if available
    if (holoPhone && holoPhone.drawPanelBrackets) {
      holoPhone.drawPanelBrackets(ctx, w, h);
    } else {
      this._drawBrackets(ctx, w, h);
    }
  }

  /**
   * Get hit regions for touch interaction - override in subclasses
   * @returns {Array<Object>} Array of hit region objects
   */
  getHitRegions() {
    return [
      // Cancel button (left bracket)
      {
        name: 'cancel',
        x: 0,
        y: 0,
        w: 60,
        h: this.canvasHeight
      },
      // Confirm button (right bracket)
      {
        name: 'confirm',
        x: this.canvasWidth - 60,
        y: 0,
        w: 60,
        h: this.canvasHeight
      }
    ];
  }

  /**
   * Handle touch/click on the panel
   * @param {string} regionName - Name of the hit region
   * @param {Object} extra - Extra data from the hit region
   */
  handleTouch(regionName, extra = {}) {
    switch (regionName) {
      case 'cancel':
        this._handleCancel();
        break;
      case 'confirm':
        this._handleConfirm();
        break;
      default:
        // Override in subclass for custom regions
        this._handleCustomTouch(regionName, extra);
    }
  }

  /**
   * Handle cancel action
   */
  _handleCancel() {
    if (this.holoPhone) {
      this.holoPhone.flashButton('cancel');
    }
    this.hide();
    this.onClose();
  }

  /**
   * Handle confirm action
   */
  _handleConfirm() {
    if (this.holoPhone) {
      this.holoPhone.flashButton('confirm');
    }
    this.hide();
    this.onConfirm(this.getState());
  }

  /**
   * Handle custom touch regions - override in subclasses
   * @param {string} regionName
   * @param {Object} extra
   */
  _handleCustomTouch(regionName, extra) {
    // Override in subclass
  }

  /**
   * Handle drag interaction (for sliders)
   * @param {number} normalizedX - X position normalized 0-1
   * @param {number} normalizedY - Y position normalized 0-1
   * @param {Object} extra - Extra data
   */
  handleDrag(normalizedX, normalizedY, extra = {}) {
    // Override in subclass for slider interactions
  }

  /**
   * Get current panel state - override in subclasses
   * @returns {Object} Serializable state object
   */
  getState() {
    return {
      id: this.id,
      currentIndex: this.currentIndex
    };
  }

  /**
   * Restore panel state - override in subclasses
   * @param {Object} state
   */
  restoreState(state) {
    if (state.currentIndex !== undefined) {
      this.currentIndex = state.currentIndex;
    }
  }

  // ============================================
  // Common Drawing Utilities
  // ============================================

  /**
   * Draw cancel/confirm brackets on sides
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   */
  _drawBrackets(ctx, w, h) {
    const bracketWidth = 45;
    const cornerRadius = 8;
    const padding = 12;

    // Left bracket (cancel - magenta)
    this._drawBracket(ctx, padding, padding, bracketWidth, h - padding * 2,
      cornerRadius, 'left', COLORS.magentaMajesty);

    // Cancel X icon
    ctx.fillStyle = COLORS.magentaMajesty;
    ctx.font = '600 20px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', padding + bracketWidth / 2, h / 2);

    // Right bracket (confirm - green)
    this._drawBracket(ctx, w - padding - bracketWidth, padding, bracketWidth, h - padding * 2,
      cornerRadius, 'right', COLORS.eyeTeaGreen);

    // Confirm check icon
    ctx.fillStyle = COLORS.eyeTeaGreen;
    ctx.fillText('✓', w - padding - bracketWidth / 2, h / 2);
  }

  /**
   * Draw a single bracket
   */
  _drawBracket(ctx, x, y, w, h, radius, side, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    if (side === 'left') {
      // [ shape
      ctx.moveTo(x + w, y);
      ctx.lineTo(x + radius, y);
      ctx.quadraticCurveTo(x, y, x, y + radius);
      ctx.lineTo(x, y + h - radius);
      ctx.quadraticCurveTo(x, y + h, x + radius, y + h);
      ctx.lineTo(x + w, y + h);
    } else {
      // ] shape
      ctx.moveTo(x, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x, y + h);
    }

    ctx.stroke();
  }

  /**
   * Draw a horizontal slider track with knob
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x - Track X position
   * @param {number} y - Track Y position (center)
   * @param {number} w - Track width
   * @param {number} value - Current value 0-1
   * @param {Array<string>} gradientColors - Array of colors for gradient
   * @returns {Object} Hit region for the slider
   */
  _drawSlider(ctx, x, y, w, value, gradientColors = [COLORS.magentaMajesty, COLORS.eyeTeaGreen]) {
    const trackHeight = 12;
    const knobRadius = 16;

    // Track background
    const gradient = ctx.createLinearGradient(x, 0, x + w, 0);
    gradientColors.forEach((color, i) => {
      gradient.addColorStop(i / (gradientColors.length - 1), color);
    });

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y - trackHeight / 2, w, trackHeight, trackHeight / 2);
    ctx.fill();

    // Knob position
    const knobX = x + value * w;

    // Knob shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(knobX + 2, y + 2, knobRadius, 0, Math.PI * 2);
    ctx.fill();

    // Knob
    ctx.fillStyle = COLORS.white;
    ctx.beginPath();
    ctx.arc(knobX, y, knobRadius, 0, Math.PI * 2);
    ctx.fill();

    // Knob border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Knob highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(knobX - 4, y - 4, knobRadius / 3, 0, Math.PI * 2);
    ctx.fill();

    // Return hit region
    return {
      name: 'slider',
      x: x - knobRadius,
      y: y - knobRadius - 10,
      w: w + knobRadius * 2,
      h: knobRadius * 2 + 20,
      extra: { sliderX: x, sliderW: w }
    };
  }

  /**
   * Draw pill-style option buttons
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array<Object>} options - Array of {label, value} objects
   * @param {number} selectedIndex - Currently selected index
   * @param {number} x - Start X position
   * @param {number} y - Center Y position
   * @param {number} maxWidth - Maximum total width
   * @returns {Array<Object>} Hit regions for each pill
   */
  _drawPillOptions(ctx, options, selectedIndex, x, y, maxWidth) {
    const pillHeight = 32;
    const pillPadding = 16;
    const pillGap = 8;
    const hitRegions = [];

    // Calculate pill widths
    ctx.font = '500 14px Poppins, sans-serif';
    const pillWidths = options.map(opt => ctx.measureText(opt.label).width + pillPadding * 2);
    const totalWidth = pillWidths.reduce((sum, w) => sum + w, 0) + pillGap * (options.length - 1);

    // Scale if needed
    const scale = totalWidth > maxWidth ? maxWidth / totalWidth : 1;

    let currentX = x;

    options.forEach((opt, i) => {
      const pillW = pillWidths[i] * scale;
      const isSelected = i === selectedIndex;

      // Pill background
      if (isSelected) {
        ctx.fillStyle = COLORS.eyeTeaGreen;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      }

      ctx.beginPath();
      ctx.roundRect(currentX, y - pillHeight / 2, pillW, pillHeight, pillHeight / 2);
      ctx.fill();

      // Pill text
      ctx.fillStyle = isSelected ? COLORS.black : COLORS.dimWhite;
      ctx.font = `${isSelected ? '600' : '500'} ${14 * scale}px Poppins, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opt.label, currentX + pillW / 2, y);

      // Hit region
      hitRegions.push({
        name: `pill-${i}`,
        x: currentX,
        y: y - pillHeight / 2,
        w: pillW,
        h: pillHeight,
        extra: { index: i, value: opt.value }
      });

      currentX += pillW + pillGap * scale;
    });

    return hitRegions;
  }

  /**
   * Draw title text at top of panel
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} title
   * @param {number} w - Canvas width
   */
  _drawTitle(ctx, title, w) {
    ctx.fillStyle = COLORS.white;
    ctx.font = '600 16px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(title.toUpperCase(), w / 2, 20);
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.hide();
    this.holoPhone = null;
    this.emitterBase = null;
  }
}

export default MenuPanel;
