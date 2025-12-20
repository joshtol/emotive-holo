/**
 * Tutorial Controller
 * Scripted onboarding experience that demonstrates app interactions
 * Shows once on first visit, stored in localStorage
 */

import * as THREE from 'three';

const TUTORIAL_STORAGE_KEY = 'emo-tutorial-complete';

export class TutorialController {
  constructor({ mascot, carousel, holoPhone, emitterBase, onComplete }) {
    this.mascot = mascot;
    this.carousel = carousel;
    this.holoPhone = holoPhone;
    this.emitterBase = emitterBase;
    this.onComplete = onComplete;

    this.isRunning = false;
    this._aborted = false;

    // Holographic hint text element (created on demand)
    this._hintElement = null;

    // Touch indicator container (for ripples)
    this._touchContainer = null;

    // Store original camera state for restoration
    this._originalCameraState = null;
  }

  /**
   * Check if tutorial should be shown (first visit)
   */
  shouldShow() {
    // Check URL param to force tutorial: ?tutorial=1
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tutorial') === '1') {
      return true;
    }

    // Check localStorage
    try {
      return localStorage.getItem(TUTORIAL_STORAGE_KEY) !== 'true';
    } catch {
      // localStorage not available, show tutorial
      return true;
    }
  }

  /**
   * Mark tutorial as complete
   */
  markComplete() {
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
    } catch {
      // localStorage not available, ignore
    }
  }

  /**
   * Reset tutorial (for testing)
   */
  static reset() {
    try {
      localStorage.removeItem(TUTORIAL_STORAGE_KEY);
      console.log('Tutorial reset - will show on next load');
    } catch {
      console.warn('Could not reset tutorial');
    }
  }

  /**
   * Start the tutorial sequence
   */
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._aborted = false;

    console.log('[Tutorial] Starting onboarding sequence');

    // Create hint text element and touch container
    this._createHintElement();
    this._createTouchContainer();

    // Save original camera state
    this._saveCameraState();

    // Get mascot center position for touch animations (actual 3D position)
    const mascotCenter = this._getMascotCenter();

    try {
      // Step 1: Show "Tap Emo to explore" on the holophone screen
      if (this.holoPhone) {
        this.holoPhone.setText('Tap Emo to explore');
      }
      await this._delay(1200);

      // Show tap ripple on mascot
      await this._showTapRipple(mascotCenter.x, mascotCenter.y);
      await this._delay(400);

      // Step 2: Open carousel (simulating tap on mascot)
      // Set carousel to start on 'rough' since that's what we initialized the mascot with
      const roughIndex = this.carousel.geometries.findIndex(g => g.id === 'rough');
      if (roughIndex !== -1) {
        this.carousel.currentIndex = roughIndex;
      }
      this.carousel.show();
      await this._delay(1000);

      // Save original camera distance for restore
      const controls = this.mascot?.core3D?.renderer?.controls;
      const originalDistance = controls?.object?.position?.length() || 2.5;

      // Step 3: Demo zoom first (on rough geometry)
      await this._showHint('Pinch to zoom', 'top');
      await this._delay(300);

      // Animate pinch gesture (fingers moving together) while zooming in
      this._animatePinchGesture(mascotCenter.x, mascotCenter.y, 'in', 600);
      await this._animateZoom(1.5, 600); // Zoom in
      await this._delay(200);

      // Animate pinch gesture (fingers moving apart) while zooming out
      this._animatePinchGesture(mascotCenter.x, mascotCenter.y, 'out', 600);
      await this._animateZoom(originalDistance, 600); // Zoom back to original
      await this._delay(500);

      // Step 4: Demo rotation
      await this._showHint('Drag to rotate', 'top');
      await this._delay(300);

      // Animate drag gesture while rotating
      this._animateDragGesture(mascotCenter.x, mascotCenter.y, 1500);
      await this._animateRotation(360, 1500); // Full 360
      await this._delay(500);

      // Hide hint before navigating
      await this._hideHint();
      await this._delay(300);

      // Step 5: Navigate through geometries -> heart
      await this._tapCarouselButton('next-geometry');
      this.carousel.navigate(1);
      await this._delay(1000);

      // Navigate -> crystal
      await this._tapCarouselButton('next-geometry');
      this.carousel.navigate(1);
      await this._delay(1000);

      // Step 6: Confirm selection (closes carousel with gesture)
      await this._tapCarouselButton('confirm');
      this.carousel.confirmSelection();
      await this._delay(800);

      // Step 7: Restore "Hold to speak" on holophone
      if (this.holoPhone) {
        this.holoPhone.setText('Hold to speak');
      }

      // Step 8: Complete
      this.markComplete();

      console.log('[Tutorial] Complete');

    } catch (error) {
      if (this._aborted) {
        console.log('[Tutorial] Aborted');
      } else {
        console.error('[Tutorial] Error:', error);
      }
    } finally {
      this.isRunning = false;
      this._cleanup();

      if (this.onComplete) {
        this.onComplete();
      }
    }
  }

  /**
   * Abort the tutorial
   */
  abort() {
    this._aborted = true;
  }

  /**
   * Navigate carousel to a specific geometry
   */
  async _navigateToGeometry(geometryId) {
    const targetIndex = this.carousel.geometries.findIndex(g => g.id === geometryId);
    if (targetIndex === -1) return;

    // Calculate shortest path
    const currentIndex = this.carousel.currentIndex;
    const total = this.carousel.geometries.length;
    let steps = targetIndex - currentIndex;

    // Adjust for wraparound
    if (Math.abs(steps) > total / 2) {
      steps = steps > 0 ? steps - total : steps + total;
    }

    const direction = steps > 0 ? 1 : -1;
    const absSteps = Math.abs(steps);

    for (let i = 0; i < absSteps; i++) {
      if (this._aborted) throw new Error('Aborted');
      await this._highlightButton(direction > 0 ? 'next-geometry' : 'prev-geometry', 300);
      this.carousel.navigate(direction);
      await this._delay(400);
    }
  }

  /**
   * Create the holographic hint text element
   */
  _createHintElement() {
    if (this._hintElement) return;

    this._hintElement = document.createElement('div');
    this._hintElement.id = 'tutorial-hint';
    this._hintElement.className = 'tutorial-hint hidden';
    this._hintElement.innerHTML = '<span class="hint-text"></span>';
    document.body.appendChild(this._hintElement);
  }

  /**
   * Show hint text above or below the mascot
   */
  async _showHint(text, position = 'top') {
    if (!this._hintElement || this._aborted) return;

    const textEl = this._hintElement.querySelector('.hint-text');
    textEl.textContent = text;

    this._hintElement.classList.remove('hidden', 'position-top', 'position-bottom');
    this._hintElement.classList.add(`position-${position}`);

    // Trigger reflow for animation
    void this._hintElement.offsetWidth;
    this._hintElement.classList.add('visible');

    await this._delay(300); // Wait for fade in
  }

  /**
   * Hide hint text
   */
  async _hideHint() {
    if (!this._hintElement) return;

    this._hintElement.classList.remove('visible');
    await this._delay(300); // Wait for fade out
    this._hintElement.classList.add('hidden');
  }

  /**
   * Highlight a carousel button (flash effect)
   */
  async _highlightButton(regionName, duration = 400) {
    if (this._aborted) throw new Error('Aborted');

    // Tell holoPhone to highlight the button
    if (this.holoPhone?.highlightButton) {
      this.holoPhone.highlightButton(regionName, duration);
    }

    await this._delay(duration);
  }

  /**
   * Tap a carousel button with gold ripple animation and CSS flash
   * Ripple fires first, then flash, then action can happen
   * @param {string} buttonName - Button name ('next-geometry', 'prev-geometry', 'confirm', 'cancel')
   */
  async _tapCarouselButton(buttonName) {
    if (this._aborted) throw new Error('Aborted');

    // Get the screen position of the button
    const buttonPos = this._getCarouselButtonPosition(buttonName);
    if (!buttonPos) {
      // Debug: Log why button position failed
      console.warn('[Tutorial] Could not get button position for', buttonName, {
        hasHoloPhone: !!this.holoPhone,
        hasEmitterBase: !!this.emitterBase,
        hasEmitterCamera: !!this.emitterBase?.emitterCamera,
        hasMesh: !!this.holoPhone?.mesh,
        hasRenderer: !!this.holoPhone?.renderer
      });
      // Fallback to just triggering the flash
      if (this.holoPhone?.flashButton) {
        this.holoPhone.flashButton(buttonName, 200);
      }
      await this._delay(150);
      return;
    }

    // Show gold ripple at button position FIRST (fire and forget - animation continues)
    this._showButtonTapRipple(buttonPos.x, buttonPos.y);

    // Wait for ripple to become visible before flash/action
    await this._delay(100);

    // Now trigger the CSS flash animation on the button
    if (this.holoPhone?.flashButton) {
      this.holoPhone.flashButton(buttonName, 200);
    }

    // Small delay so flash is visible before action
    await this._delay(50);
  }

  /**
   * Get screen position of a carousel button icon center
   * Maps exact canvas icon coordinates to screen space
   * @param {string} buttonName - Button name
   * @returns {Object|null} - { x, y } screen coordinates or null
   */
  _getCarouselButtonPosition(buttonName) {
    if (!this.holoPhone || !this.emitterBase?.emitterCamera) return null;

    const emitterCamera = this.emitterBase.emitterCamera;
    const bounds = this.holoPhone.getScreenBounds(emitterCamera);
    if (!bounds) return null;

    // Exact icon center positions from _drawSplitBracket in holo-phone.js:
    // Canvas size: 512 x 228
    // bracketWidth = 80, bracketInset = 4, actionHeight = h/3 = 76
    // Left icons at x = bracketInset + bracketWidth/2 + 4 = 48
    // Right icons at x = canvasWidth - bracketInset - bracketWidth/2 + (-4) = 464
    // Top icons at y = actionHeight/2 + 2 = 40
    // Bottom icons at y = height - actionHeight/2 - 2 = 188
    const canvasWidth = 512;
    const canvasHeight = 228;

    let canvasX, canvasY;
    switch (buttonName) {
      case 'cancel':
        canvasX = 48;
        canvasY = 40;
        break;
      case 'prev-geometry':
        canvasX = 48;
        canvasY = 188;
        break;
      case 'confirm':
        canvasX = 464;
        canvasY = 40;
        break;
      case 'next-geometry':
        canvasX = 464;
        canvasY = 188;
        break;
      default:
        return null;
    }

    // Convert canvas coordinates (0-512, 0-228) to screen bounds
    const screenX = bounds.left + (canvasX / canvasWidth) * bounds.width;
    const screenY = bounds.top + (canvasY / canvasHeight) * bounds.height;

    return { x: screenX, y: screenY };
  }

  /**
   * Show a smaller gold ripple for button taps (no brackets, just ripple)
   * @param {number} x - X position
   * @param {number} y - Y position
   */
  async _showButtonTapRipple(x, y) {
    if (!this._touchContainer || this._aborted) return;

    // Create just the ripple element (smaller, gold colored)
    const ripple = document.createElement('div');
    ripple.className = 'tutorial-button-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    this._touchContainer.appendChild(ripple);

    // Trigger animation
    await this._delay(10);
    ripple.classList.add('active');

    // Wait for animation and cleanup
    await this._delay(400);
    ripple.remove();
  }

  /**
   * Save current camera state for potential restoration
   */
  _saveCameraState() {
    const controls = this.mascot?.core3D?.renderer?.controls;
    if (!controls) return;

    this._originalCameraState = {
      position: controls.object.position.clone(),
      target: controls.target.clone()
    };
  }

  /**
   * Animate camera zoom
   * @param {number} targetDistance - Target distance from origin
   * @param {number} duration - Animation duration in ms
   */
  async _animateZoom(targetDistance, duration) {
    if (this._aborted) throw new Error('Aborted');

    const controls = this.mascot?.core3D?.renderer?.controls;
    if (!controls) return;

    const camera = controls.object;
    const startPos = camera.position.clone();
    const startDistance = startPos.length();

    // Calculate target position (same direction, different distance)
    const direction = startPos.clone().normalize();
    const targetPos = direction.multiplyScalar(targetDistance);

    const startTime = performance.now();

    return new Promise((resolve) => {
      const animate = () => {
        if (this._aborted) {
          resolve();
          return;
        }

        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease in-out cubic
        const eased = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        camera.position.lerpVectors(startPos, targetPos, eased);
        controls.update();

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      animate();
    });
  }

  /**
   * Animate camera rotation around the mascot
   * @param {number} degrees - Degrees to rotate
   * @param {number} duration - Animation duration in ms
   */
  async _animateRotation(degrees, duration) {
    if (this._aborted) throw new Error('Aborted');

    const controls = this.mascot?.core3D?.renderer?.controls;
    if (!controls) return;

    const camera = controls.object;
    const target = controls.target;

    // Calculate rotation in radians
    const radians = (degrees * Math.PI) / 180;

    // Get current angle (in XZ plane)
    const startPos = camera.position.clone().sub(target);
    const startAngle = Math.atan2(startPos.x, startPos.z);
    const radius = Math.sqrt(startPos.x * startPos.x + startPos.z * startPos.z);
    const y = startPos.y;

    const startTime = performance.now();

    return new Promise((resolve) => {
      const animate = () => {
        if (this._aborted) {
          resolve();
          return;
        }

        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease in-out sine for smooth rotation
        const eased = -(Math.cos(Math.PI * progress) - 1) / 2;

        const currentAngle = startAngle + radians * eased;
        camera.position.set(
          target.x + Math.sin(currentAngle) * radius,
          target.y + y,
          target.z + Math.cos(currentAngle) * radius
        );
        camera.lookAt(target);
        controls.update();

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      animate();
    });
  }

  /**
   * Create container for touch indicator overlays
   */
  _createTouchContainer() {
    if (this._touchContainer) return;

    this._touchContainer = document.createElement('div');
    this._touchContainer.id = 'tutorial-touch-container';
    this._touchContainer.className = 'tutorial-touch-container';
    document.body.appendChild(this._touchContainer);
  }

  /**
   * Get the center position of the mascot on screen (actual 3D projection)
   */
  _getMascotCenter() {
    // Try to get the actual mascot 3D position projected to screen
    const core3D = this.mascot?.core3D;
    if (core3D?.renderer?.camera && core3D?.mesh) {
      const camera = core3D.renderer.camera;
      const mesh = core3D.mesh;
      const renderer = core3D.renderer.renderer;

      // Get the center of the mascot mesh in world space
      const box = new THREE.Box3().setFromObject(mesh);
      const center = box.getCenter(new THREE.Vector3());

      // Project to screen coordinates
      const projected = center.clone().project(camera);

      // Get renderer bounds
      const rect = renderer.domElement.getBoundingClientRect();

      // Convert from NDC (-1 to 1) to screen pixels
      const screenX = (projected.x + 1) / 2 * rect.width + rect.left;
      const screenY = (-projected.y + 1) / 2 * rect.height + rect.top;

      return { x: screenX, y: screenY };
    }

    // Fallback: Use layout center from CSS custom property
    const layoutCenterX = getComputedStyle(document.documentElement)
      .getPropertyValue('--layout-center-x')?.trim() || '67%';

    // Parse percentage
    const centerXPercent = parseFloat(layoutCenterX) / 100;
    const centerX = window.innerWidth * centerXPercent;

    // Mascot is roughly in the upper-middle third of the screen
    const centerY = window.innerHeight * 0.4;

    return { x: centerX, y: centerY };
  }

  /**
   * Trigger haptic feedback on mobile devices
   * @param {number} duration - Vibration duration in ms
   */
  _triggerHaptic(duration = 50) {
    if (navigator.vibrate) {
      navigator.vibrate(duration);
    }
  }

  /**
   * Create a bracket indicator element with inner elements
   * @returns {HTMLElement} The bracket element
   */
  _createBracketElement() {
    const finger = document.createElement('div');
    finger.className = 'tutorial-finger';

    // Add all four bracket corner elements
    const topLeft = document.createElement('div');
    topLeft.className = 'bracket-top-left';
    finger.appendChild(topLeft);

    const topRight = document.createElement('div');
    topRight.className = 'bracket-top-right';
    finger.appendChild(topRight);

    const bottomLeft = document.createElement('div');
    bottomLeft.className = 'bracket-bottom-left';
    finger.appendChild(bottomLeft);

    const bottomRight = document.createElement('div');
    bottomRight.className = 'bracket-bottom-right';
    finger.appendChild(bottomRight);

    // Add ripple element inside brackets
    const ripple = document.createElement('div');
    ripple.className = 'bracket-ripple';
    finger.appendChild(ripple);

    return finger;
  }

  /**
   * Show a tap ripple effect at the given position
   * Brackets zoom in from off-screen, then tap ripple shows the touch
   * @param {number} x - X position
   * @param {number} y - Y position
   */
  async _showTapRipple(x, y) {
    if (!this._touchContainer || this._aborted) return;

    // Create bracket indicator with inner ripple - use tap-finger for large size
    const finger = this._createBracketElement();
    finger.classList.add('tap-finger');
    finger.style.left = `${x}px`;
    finger.style.top = `${y}px`;

    this._touchContainer.appendChild(finger);

    // Start with zoom-in animation (brackets fly in from off-screen)
    finger.classList.add('zoom-in');

    // Wait for zoom-in animation to complete (600ms)
    await this._delay(600);

    // Now trigger the press animation
    finger.classList.remove('zoom-in');
    finger.classList.add('pressing');

    await this._delay(150);

    // Trigger haptic on "tap" (mobile only)
    this._triggerHaptic(30);

    // Trigger ripple inside brackets
    const ripple = finger.querySelector('.bracket-ripple');
    ripple.classList.add('visible');

    // Trigger ripple animation
    await this._delay(50);
    ripple.classList.add('expanding');

    await this._delay(250);
    finger.classList.remove('pressing');
    finger.classList.add('releasing');

    // Clean up after animation
    await this._delay(400);
    finger.remove();
  }

  /**
   * Animate a pinch gesture (two fingers moving together or apart)
   * @param {number} centerX - Center X position
   * @param {number} centerY - Center Y position
   * @param {string} direction - 'in' for zoom in (fingers together), 'out' for zoom out (fingers apart)
   * @param {number} duration - Animation duration in ms
   */
  _animatePinchGesture(centerX, centerY, direction, duration) {
    if (!this._touchContainer || this._aborted) return;

    const startSpread = direction === 'in' ? 80 : 30; // Distance from center
    const endSpread = direction === 'in' ? 30 : 80;

    // Create two bracket indicators
    const finger1 = this._createBracketElement();
    finger1.classList.add('pinch-finger');

    const finger2 = this._createBracketElement();
    finger2.classList.add('pinch-finger');

    this._touchContainer.appendChild(finger1);
    this._touchContainer.appendChild(finger2);

    // Animate fingers
    const startTime = performance.now();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease in-out
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const currentSpread = startSpread + (endSpread - startSpread) * eased;

      // Position fingers diagonally (top-left and bottom-right)
      const offset = currentSpread * 0.7; // 45 degree angle
      finger1.style.left = `${centerX - offset}px`;
      finger1.style.top = `${centerY - offset}px`;
      finger2.style.left = `${centerX + offset}px`;
      finger2.style.top = `${centerY + offset}px`;

      if (progress < 1 && !this._aborted) {
        requestAnimationFrame(animate);
      } else {
        // Fade out and remove
        finger1.classList.add('releasing');
        finger2.classList.add('releasing');
        setTimeout(() => {
          finger1.remove();
          finger2.remove();
        }, 300);
      }
    };

    // Start with fingers visible and show ripples
    finger1.style.opacity = '1';
    finger2.style.opacity = '1';
    finger1.classList.add('pressing');
    finger2.classList.add('pressing');

    // Show ripples inside both brackets
    const ripple1 = finger1.querySelector('.bracket-ripple');
    const ripple2 = finger2.querySelector('.bracket-ripple');
    ripple1.classList.add('visible');
    ripple2.classList.add('visible');

    animate();
  }

  /**
   * Animate a drag gesture (single finger moving in an arc)
   * @param {number} centerX - Center X position
   * @param {number} centerY - Center Y position
   * @param {number} duration - Animation duration in ms
   */
  _animateDragGesture(centerX, centerY, duration) {
    if (!this._touchContainer || this._aborted) return;

    // Create bracket indicator
    const finger = this._createBracketElement();
    finger.classList.add('drag-finger');

    // Create trail element
    const trail = document.createElement('div');
    trail.className = 'tutorial-drag-trail';

    this._touchContainer.appendChild(trail);
    this._touchContainer.appendChild(finger);

    // Arc parameters - finger moves in a horizontal arc around the mascot
    const arcRadius = 100;
    const startAngle = -Math.PI / 4; // Start right of center
    const endAngle = startAngle + Math.PI * 2; // Full circle

    const startTime = performance.now();
    let lastX = centerX + Math.cos(startAngle) * arcRadius;
    let lastY = centerY;

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease in-out sine for smooth motion
      const eased = -(Math.cos(Math.PI * progress) - 1) / 2;

      const currentAngle = startAngle + (endAngle - startAngle) * eased;
      const x = centerX + Math.cos(currentAngle) * arcRadius;
      const y = centerY + Math.sin(currentAngle) * arcRadius * 0.3; // Flatten the arc vertically

      finger.style.left = `${x}px`;
      finger.style.top = `${y}px`;

      // Update trail (show motion path)
      if (progress > 0.05 && progress < 0.95) {
        trail.style.left = `${centerX}px`;
        trail.style.top = `${centerY}px`;
        trail.style.width = `${arcRadius * 2}px`;
        trail.style.height = `${arcRadius * 0.6}px`;
        trail.style.opacity = '0.3';
      }

      if (progress < 1 && !this._aborted) {
        requestAnimationFrame(animate);
      } else {
        // Fade out and remove
        finger.classList.add('releasing');
        trail.style.opacity = '0';
        setTimeout(() => {
          finger.remove();
          trail.remove();
        }, 300);
      }
    };

    // Start with finger visible and pressing, show ripple
    finger.style.left = `${centerX + Math.cos(startAngle) * arcRadius}px`;
    finger.style.top = `${centerY}px`;
    finger.style.opacity = '1';
    finger.classList.add('pressing');

    // Show ripple inside bracket
    const ripple = finger.querySelector('.bracket-ripple');
    ripple.classList.add('visible');

    animate();
  }

  /**
   * Promise-based delay
   */
  _delay(ms) {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (this._aborted) {
          resolve(); // Resolve immediately if aborted
        } else {
          resolve();
        }
      }, ms);
    });
  }

  /**
   * Cleanup after tutorial
   */
  _cleanup() {
    // Remove hint element
    if (this._hintElement) {
      this._hintElement.remove();
      this._hintElement = null;
    }

    // Remove touch container
    if (this._touchContainer) {
      this._touchContainer.remove();
      this._touchContainer = null;
    }
  }
}

export default TutorialController;
