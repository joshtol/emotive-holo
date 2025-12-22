/**
 * Layout Scaler
 * Maintains consistent proportions across all resolutions and orientations
 *
 * Desktop: Keep calibrated positions as-is (67% center, fixed px values)
 * Mobile: Center everything at 50%, scale down proportionally
 *
 * SHADOW SYSTEM:
 * Shadows are scaled PROPORTIONATELY to the actual rendered size of the 3D emitter.
 * This ensures shadows always match the emitter regardless of viewport/device/orientation.
 *
 * Reference calibration was done at 1920x1080 on desktop with the emitter at 67% X.
 * When the emitter's screen bounds change, shadows are scaled and repositioned to match.
 */

export class LayoutScaler {
  constructor() {
    // Current state (undefined until first check)
    this.isMobile = undefined;

    // Reference to the EmitterBase instance (set via setEmitter())
    this.emitterBase = null;

    // Desktop calibrated values (don't change these)
    this.desktop = {
      centerX: 67,
      phoneWidth: 260,
      phoneHeight: 125,
      phoneBottom: 115,
      projectorWidth: 420,
      projectorHeight: 140,
      projectorBottom: 20,
      cancelBottom: 180,
      cancelOffsetX: 100,
      phoneFontSize: 0.8,
      emitterScale: 0.27,
      emitterY: -0.50,
      cameraDistance: 1.6,
      mascotYOffset: 0,  // No offset on desktop
      // Emitter camera distance controls how big the phone/emitter appear
      // Smaller = closer = larger apparent size
      emitterCameraDistance: 1.3
    };

    // Mobile values (centered, scaled down)
    this.mobile = {
      centerX: 50,
      phoneWidth: 200,
      phoneHeight: 96,
      phoneBottom: 95,
      projectorWidth: 340,
      projectorHeight: 120,
      projectorBottom: 15,
      cancelBottom: 160,
      cancelOffsetX: 80,
      phoneFontSize: 0.75,
      emitterScale: 0.27,
      emitterY: -0.55,
      cameraDistance: 2.0,
      mascotYOffset: 0.15,  // Raise mascot on mobile
      // Emitter camera much closer on mobile = phone appears larger
      // Smaller value = closer camera = bigger phone on screen
      emitterCameraDistance: 1.4
    };

    // Shadow shapes defined as offsets from layout center and shadow bottom
    // These are the original calibrated shadow points at 1920x1080 desktop
    //
    // Original calibrated shadow points (absolute viewBox coords at centerX=67):
    //   contact: [[60.0, 82.9], [74.8, 82.9], [77.9, 98.3], [55.9, 98.4]]
    //   penumbra: [[60.1, 83.1], [78.0, 98.1], [75.9, 100.4], [50.0, 100.0]]
    //   ambient: [[59.9, 82.8], [77.8, 97.8], [77.1, 104.3], [31.9, 101.4]]
    //
    // Store as [xOffset from center, yOffset from bottom (98)]
    // These offsets get SCALED by a device-specific factor
    this.shadowShapes = {
      contact: [
        [-7, -15.1],    // 60-67, 82.9-98
        [7.8, -15.1],   // 74.8-67, 82.9-98
        [10.9, 0.3],    // 77.9-67, 98.3-98
        [-11.1, 0.4]    // 55.9-67, 98.4-98
      ],
      penumbra: [
        [-6.9, -14.9],  // 60.1-67, 83.1-98
        [11, 0.1],      // 78-67, 98.1-98
        [8.9, 2.4],     // 75.9-67, 100.4-98
        [-17, 2.0]      // 50-67, 100-98
      ],
      ambient: [
        [-7.1, -15.2],  // 59.9-67, 82.8-98
        [10.8, -0.2],   // 77.8-67, 97.8-98
        [10.1, 6.3],    // 77.1-67, 104.3-98
        [-35.1, 3.4]    // 31.9-67, 101.4-98
      ]
    };

    // Shadow scale factors - mobile shadow is bigger relative to viewport
    // because the emitter takes up more screen space
    this.shadowScale = {
      desktop: 1.05,
      mobile: 3.5
    };

    // Shadow anchor Y position (bottom of contact shadow in viewBox coords)
    // Moved up to match emitter position change
    this.shadowBottomY = {
      desktop: 98,
      mobile: 96
    };

    // Bind resize handler
    this._onResize = this._onResize.bind(this);
  }

  /**
   * Set the EmitterBase instance for dynamic shadow sizing
   * @param {EmitterBase} emitter
   */
  setEmitter(emitter) {
    this.emitterBase = emitter;
  }

  /**
   * Initialize the scaler and set up resize listener
   */
  init() {
    window.addEventListener('resize', this._onResize);
    this._onResize();
    return this;
  }

  /**
   * Handle window resize - update CSS vars based on mobile/desktop
   */
  _onResize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const aspect = vw / vh;

