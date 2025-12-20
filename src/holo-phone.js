/**
 * HoloPhone - 3D Holographic Phone Display
 * Loads and manages the 3D phone model with dynamic screen texture
 *
 * The phone screen can display text, status messages, and interactive prompts.
 * Uses CanvasTexture for dynamic rendering of screen content.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export class HoloPhone {
  constructor(scene, camera, renderer, options = {}) {
    this.scene = scene;  // The emitter's scene (shared)
    this.camera = camera;
    this.renderer = renderer;
    this.mesh = null;

    // Raycaster for touch detection
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();

    // Screen texture components
    this.screenCanvas = null;
    this.screenContext = null;
    this.screenTexture = null;
    this.screenMaterial = null;

    // Screen content state
    this._screenText = 'Hold to speak';
    this._screenState = 'idle';  // idle, listening, processing, speaking, carousel, meditation
    this._animationFrame = 0;
    this._progress = 0;  // TTS progress 0-1

    // Meditation state
    this._meditationData = null;  // { phase, timer, cycle, maxCycles }

    // Carousel state
    this._carouselData = null;  // { geometries, currentIndex, currentVariantIndex, variants, phase }
    this._carouselHitRegions = [];  // { name, x, y, w, h, extra? }[]

    // UV calibration values (can be adjusted in grid mode)
    this._uvMin = { x: 0.023, y: 0.194 };
    this._uvMax = { x: 0.374, y: 0.990 };
    this._uvStep = 0.01;
    this._activeControl = 'minY'; // minX, minY, maxX, maxY

    this.options = {
      basePath: '/assets/models/phone',
      scale: options.scale || 0.08,
      position: options.position || { x: 0.25, y: -0.58, z: 0.15 },
      rotation: options.rotation || { x: 0, y: -0.3, z: 0 },
      // Canvas aspect ratio must match screen UV region AFTER 90° rotation
      // UV region: x(0.04-0.36)=0.32, y(0.05-0.77)=0.72
      // After 90° CW rotation: width=0.72, height=0.32 → aspect ~2.25:1
      // Canvas is drawn in this rotated orientation (landscape for phone display)
      screenWidth: 512,
      screenHeight: 228,  // 512 / 2.25 ≈ 228
      ...options
    };

    // Create screen canvas for dynamic text
    this._createScreenCanvas();
  }

  /**
   * Create the canvas used for rendering screen content
   */
  _createScreenCanvas() {
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = this.options.screenWidth;
    this.screenCanvas.height = this.options.screenHeight;
    this.screenContext = this.screenCanvas.getContext('2d');

    // Check for grid mode FIRST
    const urlParams = new URLSearchParams(window.location.search);
    this._gridMode = urlParams.has('phone-grid');
    console.log('HoloPhone grid mode:', this._gridMode, 'URL:', window.location.search);

    // Set up keyboard controls if in grid mode
    if (this._gridMode) {
      this._setupGridControls();
    }

    // Initial render (grid or normal)
    this._renderScreen();

    // Create Three.js texture from canvas
    this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTexture.minFilter = THREE.LinearFilter;
    this.screenTexture.magFilter = THREE.LinearFilter;
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;
  }

  /**
   * Render the screen content to the canvas
   */
  _renderScreen() {
    const ctx = this.screenContext;
    const w = this.screenCanvas.width;
    const h = this.screenCanvas.height;

    // Check for alignment grid mode (use cached flag)
    if (this._gridMode) {
      this._drawAlignmentGrid(ctx, w, h);
      if (this.screenTexture) {
        this.screenTexture.needsUpdate = true;
      }
      return;
    }

    // Clear with dark background
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, w, h);

    // Add subtle gradient overlay
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(60, 200, 180, 0.1)');
    gradient.addColorStop(0.5, 'rgba(60, 200, 180, 0.05)');
    gradient.addColorStop(1, 'rgba(60, 200, 180, 0.1)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Draw based on state
    switch (this._screenState) {
      case 'listening':
        this._drawListeningState(ctx, w, h);
        break;
      case 'processing':
        this._drawProcessingState(ctx, w, h);
        break;
      case 'speaking':
        this._drawSpeakingState(ctx, w, h);
        break;
      case 'meditation':
        this._drawMeditationState(ctx, w, h);
        break;
      case 'carousel':
        this._drawCarouselState(ctx, w, h);
        break;
      default:
        this._drawIdleState(ctx, w, h);
    }

    // Mark texture for update
    if (this.screenTexture) {
      this.screenTexture.needsUpdate = true;
    }
  }

  /**
   * Draw idle state - "Hold to speak" prompt
   */
  _drawIdleState(ctx, w, h) {
    ctx.fillStyle = '#40e0d0';
    ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this._screenText, w / 2, h / 2);

    // Subtle pulsing indicator
    const pulse = Math.sin(this._animationFrame * 0.05) * 0.3 + 0.7;
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 + 50, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#40e0d0';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /**
   * Draw listening state - animated waveform
   */
  _drawListeningState(ctx, w, h) {
    ctx.fillStyle = '#40e0d0';
    ctx.font = '24px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Listening...', w / 2, h / 2 - 40);

    // Animated waveform bars
    const barCount = 7;
    const barWidth = 16;
    const barSpacing = 24;
    const startX = w / 2 - (barCount * barSpacing) / 2;

    for (let i = 0; i < barCount; i++) {
      const phase = this._animationFrame * 0.15 + i * 0.8;
      const height = 20 + Math.sin(phase) * 25 + Math.sin(phase * 1.5) * 15;
      const x = startX + i * barSpacing;
      const y = h / 2 + 20 - height / 2;

      ctx.fillStyle = `rgba(64, 224, 208, ${0.6 + Math.sin(phase) * 0.4})`;
      ctx.fillRect(x, y, barWidth, height);
    }
  }

  /**
   * Draw processing state - spinning indicator with cancel button
   */
  _drawProcessingState(ctx, w, h) {
    // Clear hit regions for processing state (reuse speaking hit regions)
    this._speakingHitRegions = [];

    // Draw cancel button in top-left corner (same as speaking state)
    this._drawCancelButton(ctx);

    ctx.fillStyle = '#40e0d0';
    ctx.font = '24px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Processing...', w / 2, h / 2 - 30);

    // Spinning dots
    const dotCount = 8;
    const radius = 25;
    const centerX = w / 2;
    const centerY = h / 2 + 30;

    for (let i = 0; i < dotCount; i++) {
      const angle = (i / dotCount) * Math.PI * 2 + this._animationFrame * 0.1;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      const alpha = (Math.sin(angle - this._animationFrame * 0.1) + 1) / 2;

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(64, 224, 208, ${0.3 + alpha * 0.7})`;
      ctx.fill();
    }
  }

  /**
   * Draw cancel button in top-left corner (bracket style)
   * Reused by speaking and processing states
   */
  _drawCancelButton(ctx) {
    const cancelSize = 50;
    const cancelX = 12;
    const cancelY = 12;
    const cornerRadius = 12;

    // Cancel bracket background
    ctx.strokeStyle = 'rgba(255, 100, 100, 0.6)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cancelX + cancelSize, cancelY + 4);
    ctx.lineTo(cancelX + cornerRadius, cancelY + 4);
    ctx.quadraticCurveTo(cancelX + 4, cancelY + 4, cancelX + 4, cancelY + cornerRadius);
    ctx.lineTo(cancelX + 4, cancelY + cancelSize - cornerRadius);
    ctx.quadraticCurveTo(cancelX + 4, cancelY + cancelSize - 4, cancelX + cornerRadius, cancelY + cancelSize - 4);
    ctx.lineTo(cancelX + cancelSize, cancelY + cancelSize - 4);
    ctx.stroke();

    // Cancel X icon
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', cancelX + cancelSize / 2 + 2, cancelY + cancelSize / 2);

    // Hit region for cancel
    this._speakingHitRegions.push({
      name: 'cancel',
      x: cancelX,
      y: cancelY,
      w: cancelSize,
      h: cancelSize
    });
  }

  /**
   * Draw speaking state - text with animated indicator and cancel button
   */
  _drawSpeakingState(ctx, w, h) {
    // Clear hit regions for speaking state
    this._speakingHitRegions = [];

    // Draw cancel button
    this._drawCancelButton(ctx);

    // Draw text - soft white with subtle cyan glow for visibility
    ctx.fillStyle = 'rgba(230, 245, 245, 0.95)';
    ctx.font = '500 28px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(64, 224, 208, 0.6)';
    ctx.shadowBlur = 8;

    // Wrap text if needed
    const words = this._screenText.split(' ');
    let lines = [];
    let currentLine = '';
    const maxWidth = w - 80;  // More padding for cancel button

    for (const word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Draw lines centered
    const lineHeight = 32;
    const startY = h / 2 - (lines.length * lineHeight) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, startY + i * lineHeight);
    });

    // Reset shadow for other elements
    ctx.shadowBlur = 0;

    // Progress bar at bottom
    const barY = h - 35;
    const barWidth = w - 80;
    const barHeight = 4;
    const barX = 40;

    // Background track
    ctx.fillStyle = 'rgba(64, 224, 208, 0.2)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 2);
    ctx.fill();

    // Filled progress
    if (this._progress > 0) {
      ctx.fillStyle = '#40e0d0';
      ctx.shadowColor = '#40e0d0';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth * this._progress, barHeight, 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  /**
   * Get hit region for speaking state (cancel button)
   */
  getSpeakingHitRegion(canvasX, canvasY) {
    if (!this._speakingHitRegions) return null;
    for (const region of this._speakingHitRegions) {
      if (canvasX >= region.x && canvasX <= region.x + region.w &&
          canvasY >= region.y && canvasY <= region.y + region.h) {
        return region;
      }
    }
    return null;
  }

  // ==================== MEDITATION STATE ====================

  /**
   * Set meditation data for display
   * @param {Object|null} data - { phase, timer, cycle, maxCycles } or null
   */
  setMeditationData(data) {
    this._meditationData = data;
    if (this._screenState === 'meditation') {
      this._renderScreen();
    }
  }

  /**
   * Draw meditation state - clean, focused UI for guided breathing
   * Layout: Phase instruction at top, large timer in center, minimal progress dots
   */
  _drawMeditationState(ctx, w, h) {
    // Draw cancel button (smaller, more subtle)
    this._speakingHitRegions = [];
    this._drawMeditationCancelButton(ctx);

    const data = this._meditationData;
    const phase = data?.phase || this._screenText || 'Breathe';
    const timer = data?.timer ?? '';
    const cycle = data?.cycle ?? 0;
    const maxCycles = data?.maxCycles ?? 5;

    // High contrast colors
    const textColor = 'rgba(255, 255, 255, 0.98)';

    // Split layout: Phase instruction on left, Timer on right
    if (timer !== '') {
      // Left side: Phase instruction - large, left-justified
      ctx.fillStyle = textColor;
      ctx.font = '300 42px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(phase, 70, h / 2);  // Left margin for cancel button

      // Right side: Large timer number
      ctx.fillStyle = textColor;
      ctx.font = '200 100px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(180, 160, 220, 0.4)';
      ctx.shadowBlur = 20;
      ctx.fillText(String(timer), w * 0.78, h / 2);
      ctx.shadowBlur = 0;
    } else {
      // No timer - show message centered (intro/outro/affirmations)
      ctx.fillStyle = textColor;
      ctx.font = '400 28px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(180, 160, 220, 0.3)';
      ctx.shadowBlur = 12;

      // Wrap text if needed
      const words = this._screenText.split(' ');
      let lines = [];
      let currentLine = '';
      const maxWidth = w - 120;

      for (const word of words) {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);

      const lineHeight = 36;
      const textStartY = h / 2 - (lines.length * lineHeight) / 2;
      lines.forEach((line, i) => {
        ctx.fillText(line, w / 2, textStartY + i * lineHeight);
      });

      ctx.shadowBlur = 0;
    }

    // Progress dots at bottom (minimal, elegant)
    const dotRadius = 5;
    const dotSpacing = 20;
    const dotsY = h - 28;
    const totalDotsWidth = (maxCycles - 1) * dotSpacing;
    const dotsStartX = (w - totalDotsWidth) / 2;

    for (let i = 0; i < maxCycles; i++) {
      const dotX = dotsStartX + i * dotSpacing;
      const isComplete = i < cycle;
      const isCurrent = i === cycle;

      ctx.beginPath();
      ctx.arc(dotX, dotsY, isCurrent ? dotRadius + 1 : dotRadius, 0, Math.PI * 2);

      if (isComplete) {
        // Completed cycles - bright lavender with glow
        ctx.fillStyle = 'rgba(200, 180, 255, 1)';
        ctx.shadowColor = 'rgba(200, 180, 255, 0.8)';
        ctx.shadowBlur = 8;
      } else if (isCurrent) {
        // Current cycle - semi-bright
        ctx.fillStyle = 'rgba(180, 160, 220, 0.7)';
        ctx.shadowBlur = 0;
      } else {
        // Future cycles - visible but dim
        ctx.fillStyle = 'rgba(140, 130, 160, 0.5)';
        ctx.shadowBlur = 0;
      }

      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  /**
   * Draw minimal cancel button for meditation (top-left, subtle)
   */
  _drawMeditationCancelButton(ctx) {
    const size = 36;
    const x = 16;
    const y = 16;

    // Subtle circular background
    ctx.fillStyle = 'rgba(255, 100, 100, 0.15)';
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    // X icon
    ctx.strokeStyle = 'rgba(255, 100, 100, 0.7)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const inset = 12;
    ctx.beginPath();
    ctx.moveTo(x + inset, y + inset);
    ctx.lineTo(x + size - inset, y + size - inset);
    ctx.moveTo(x + size - inset, y + inset);
    ctx.lineTo(x + inset, y + size - inset);
    ctx.stroke();

    // Hit region
    this._speakingHitRegions.push({
      name: 'cancel',
      x: x,
      y: y,
      w: size,
      h: size
    });
  }

  // ==================== CAROUSEL STATE ====================

  /**
   * SSS color mapping for crystal variants
   */
  static SSS_COLORS = {
    'default': '#ffffff',  // Quartz (white)
    'ruby': '#e0115f',     // Ruby (red)
    'citrine': '#e4a700',  // Citrine (yellow/orange)
    'emerald': '#50c878',  // Emerald (green)
    'sapphire': '#0f52ba', // Sapphire (blue)
    'amethyst': '#9966cc'  // Amethyst (purple)
  };

  /**
   * Set carousel data and enter carousel mode
   * @param {Object|null} data - Carousel data or null to exit
   * @param {Array} data.geometries - List of geometry objects
   * @param {number} data.currentIndex - Current geometry index
   * @param {number} data.currentVariantIndex - Current variant index
   * @param {Array} data.variants - Current geometry's variants
   * @param {number} data.phase - Moon phase value (0-1) if applicable
   */
  setCarouselData(data) {
    this._carouselData = data;
    if (data) {
      this._screenState = 'carousel';
    } else {
      this._screenState = 'idle';
      this._screenText = 'Hold to speak';
    }
    this._renderScreen();
  }

  /**
   * Get hit region at canvas coordinates
   * @param {number} x - Canvas X coordinate (0 to screenWidth)
   * @param {number} y - Canvas Y coordinate (0 to screenHeight)
   * @returns {Object|null} - Hit region { name, extra? } or null
   */
  getHitRegion(x, y) {
    for (const region of this._carouselHitRegions) {
      if (x >= region.x && x <= region.x + region.w &&
          y >= region.y && y <= region.y + region.h) {
        return { name: region.name, extra: region.extra };
      }
    }
    return null;
  }

  /**
   * Highlight a carousel button for tutorial demonstrations
   * @param {string} regionName - Name of the region to highlight (prev-geometry, next-geometry, confirm, cancel)
   * @param {number} duration - Duration of highlight in ms
   */
  highlightButton(regionName, duration = 400) {
    // Store highlight info - will be rendered in _renderCarousel
    this._highlightRegion = regionName;
    this._highlightStart = performance.now();
    this._highlightDuration = duration;
    this._renderScreen();

    // Clear highlight after duration
    setTimeout(() => {
      if (this._highlightRegion === regionName) {
        this._highlightRegion = null;
        this._renderScreen();
      }
    }, duration);
  }

  /**
   * Get the screen bounds of the phone screen by projecting its 3D bounding box
   * @param {THREE.Camera} emitterCamera - The emitter's camera
   * @returns {Object|null} - { left, right, top, bottom } in screen pixels, or null
   */
  getScreenBounds(emitterCamera) {
    if (!this.mesh || !emitterCamera || !this.renderer) return null;

    // Update matrices
    this.mesh.updateMatrixWorld(true);
    emitterCamera.updateMatrixWorld();
    emitterCamera.updateProjectionMatrix();

    // Compute world-space bounding box of the phone mesh
    const box = new THREE.Box3().setFromObject(this.mesh);

    // Get all 8 corners of the bounding box
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z)
    ];

    // Get renderer size
    const rect = this.renderer.domElement.getBoundingClientRect();

    // Project each corner to screen space
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const corner of corners) {
      const projected = corner.clone().project(emitterCamera);

      // Only consider points in front of camera
      if (projected.z < 1) {
        // Convert from NDC (-1 to 1) to screen pixels
        const screenX = (projected.x + 1) / 2 * rect.width + rect.left;
        const screenY = (-projected.y + 1) / 2 * rect.height + rect.top;

        minX = Math.min(minX, screenX);
        maxX = Math.max(maxX, screenX);
        minY = Math.min(minY, screenY);
        maxY = Math.max(maxY, screenY);
      }
    }

    if (minX === Infinity) return null;

    // The bounding box includes the phone frame, but we want just the screen
    // The screen is roughly 85% of the phone width and centered
    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;
    const screenWidthRatio = 0.85;
    const screenHeightRatio = 0.70;

    const screenWidth = boxWidth * screenWidthRatio;
    const screenHeight = boxHeight * screenHeightRatio;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return {
      left: centerX - screenWidth / 2,
      right: centerX + screenWidth / 2,
      top: centerY - screenHeight / 2,
      bottom: centerY + screenHeight / 2,
      centerX,
      centerY,
      width: screenWidth,
      height: screenHeight
    };
  }

  /**
   * Raycast from screen coordinates to phone mesh and return canvas coordinates
   * @param {number} clientX - Screen X coordinate
   * @param {number} clientY - Screen Y coordinate
   * @param {THREE.Camera} emitterCamera - The emitter's camera (phone is in emitter scene)
   * @returns {Object|null} - { canvasX, canvasY, onScreen } or null if no hit
   */
  raycastToCanvas(clientX, clientY, emitterCamera) {
    if (!this.mesh || !emitterCamera) {
      console.log('raycastToCanvas: missing mesh or camera', { mesh: !!this.mesh, camera: !!emitterCamera });
      return null;
    }

    // Convert screen coords to normalized device coordinates (-1 to +1)
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    // Update camera matrices before raycasting
    emitterCamera.updateMatrixWorld();
    emitterCamera.updateProjectionMatrix();

    this._raycaster.setFromCamera(this._pointer, emitterCamera);

    // Get all meshes from phone model
    const meshes = [];
    this.mesh.traverse((child) => {
      if (child.isMesh) meshes.push(child);
    });

    const intersects = this._raycaster.intersectObjects(meshes, false);

    if (intersects.length === 0) {
      return null;
    }

    const hit = intersects[0];

    // Get UV coordinates at hit point
    if (!hit.uv) {
      console.log('raycastToCanvas: hit but no UV coords');
      return null;
    }

    const uv = hit.uv;

    // Check if UV is within screen region
    if (uv.x < this._uvMin.x || uv.x > this._uvMax.x ||
        uv.y < this._uvMin.y || uv.y > this._uvMax.y) {
      return { canvasX: 0, canvasY: 0, onScreen: false };
    }

    // Map UV to screen coordinates (accounting for 90° rotation in shader)
    // The shader does: screenUV.x = 1.0 - screenUV.y; screenUV.y = 1.0 - temp;
    // We need to reverse this transformation
    const normalizedU = (uv.x - this._uvMin.x) / (this._uvMax.x - this._uvMin.x);
    const normalizedV = (uv.y - this._uvMin.y) / (this._uvMax.y - this._uvMin.y);

    // Reverse the shader's rotation to get canvas coordinates from UV
    // The shader samples texture at (1-v, 1-u), but the raycasted UV is in
    // mesh UV space, not screen space. Testing shows:
    // - canvasX = (1 - normalizedV) * width  (correct)
    // - canvasY = normalizedU * height (NOT inverted - mesh UV.x maps directly to canvas Y)
    const canvasX = (1 - normalizedV) * this.options.screenWidth;
    const canvasY = normalizedU * this.options.screenHeight;

    return {
      canvasX: Math.max(0, Math.min(this.options.screenWidth, canvasX)),
      canvasY: Math.max(0, Math.min(this.options.screenHeight, canvasY)),
      onScreen: true
    };
  }

  /**
   * Draw carousel state - geometry selector on phone screen
   * SPLIT BRACKET LAYOUT (512x228)
   *
   * Left bracket [  : Top half = Cancel (✕), Bottom half = Prev (‹)
   * Right bracket ] : Top half = Confirm (✓), Bottom half = Next (›)
   * Center area: Variant controls (circles, pills, slider)
   *
   * Title floats holographically above emitter in DOM.
   */
  _drawCarouselState(ctx, w, h) {
    // Clear hit regions
    this._carouselHitRegions = [];

    if (!this._carouselData) return;

    const { geometries, currentIndex, currentVariantIndex, variants, phase } = this._carouselData;
    const currentGeom = geometries[currentIndex];
    if (!currentGeom) return;

    // Phone corner radius - matches the physical phone bezel curve
    const phoneCornerRadius = 28;

    // Bracket dimensions - wider for better touch targets
    const bracketWidth = 80;      // Width of each bracket zone
    const bracketLineWidth = 4;   // Thickness of bracket lines
    const bracketInset = 4;       // Minimal padding from edge (brackets hug corners)
    // 1/3 for action (cancel/confirm), 2/3 for navigation (prev/next)
    const actionHeight = h / 3;
    const navHeight = (h * 2) / 3;

    // === LEFT BRACKET [ ===
    // Top 1/3: Cancel (✕)
    // Bottom 2/3: Previous (‹)
    this._drawSplitBracket(ctx, bracketInset, 0, bracketWidth, h, 'left', bracketLineWidth, phoneCornerRadius);

    // Left bracket hit regions - full edge to edge
    this._carouselHitRegions.push({
      name: 'cancel',
      x: 0, y: 0, w: bracketWidth + bracketInset, h: actionHeight
    });
    this._carouselHitRegions.push({
      name: 'prev-geometry',
      x: 0, y: actionHeight, w: bracketWidth + bracketInset, h: navHeight
    });

    // === RIGHT BRACKET ] ===
    // Top 1/3: Confirm (✓)
    // Bottom 2/3: Next (›)
    this._drawSplitBracket(ctx, w - bracketInset - bracketWidth, 0, bracketWidth, h, 'right', bracketLineWidth, phoneCornerRadius);

    // Right bracket hit regions - full edge to edge
    this._carouselHitRegions.push({
      name: 'confirm',
      x: w - bracketWidth - bracketInset, y: 0, w: bracketWidth + bracketInset, h: actionHeight
    });
    this._carouselHitRegions.push({
      name: 'next-geometry',
      x: w - bracketWidth - bracketInset, y: actionHeight, w: bracketWidth + bracketInset, h: navHeight
    });

    // === CENTER AREA: Variants ===
    const centerX = bracketWidth + bracketInset + 4;
    const centerWidth = w - 2 * (bracketWidth + bracketInset + 4);

    // Check if this is an SSS geometry (colored circles) or text-based
    const isSSS = currentGeom.sss === true;
    const hasMoonPhase = currentGeom.id === 'moon' && variants && variants.length > 0;

    if (isSSS && variants && variants.length > 0) {
      this._drawSSSVariants(ctx, variants, currentVariantIndex, 0, h, w, centerX, centerWidth);
    } else if (hasMoonPhase) {
      this._drawMoonPhaseRow(ctx, variants, currentVariantIndex, phase, 0, h, w, centerX, centerWidth);
    } else if (variants && variants.length > 0) {
      this._drawTextVariants(ctx, variants, currentVariantIndex, 0, h, w, centerX, centerWidth);
    }

    // Draw button highlight for tutorial
    if (this._highlightRegion) {
      this._drawButtonHighlight(ctx, w, h, bracketWidth, bracketInset, actionHeight, navHeight);
    }
  }

  /**
   * Draw a highlight overlay on a button region for tutorial
   */
  _drawButtonHighlight(ctx, w, h, bracketWidth, bracketInset, actionHeight, navHeight) {
    const region = this._highlightRegion;
    let x, y, rw, rh;

    // Determine region bounds based on button name
    switch (region) {
      case 'cancel':
        x = 0; y = 0;
        rw = bracketWidth + bracketInset;
        rh = actionHeight;
        break;
      case 'prev-geometry':
        x = 0; y = actionHeight;
        rw = bracketWidth + bracketInset;
        rh = navHeight;
        break;
      case 'confirm':
        x = w - bracketWidth - bracketInset;
        y = 0;
        rw = bracketWidth + bracketInset;
        rh = actionHeight;
        break;
      case 'next-geometry':
        x = w - bracketWidth - bracketInset;
        y = actionHeight;
        rw = bracketWidth + bracketInset;
        rh = navHeight;
        break;
      default:
        return;
    }

    // Calculate fade based on elapsed time
    const elapsed = performance.now() - this._highlightStart;
    const progress = Math.min(elapsed / this._highlightDuration, 1);
    // Pulse: fade in then fade out
    const alpha = progress < 0.3
      ? progress / 0.3 * 0.4
      : 0.4 * (1 - (progress - 0.3) / 0.7);

    // Draw highlight glow
    ctx.fillStyle = `rgba(140, 180, 255, ${alpha})`;
    ctx.fillRect(x, y, rw, rh);

    // Draw inner glow ring
    ctx.strokeStyle = `rgba(180, 220, 255, ${alpha * 1.5})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 4, y + 4, rw - 8, rh - 8);
  }

  /**
   * Draw a split bracket with two functions
   * Top 1/3 has action icon (cancel/confirm), bottom 2/3 has navigation arrow
   * @param {string} side - 'left' or 'right'
   * @param {number} cornerRadius - radius to match phone bezel
   */
  _drawSplitBracket(ctx, x, y, width, height, side, lineWidth, cornerRadius = 32) {
    // 1/3 for action, 2/3 for navigation
    const actionHeight = height / 3;
    const navHeight = (height * 2) / 3;
    const splitY = actionHeight;

    // Insets from canvas edge to bracket line (following phone curve)
    const edgeInset = 4;
    const topInset = edgeInset;
    const bottomInset = edgeInset;

    // Colors
    const bracketGlow = 'rgba(64, 224, 208, 0.25)';
    const cancelColor = 'rgba(255, 100, 100, 0.8)';
    const confirmColor = 'rgba(80, 200, 120, 0.8)';
    const navColor = 'rgba(64, 224, 208, 0.9)';

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (side === 'left') {
      // Draw [ bracket shape - split at 1/3

      // Top 1/3 bracket (Cancel zone) - follows phone corner curve
      ctx.strokeStyle = cancelColor;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(x + width, topInset);
      ctx.lineTo(x + cornerRadius, topInset);
      ctx.quadraticCurveTo(x + edgeInset, topInset, x + edgeInset, topInset + cornerRadius);
      ctx.lineTo(x + edgeInset, splitY - 6);
      ctx.stroke();

      // Bottom 2/3 bracket (Prev zone)
      ctx.strokeStyle = navColor;
      ctx.beginPath();
      ctx.moveTo(x + edgeInset, splitY + 6);
      ctx.lineTo(x + edgeInset, height - bottomInset - cornerRadius);
      ctx.quadraticCurveTo(x + edgeInset, height - bottomInset, x + cornerRadius, height - bottomInset);
      ctx.lineTo(x + width, height - bottomInset);
      ctx.stroke();

      // Horizontal divider line (subtle)
      ctx.strokeStyle = bracketGlow;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + edgeInset, splitY);
      ctx.lineTo(x + width - 15, splitY);
      ctx.stroke();

      // Cancel icon (✕) in top 1/3
      const cancelCenterX = x + width / 2 + 4;
      const cancelCenterY = actionHeight / 2 + 2;
      ctx.fillStyle = '#ff6b6b';
      ctx.font = 'bold 28px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✕', cancelCenterX, cancelCenterY);

      // Prev arrow (‹) in bottom 2/3 - mirror the top icon position
      const prevCenterX = x + width / 2 + 4;
      const prevCenterY = height - actionHeight / 2 - 2;  // Mirror from bottom
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 56px Arial';
      ctx.fillText('‹', prevCenterX, prevCenterY);

    } else {
      // Draw ] bracket shape - split at 1/3

      // Top 1/3 bracket (Confirm zone) - follows phone corner curve
      ctx.strokeStyle = confirmColor;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(x, topInset);
      ctx.lineTo(x + width - cornerRadius, topInset);
      ctx.quadraticCurveTo(x + width - edgeInset, topInset, x + width - edgeInset, topInset + cornerRadius);
      ctx.lineTo(x + width - edgeInset, splitY - 6);
      ctx.stroke();

      // Bottom 2/3 bracket (Next zone)
      ctx.strokeStyle = navColor;
      ctx.beginPath();
      ctx.moveTo(x + width - edgeInset, splitY + 6);
      ctx.lineTo(x + width - edgeInset, height - bottomInset - cornerRadius);
      ctx.quadraticCurveTo(x + width - edgeInset, height - bottomInset, x + width - cornerRadius, height - bottomInset);
      ctx.lineTo(x, height - bottomInset);
      ctx.stroke();

      // Horizontal divider line (subtle)
      ctx.strokeStyle = bracketGlow;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 15, splitY);
      ctx.lineTo(x + width - edgeInset, splitY);
      ctx.stroke();

      // Confirm icon (✓) in top 1/3
      const confirmCenterX = x + width / 2 - 4;
      const confirmCenterY = actionHeight / 2 + 2;
      ctx.fillStyle = '#50c878';
      ctx.font = 'bold 28px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✓', confirmCenterX, confirmCenterY);

      // Next arrow (›) in bottom 2/3 - mirror the top icon position
      const nextCenterX = x + width / 2 - 4;
      const nextCenterY = height - actionHeight / 2 - 2;  // Mirror from bottom
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 56px Arial';
      ctx.fillText('›', nextCenterX, nextCenterY);
    }
  }

  /**
   * Draw SSS variant gradient slider - colored gemstone spectrum
   * Centered layout with proportional knob
   */
  _drawSSSVariants(ctx, variants, currentIdx, y, height, canvasWidth, centerX, centerWidth) {
    // Slider centered vertically, using most of horizontal space
    const sliderPadding = 8;
    const sliderX = centerX + sliderPadding;
    const sliderW = centerWidth - sliderPadding * 2;
    const sliderH = 14;  // Slim track
    const sliderY = y + height * 0.5;  // Center vertically
    const knobRadius = 18;  // Proportional knob

    // Create gradient from all variant colors
    const gradient = ctx.createLinearGradient(sliderX, 0, sliderX + sliderW, 0);
    variants.forEach((variant, i) => {
      const color = HoloPhone.SSS_COLORS[variant.preset] || HoloPhone.SSS_COLORS['default'];
      const stop = i / (variants.length - 1);
      gradient.addColorStop(stop, color);
    });

    // Draw gradient track with rounded ends
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(sliderX, sliderY - sliderH / 2, sliderW, sliderH, sliderH / 2);
    ctx.fill();

    // Track border - subtle white outline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Calculate knob position based on current selection
    const knobProgress = currentIdx / (variants.length - 1);
    const knobX = sliderX + knobProgress * sliderW;

    // Get current color
    const currentColor = HoloPhone.SSS_COLORS[variants[currentIdx]?.preset] || HoloPhone.SSS_COLORS['default'];

    // Knob glow
    ctx.shadowColor = currentColor;
    ctx.shadowBlur = 15;

    // Knob fill with current color
    ctx.fillStyle = currentColor;
    ctx.beginPath();
    ctx.arc(knobX, sliderY, knobRadius, 0, Math.PI * 2);
    ctx.fill();

    // Reset shadow
    ctx.shadowBlur = 0;

    // Knob 3D highlight
    const knobGradient = ctx.createRadialGradient(
      knobX - knobRadius * 0.3, sliderY - knobRadius * 0.3, 0,
      knobX, sliderY, knobRadius
    );
    knobGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    knobGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
    knobGradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    ctx.fillStyle = knobGradient;
    ctx.beginPath();
    ctx.arc(knobX, sliderY, knobRadius, 0, Math.PI * 2);
    ctx.fill();

    // Knob border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(knobX, sliderY, knobRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Hit region covers the center area for easy interaction
    this._carouselHitRegions.push({
      name: 'sss-slider',
      x: sliderX - knobRadius,
      y: sliderY - knobRadius - 15,
      w: sliderW + knobRadius * 2,
      h: knobRadius * 2 + 30,
      extra: { sliderX, sliderW, variantCount: variants.length }
    });
  }

  /**
   * Draw text-based variant pills - compact layout
   * Positioned at 38% height to stay clear of arrows
   */
  _drawTextVariants(ctx, variants, currentIdx, y, height, canvasWidth, centerX, centerWidth) {
    const pillHeight = 38;  // Smaller pills
    const pillPadding = 18;
    const spacing = 10;

    // Measure all pills
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    const pillWidths = variants.map(v => ctx.measureText(v.label || v.name).width + pillPadding * 2);
    const totalWidth = pillWidths.reduce((a, b) => a + b, 0) + (variants.length - 1) * spacing;
    let startX = centerX + (centerWidth - totalWidth) / 2;

    // Position pills at 38% height
    const pillY = y + height * 0.38 - pillHeight / 2;

    variants.forEach((variant, i) => {
      const pillW = pillWidths[i];
      const pillX = startX;
      const isActive = i === currentIdx;

      // Pill background
      ctx.fillStyle = isActive ? 'rgba(64, 224, 208, 0.6)' : 'rgba(64, 224, 208, 0.2)';
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillHeight, pillHeight / 2);
      ctx.fill();

      // Border
      if (isActive) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(64, 224, 208, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Text
      ctx.fillStyle = isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.85)';
      ctx.font = isActive ? 'bold 20px "Segoe UI", Arial, sans-serif' : '20px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(variant.label || variant.name, pillX + pillW / 2, pillY + pillHeight / 2);

      // Hit region - just around the pill
      this._carouselHitRegions.push({
        name: 'variant',
        x: pillX - spacing / 2,
        y: pillY - 10,
        w: pillW + spacing,
        h: pillHeight + 20,
        extra: { index: i }
      });

      startX += pillW + spacing;
    });
  }

  /**
   * Draw moon phase row with variant pills and phase slider
   * Compact layout: pills at 30% height, slider at 65% height
   */
  _drawMoonPhaseRow(ctx, variants, currentIdx, phase, y, height, canvasWidth, centerX, centerWidth) {
    const pillHeight = 40;  // Smaller pills
    const pillPadding = 16;
    const spacing = 10;
    const phaseVariantActive = variants[currentIdx]?.name === 'phase';

    // Pills positioned at 30% of height
    const pillY = y + height * 0.30 - pillHeight / 2;

    // Measure all pills
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    const pillWidths = variants.map(v => ctx.measureText(v.label || v.name).width + pillPadding * 2);
    const totalWidth = pillWidths.reduce((a, b) => a + b, 0) + (variants.length - 1) * spacing;
    let startX = centerX + (centerWidth - totalWidth) / 2;

    variants.forEach((variant, i) => {
      const label = variant.label || variant.name;
      const pillW = pillWidths[i];
      const pillX = startX;
      const isActive = i === currentIdx;

      // Pill background
      ctx.fillStyle = isActive ? 'rgba(64, 224, 208, 0.6)' : 'rgba(64, 224, 208, 0.2)';
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillHeight, pillHeight / 2);
      ctx.fill();

      if (isActive) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(64, 224, 208, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Text
      ctx.fillStyle = isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.85)';
      ctx.font = isActive ? 'bold 20px "Segoe UI", Arial, sans-serif' : '20px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, pillX + pillW / 2, pillY + pillHeight / 2);

      // Hit region for pills
      this._carouselHitRegions.push({
        name: 'variant',
        x: pillX - spacing / 2,
        y: pillY - 10,
        w: pillW + spacing,
        h: pillHeight + 20,
        extra: { index: i }
      });

      startX += pillW + spacing;
    });

    // Phase slider (only when Phase variant is active)
    if (phaseVariantActive && phase !== undefined) {
      const sliderPadding = 15;
      const sliderX = centerX + sliderPadding;
      const sliderW = centerWidth - sliderPadding * 2;
      const sliderY = y + height * 0.65;  // Position at 65% height
      const sliderH = 12;  // Slimmer track
      const knobRadius = 20;  // Smaller knob

      // Slider track
      ctx.fillStyle = 'rgba(64, 224, 208, 0.3)';
      ctx.beginPath();
      ctx.roundRect(sliderX, sliderY - sliderH / 2, sliderW, sliderH, sliderH / 2);
      ctx.fill();

      // Track border
      ctx.strokeStyle = 'rgba(64, 224, 208, 0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Slider fill
      const fillW = phase * sliderW;
      ctx.fillStyle = 'rgba(64, 224, 208, 0.8)';
      ctx.beginPath();
      ctx.roundRect(sliderX, sliderY - sliderH / 2, fillW, sliderH, sliderH / 2);
      ctx.fill();

      // Knob
      const knobX = sliderX + fillW;
      ctx.fillStyle = '#40e0d0';
      ctx.beginPath();
      ctx.arc(knobX, sliderY, knobRadius, 0, Math.PI * 2);
      ctx.fill();

      // Knob border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Knob highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(knobX - 3, sliderY - 3, knobRadius * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // Slider hit region
      this._carouselHitRegions.push({
        name: 'phase-slider',
        x: sliderX - knobRadius,
        y: sliderY - knobRadius - 10,
        w: sliderW + knobRadius * 2,
        h: knobRadius * 2 + 20,
        extra: { sliderX, sliderW }
      });
    }
  }

  /**
   * Draw alignment grid for UV calibration
   * Enable with ?phone-grid in URL
   */
  _drawAlignmentGrid(ctx, w, h) {
    // Bright magenta background for visibility
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0, 0, w, h);

    // Draw grid lines
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;

    // Vertical lines every 10%
    for (let i = 0; i <= 10; i++) {
      const x = (w * i) / 10;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Horizontal lines every 10%
    for (let i = 0; i <= 10; i++) {
      const y = (h * i) / 10;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Draw corner markers (cyan)
    ctx.fillStyle = '#00ffff';
    const cornerSize = 20;
    // Top-left
    ctx.fillRect(0, 0, cornerSize, cornerSize);
    // Top-right
    ctx.fillRect(w - cornerSize, 0, cornerSize, cornerSize);
    // Bottom-left
    ctx.fillRect(0, h - cornerSize, cornerSize, cornerSize);
    // Bottom-right
    ctx.fillRect(w - cornerSize, h - cornerSize, cornerSize, cornerSize);

    // Draw center crosshair (yellow)
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 4;
    const centerX = w / 2;
    const centerY = h / 2;
    // Horizontal
    ctx.beginPath();
    ctx.moveTo(centerX - 30, centerY);
    ctx.lineTo(centerX + 30, centerY);
    ctx.stroke();
    // Vertical
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 30);
    ctx.lineTo(centerX, centerY + 30);
    ctx.stroke();

    // Label corners
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('TL', 2, 2);
    ctx.textAlign = 'right';
    ctx.fillText('TR', w - 2, 2);
    ctx.textBaseline = 'bottom';
    ctx.fillText('BR', w - 2, h - 2);
    ctx.textAlign = 'left';
    ctx.fillText('BL', 2, h - 2);

    // Draw thick border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);

    // Update HTML overlay instead of drawing text on canvas (avoids rotation issues)
    this._updateGridOverlay();
  }

  /**
   * Create/update HTML overlay for grid controls (avoids shader rotation)
   */
  _updateGridOverlay() {
    let overlay = document.getElementById('phone-grid-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'phone-grid-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 10px;
        left: 10px;
        background: rgba(0,0,0,0.9);
        color: white;
        font-family: monospace;
        font-size: 14px;
        padding: 15px;
        border-radius: 8px;
        z-index: 10000;
        line-height: 1.6;
      `;
      document.body.appendChild(overlay);
    }

    const controls = [
      { key: 'minY', label: '1: Left', val: this._uvMin.y },
      { key: 'maxY', label: '2: Right', val: this._uvMax.y },
      { key: 'minX', label: '3: Top', val: this._uvMin.x },
      { key: 'maxX', label: '4: Bottom', val: this._uvMax.x }
    ];

    overlay.innerHTML = `
      <div style="color: #00ffff; font-weight: bold; margin-bottom: 8px;">Phone UV Calibration</div>
      <div style="margin-bottom: 8px;">↑↓: ±0.01 | ←→: ±0.001 | Shift: ×5</div>
      ${controls.map(c => {
        const active = this._activeControl === c.key;
        return `<div style="color: ${active ? '#ffff00' : '#ffffff'}">${c.label}: ${c.val.toFixed(3)}${active ? ' ◄' : ''}</div>`;
      }).join('')}
      <div style="color: #00ffff; margin-top: 8px;">C: copy values to console</div>
    `;
  }

  /**
   * Set up keyboard controls for grid calibration
   */
  _setupGridControls() {
    this._keyHandler = (e) => {
      if (!this._gridMode) return;

      // Up/Down = 0.01, Left/Right = 0.001, Shift = 5x multiplier
      const multiplier = e.shiftKey ? 5 : 1;
      const coarseStep = 0.01 * multiplier;
      const fineStep = 0.001 * multiplier;
      let changed = false;

      switch (e.key) {
        case '1': this._activeControl = 'minY'; changed = true; break;
        case '2': this._activeControl = 'maxY'; changed = true; break;
        case '3': this._activeControl = 'minX'; changed = true; break;
        case '4': this._activeControl = 'maxX'; changed = true; break;
        case 'ArrowDown':
          this._adjustUV(-coarseStep);
          changed = true;
          break;
        case 'ArrowUp':
          this._adjustUV(coarseStep);
          changed = true;
          break;
        case 'ArrowLeft':
          this._adjustUV(-fineStep);
          changed = true;
          break;
        case 'ArrowRight':
          this._adjustUV(fineStep);
          changed = true;
          break;
        case 'c':
        case 'C':
          const uvText = `this._uvMin = { x: ${this._uvMin.x.toFixed(3)}, y: ${this._uvMin.y.toFixed(3)} };\nthis._uvMax = { x: ${this._uvMax.x.toFixed(3)}, y: ${this._uvMax.y.toFixed(3)} };`;
          navigator.clipboard.writeText(uvText).then(() => {
            console.log('Copied to clipboard:\n' + uvText);
          }).catch(err => {
            console.log('Clipboard failed, values:\n' + uvText);
          });
          break;
      }

      if (changed) {
        this._updateShaderUV();
        this._renderScreen();
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', this._keyHandler);
    console.log('Grid controls active: 1-4 select edge, ↑↓ ±0.01, ←→ ±0.001, Shift ×5, C to copy');
  }

  /**
   * Adjust UV value for active control
   */
  _adjustUV(delta) {
    switch (this._activeControl) {
      case 'minX': this._uvMin.x += delta; break;
      case 'minY': this._uvMin.y += delta; break;
      case 'maxX': this._uvMax.x += delta; break;
      case 'maxY': this._uvMax.y += delta; break;
    }
  }

  /**
   * Update shader uniforms with current UV values
   */
  _updateShaderUV() {
    // Update the Vector2 references that the shader uses
    if (this._screenUVMin && this._screenUVMax) {
      this._screenUVMin.set(this._uvMin.x, this._uvMin.y);
      this._screenUVMax.set(this._uvMax.x, this._uvMax.y);
    }
    // Also update via shader reference if available (for onBeforeCompile materials)
    if (this._screenShader && this._screenShader.uniforms) {
      this._screenShader.uniforms.screenUVMin.value.set(this._uvMin.x, this._uvMin.y);
      this._screenShader.uniforms.screenUVMax.value.set(this._uvMax.x, this._uvMax.y);
    }
  }

  /**
   * Set environment map for PBR reflections (called by main after emitter loads)
   * @param {THREE.Texture} envMap - Environment map texture
   */
  setEnvironmentMap(envMap) {
    this._envMap = envMap;
    // Apply to existing materials if loaded
    if (this.mesh) {
      this.mesh.traverse((child) => {
        if (child.isMesh && child.material && child.material.envMap !== undefined) {
          child.material.envMap = envMap;
          child.material.envMapIntensity = 0.8;
          child.material.needsUpdate = true;
        }
      });
    }
  }

  /**
   * Load the phone model (GLB format with Draco compression)
   * Uses MeshPhysicalMaterial for realistic PBR rendering
   */
  async load() {
    return new Promise((resolve, reject) => {
      // Set up Draco decoder for compressed GLB
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

      const gltfLoader = new GLTFLoader();
      gltfLoader.setDRACOLoader(dracoLoader);

      gltfLoader.load(
        `${this.options.basePath}/phone.glb`,
        (gltf) => {
          this.mesh = gltf.scene;

          // Get the embedded texture from the GLB
          let diffuseTexture = null;
          this.mesh.traverse((child) => {
            if (child.isMesh && child.material && child.material.map) {
              diffuseTexture = child.material.map;
              diffuseTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
              diffuseTexture.colorSpace = THREE.SRGBColorSpace;
            }
          });

          // Log mesh names to help identify screen
          console.log('Phone meshes:');
          this.mesh.traverse((child) => {
            if (child.isMesh) {
              console.log('  -', child.name, 'geometry:', child.geometry.attributes.uv ? 'has UV' : 'no UV');
            }
          });

          // Store UV bounds for screen region
          this._screenUVMin = new THREE.Vector2(this._uvMin.x, this._uvMin.y);
          this._screenUVMax = new THREE.Vector2(this._uvMax.x, this._uvMax.y);

          // Create PBR material with screen overlay via onBeforeCompile
          // This gives us full PBR lighting (metalness, roughness, env reflections)
          // while still allowing custom screen content injection
          this.screenMaterial = new THREE.MeshPhysicalMaterial({
            map: diffuseTexture,
            // Matte metallic finish - avoids specular highlights on curved rims
            metalness: 0.6,
            roughness: 0.45,  // Much higher roughness to eliminate rim highlights
            envMap: this._envMap || null,
            envMapIntensity: 0.3,  // Very low env reflections
            // No clearcoat - it was causing the rim highlight
            clearcoat: 0.0,
            reflectivity: 0.5
          });

          // Inject custom shader code to blend screen content over the PBR result
          this.screenMaterial.onBeforeCompile = (shader) => {
            // Add custom uniforms
            shader.uniforms.screenTexture = { value: this.screenTexture };
            shader.uniforms.screenUVMin = { value: this._screenUVMin };
            shader.uniforms.screenUVMax = { value: this._screenUVMax };
            shader.uniforms.time = { value: 0.0 };

            // Add uniform declarations to fragment shader
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <common>',
              `#include <common>
uniform sampler2D screenTexture;
uniform vec2 screenUVMin;
uniform vec2 screenUVMax;
uniform float time;
`
            );

            // Replace the final output to blend screen content
            // Insert BEFORE dithering but AFTER all PBR calculations
            // Use vMapUv which is the transformed UV from the map
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <dithering_fragment>',
              `
{
  // Use vMapUv (transformed UV from diffuse map)
  vec2 mapUV = vMapUv;

  // Check if we're in the screen UV region
  bool inScreen = mapUV.x >= screenUVMin.x && mapUV.x <= screenUVMax.x &&
                  mapUV.y >= screenUVMin.y && mapUV.y <= screenUVMax.y;

  if (inScreen) {
    // Map phone UV to screen texture UV (0-1 range)
    vec2 screenUV = (mapUV - screenUVMin) / (screenUVMax - screenUVMin);
    // Rotate 90 degrees CW for landscape display and flip to correct mirror
    float rotTemp = screenUV.x;
    screenUV.x = 1.0 - screenUV.y;
    screenUV.y = 1.0 - rotTemp;
    vec4 screenColor = texture(screenTexture, screenUV);

    // === OLED EMISSIVE SCREEN ===
    // Calculate luminance for adaptive bloom
    float luminance = dot(screenColor.rgb, vec3(0.299, 0.587, 0.114));
    // Brighter pixels glow more (OLED characteristic)
    float glowIntensity = 1.0 + luminance * 0.4;
    vec3 screenEmission = screenColor.rgb * glowIntensity;

    // === FRESNEL GLASS REFLECTIONS ===
    // Stronger reflections at grazing angles (like real glass)
    vec3 viewDir = normalize(vViewPosition);
    vec3 normalDir = normalize(vNormal);
    float fresnel = pow(1.0 - abs(dot(viewDir, normalDir)), 3.0);
    // Glass reflection from environment/PBR - stronger at edges
    float reflectionStrength = 0.03 + fresnel * 0.15;
    vec3 glassReflection = gl_FragColor.rgb * reflectionStrength;

    // === SCREEN EDGE VIGNETTE ===
    // Subtle darkening at screen edges (bezel shadow, viewing angle)
    vec2 edgeDist = abs(screenUV - 0.5) * 2.0;  // 0 at center, 1 at edges
    float cornerDist = length(edgeDist);
    float vignette = 1.0 - smoothstep(0.7, 1.4, cornerDist) * 0.25;

    // === SUBTLE SCAN LINES (optional OLED texture) ===
    // Very subtle horizontal lines for screen texture
    float scanline = 1.0 - sin(screenUV.y * 400.0) * 0.015;

    // === COMBINE ALL EFFECTS ===
    vec3 finalScreen = screenEmission * vignette * scanline + glassReflection;

    // Add very subtle color shift at extreme angles (IPS-like glow)
    float angleShift = fresnel * 0.05;
    finalScreen += vec3(angleShift * 0.5, angleShift * 0.3, angleShift);

    gl_FragColor = vec4(finalScreen, 1.0);
  }
}
#include <dithering_fragment>
`
            );

            // Store shader reference for uniform updates
            this._screenShader = shader;
          };

          // Apply PBR material to all meshes
          this.mesh.traverse((child) => {
            if (child.isMesh) {
              child.material = this.screenMaterial;
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          // Apply transforms - landscape orientation, leaning against emitter
          this.mesh.scale.setScalar(this.options.scale);
          this.mesh.position.set(
            this.options.position.x,
            this.options.position.y,
            this.options.position.z
          );
          this.mesh.rotation.set(
            this.options.rotation.x,
            this.options.rotation.y,
            this.options.rotation.z
          );

          // Add to scene
          this.scene.add(this.mesh);

          console.log('HoloPhone loaded with PBR materials');
          resolve(this.mesh);
        },
        // Progress
        (xhr) => {
          if (xhr.lengthComputable) {
            const progress = (xhr.loaded / xhr.total * 100).toFixed(0);
            console.log(`Loading phone: ${progress}%`);
          }
        },
        // Error
        (error) => {
          console.error('Error loading phone GLB:', error);
          reject(error);
        }
      );
    });
  }

  /**
   * Set the screen text
   * @param {string} text - Text to display
   */
  setText(text) {
    if (this._gridMode) return;
    this._screenText = text;
    this._renderScreen();
  }

  /**
   * Set the screen state
   * @param {string} state - idle, listening, processing, or speaking
   */
  setState(state) {
    if (this._gridMode) return;
    this._screenState = state;
    if (state !== 'speaking') {
      this._progress = 0;  // Reset progress when leaving speaking state
    }
    this._renderScreen();
  }

  /**
   * Set the TTS progress (0-1)
   * @param {number} progress - Progress value 0 to 1
   */
  setProgress(progress) {
    this._progress = Math.max(0, Math.min(1, progress));
    if (this._screenState === 'speaking') {
      this._renderScreen();
    }
  }

  /**
   * Update animation frame (call each render)
   */
  update(deltaTime) {
    if (this._gridMode) return;
    this._animationFrame++;

    // Update shader time uniform for animated effects
    if (this._screenShader && this._screenShader.uniforms.time) {
      this._screenShader.uniforms.time.value += deltaTime;
    }

    // Only re-render screen for animated states
    if (this._screenState !== 'idle' || this._animationFrame % 10 === 0) {
      this._renderScreen();
    }
  }

  /**
   * Set position
   */
  setPosition(x, y, z) {
    if (this.mesh) {
      this.mesh.position.set(x, y, z);
    }
  }

  /**
   * Set scale
   */
  setScale(scale) {
    if (this.mesh) {
      this.mesh.scale.setScalar(scale);
    }
  }

  /**
   * Set rotation
   */
  setRotation(x, y, z) {
    if (this.mesh) {
      this.mesh.rotation.set(x, y, z);
    }
  }

  /**
   * Set visibility
   */
  setVisible(visible) {
    if (this.mesh) {
      this.mesh.visible = visible;
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    // Remove keyboard handler if in grid mode
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }

    if (this.mesh && this.scene) {
      this.scene.remove(this.mesh);
      this.mesh.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        }
      });
      this.mesh = null;
    }

    if (this.screenTexture) {
      this.screenTexture.dispose();
      this.screenTexture = null;
    }

    this.screenCanvas = null;
    this.screenContext = null;
  }
}

export default HoloPhone;