    // Determine if mobile (portrait or small screen)
    this.isMobile = vw < 768 || aspect < 1;

    // Always update CSS vars (they're cheap to set)
    this._updateCSSVars();

    // Dispatch event for JS components to respond
    window.dispatchEvent(new CustomEvent('layoutscale', {
      detail: {
        isMobile: this.isMobile,
        viewportWidth: vw,
        viewportHeight: vh,
        aspect
      }
    }));
  }

  /**
   * Update CSS custom properties for layout
   */
  _updateCSSVars() {
    const root = document.documentElement;
    const config = this.isMobile ? this.mobile : this.desktop;

    root.style.setProperty('--layout-center-x', `${config.centerX}%`);
    root.style.setProperty('--phone-width', `${config.phoneWidth}px`);
    root.style.setProperty('--phone-height', `${config.phoneHeight}px`);
    root.style.setProperty('--phone-bottom', `${config.phoneBottom}px`);
    root.style.setProperty('--projector-width', `${config.projectorWidth}px`);
    root.style.setProperty('--projector-height', `${config.projectorHeight}px`);
    root.style.setProperty('--projector-bottom', `${config.projectorBottom}px`);
    root.style.setProperty('--cancel-bottom', `${config.cancelBottom}px`);
    root.style.setProperty('--cancel-offset-x', `${config.cancelOffsetX}px`);
    root.style.setProperty('--phone-font-size', `${config.phoneFontSize}rem`);
  }

  /**
   * Get 3D parameters for the emitter and mascot
   */
  get3DParams() {
    const config = this.isMobile ? this.mobile : this.desktop;
    return {
      emitterScale: config.emitterScale,
      emitterY: config.emitterY,
      cameraDistance: config.cameraDistance,
      mascotYOffset: config.mascotYOffset || 0,
      emitterCameraDistance: config.emitterCameraDistance
    };
  }

  /**
   * Generate shadow polygon points with position and scale adjustments.
   * Shadow shape is defined as offsets from center (X) and bottom (Y).
   * Only X is scaled - Y stays fixed since shadow height doesn't change much.
   *
   * @param {Array} shapeOffsets - Shadow shape as [[xOffset, yOffset], ...] from center/bottom
   * @param {number} layoutCenterX - Current layout center X in viewBox coords
   * @param {number} scale - Scale factor for X offset (1.0 for desktop, larger for mobile)
   * @param {number} bottomY - Y anchor position for the shadow
   * @returns {string} SVG polygon points string
   */
  _generateShadowPoints(shapeOffsets, layoutCenterX, scale, bottomY) {
    return shapeOffsets.map(([xOffset, yOffset]) => {
      const x = layoutCenterX + xOffset * scale;
      const y = bottomY + yOffset;  // Y not scaled
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  /**
   * Update SVG shadow positions based on current layout.
   * Shadows are positioned at layout center and scaled based on device.
   * Mobile shadows are larger because the emitter takes up more screen space.
   */
  updateShadows() {
    const contact = document.getElementById('shadow-contact');
    const penumbra = document.getElementById('shadow-penumbra');
    const ambient = document.getElementById('shadow-ambient');
    const reflection = document.getElementById('table-reflection');

    // Get current layout center X (this is where the emitter is positioned)
    const config = this.isMobile ? this.mobile : this.desktop;
    const layoutCenterX = config.centerX;
    const scale = this.isMobile ? this.shadowScale.mobile : this.shadowScale.desktop;
    const bottomY = this.isMobile ? this.shadowBottomY.mobile : this.shadowBottomY.desktop;

    // Generate shadow points with position and scale
    const contactPoints = this._generateShadowPoints(this.shadowShapes.contact, layoutCenterX, scale, bottomY);
    const penumbraPoints = this._generateShadowPoints(this.shadowShapes.penumbra, layoutCenterX, scale, bottomY);
    const ambientPoints = this._generateShadowPoints(this.shadowShapes.ambient, layoutCenterX, scale, bottomY);

    console.log('Shadow update - layoutCenterX:', layoutCenterX, 'scale:', scale, 'bottomY:', bottomY);

    if (contact) contact.setAttribute('points', contactPoints);
    if (penumbra) penumbra.setAttribute('points', penumbraPoints);
    if (ambient) ambient.setAttribute('points', ambientPoints);

    // Update table reflection position - ellipse centered at layout center
    if (reflection) {
      reflection.setAttribute('cx', layoutCenterX);
      // Scale the reflection ellipse for mobile (larger relative to viewport)
      const rxScale = this.isMobile ? 2.2 : 1.0;
      const ryScale = this.isMobile ? 2.0 : 1.0;
      reflection.setAttribute('rx', 18 * rxScale);
      reflection.setAttribute('ry', 6 * ryScale);
    }
  }

  /**
   * Cleanup
   */
  dispose() {
    window.removeEventListener('resize', this._onResize);
  }
}

// Singleton instance
export const layoutScaler = new LayoutScaler();
