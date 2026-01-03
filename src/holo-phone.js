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
    this._screenState = 'idle';  // idle, listening, processing, speaking, carousel, meditation, panel, music
    this._animationFrame = 0;
    this._progress = 0;  // TTS progress 0-1

    // Music playback state
    this._musicData = null;  // { trackName, isPlaying, currentTime, duration }

    // Button press flash state - tracks which button is currently pressed
    this._pressedButton = null;  // 'cancel', 'confirm', 'prev-geometry', 'next-geometry'
    this._pressStart = 0;
    this._pressDuration = 200;  // ms for flash animation

    // Meditation state
    this._meditationData = null;  // { phase, timer, cycle, maxCycles }

    // Logo image for idle state
    this._logoImage = null;
    this._loadLogoImage();

    // Carousel state
    this._carouselData = null;  // { geometries, currentIndex, currentVariantIndex, variants, phase }
    this._carouselHitRegions = [];  // { name, x, y, w, h, extra? }[]

    // Panel state (for menu panels like Effects, Music, etc.)
    this._panelData = null;  // { id, title, render, hitRegions }

    // Side menu open state (for hamburger/close icon toggle)
    this._menuOpen = false;

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
   * Load the Emotive Engine full logotype SVG for idle state display
   * Using Eye Tea Green version (#84CFC5)
   */
  _loadLogoImage() {
    const img = new Image();
    img.onload = () => {
      this._logoImage = img;
      // Re-render if we're in idle state
      if (this._screenState === 'idle') {
        this._renderScreen();
      }
    };
    img.src = './assets/emotive-engine-full-teal.svg';
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
      case 'panel':
        this._drawPanelState(ctx, w, h);
        break;
      case 'music':
        this._drawMusicState(ctx, w, h);
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
   * Draw idle state - "Hold to speak" prompt with Emotive Engine full logotype
   * Uses Poppins font with teal glow (Eye Tea Green #84CFC5)
   */
  _drawIdleState(ctx, w, h) {
    // Clear hit regions for idle state
    this._carouselHitRegions = [];

    // Draw Emotive Engine full logotype with pulsing glow
    const time = performance.now() / 1000;
    const pulse = Math.sin(time * 1.57) * 0.5 + 0.5;  // ~4 second breathing cycle

    // Calculate logo dimensions first to position text relative to it
    let logoHeight = 0;
    if (this._logoImage) {
      // Full logotype is 920x316, scale to fit nicely
      const aspectRatio = this._logoImage.width / this._logoImage.height;
      const logoWidth = w * 0.55;  // 55% of canvas width
      logoHeight = logoWidth / aspectRatio;

      // Center the combined text + logo vertically
      // Total height = text (~24px) + gap (12px) + logoHeight
      const totalHeight = 24 + 12 + logoHeight;
      const startY = (h - totalHeight) / 2;

      const logoX = (w - logoWidth) / 2;
      const logoY = startY + 24 + 12;  // Below text + gap

      // Draw Eye Tea Green logotype with matching glow
      ctx.globalAlpha = 0.6 + pulse * 0.4;  // 0.6 to 1.0 alpha
      ctx.shadowColor = `rgba(132, 207, 197, ${0.5 + pulse * 0.5})`;  // Eye Tea Green glow
      ctx.shadowBlur = 8 + pulse * 12;
      ctx.drawImage(this._logoImage, logoX, logoY, logoWidth, logoHeight);

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // Text positioned above logo, centered in the layout
      ctx.shadowColor = 'rgba(132, 207, 197, 0.6)';
      ctx.shadowBlur = 15;
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 24px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this._screenText, w / 2, startY + 12);
      ctx.shadowBlur = 0;
    } else {
      // Fallback if logo not loaded - just show text centered
      ctx.shadowColor = 'rgba(132, 207, 197, 0.6)';
      ctx.shadowBlur = 15;
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 24px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this._screenText, w / 2, h / 2);
      ctx.shadowBlur = 0;
    }

    // Draw hamburger menu button in top-right corner
    this._drawHamburgerButton(ctx, w, h, pulse);
  }

  /**
   * Draw hamburger menu button on idle screen
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   * @param {number} pulse - Current pulse animation value (0-1)
   */
  _drawHamburgerButton(ctx, w, h, pulse) {
    const buttonSize = 60;
    const padding = 12;
    const buttonX = w - buttonSize - padding;
    const buttonY = padding;
    const centerX = buttonX + buttonSize / 2;
    const centerY = buttonY + buttonSize / 2;

    // Check if button is pressed
    const isPressed = this._pressedButton === 'hamburger';
    const pressProgress = isPressed
      ? Math.min((performance.now() - this._pressStart) / this._pressDuration, 1)
      : 0;
    const flashIntensity = pressProgress < 0.3
      ? pressProgress / 0.3
      : 1 - (pressProgress - 0.3) / 0.7;

    // Button background with subtle glow
    const baseAlpha = 0.15 + pulse * 0.1;
    const glowAlpha = isPressed ? 0.4 + flashIntensity * 0.3 : 0.2 + pulse * 0.15;

    ctx.beginPath();
    ctx.arc(centerX, centerY, buttonSize / 2, 0, Math.PI * 2);

    // Glow effect
    ctx.shadowColor = `rgba(132, 207, 197, ${glowAlpha})`;
    ctx.shadowBlur = isPressed ? 15 + flashIntensity * 10 : 8 + pulse * 6;

    // Background
    ctx.fillStyle = isPressed
      ? `rgba(132, 207, 197, ${0.25 + flashIntensity * 0.15})`
      : `rgba(132, 207, 197, ${baseAlpha})`;
    ctx.fill();

    // Border
    ctx.strokeStyle = isPressed
      ? `rgba(132, 207, 197, ${0.8 + flashIntensity * 0.2})`
      : `rgba(132, 207, 197, ${0.4 + pulse * 0.2})`;
    ctx.lineWidth = isPressed ? 2.5 : 2;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Draw hamburger icon (3 horizontal lines)
    const lineWidth = 26;
    const lineHeight = 3.5;
    const lineGap = 8;
    const iconStartY = centerY - lineGap - lineHeight / 2;

    ctx.fillStyle = isPressed
      ? `rgba(255, 255, 255, ${0.9 + flashIntensity * 0.1})`
      : `rgba(255, 255, 255, ${0.7 + pulse * 0.2})`;

    if (this._menuOpen) {
      // Draw close (X) icon when menu is open
      const xSize = 22;
      const xLineWidth = 4;

      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = xLineWidth;
      ctx.lineCap = 'round';

      // First diagonal (\)
      ctx.beginPath();
      ctx.moveTo(centerX - xSize / 2, centerY - xSize / 2);
      ctx.lineTo(centerX + xSize / 2, centerY + xSize / 2);
      ctx.stroke();

      // Second diagonal (/)
      ctx.beginPath();
      ctx.moveTo(centerX + xSize / 2, centerY - xSize / 2);
      ctx.lineTo(centerX - xSize / 2, centerY + xSize / 2);
      ctx.stroke();
    } else {
      // Draw hamburger icon (3 horizontal lines) when menu is closed
      // Top line
      ctx.beginPath();
      ctx.roundRect(centerX - lineWidth / 2, iconStartY, lineWidth, lineHeight, lineHeight / 2);
      ctx.fill();

      // Middle line
      ctx.beginPath();
      ctx.roundRect(centerX - lineWidth / 2, iconStartY + lineGap, lineWidth, lineHeight, lineHeight / 2);
      ctx.fill();

      // Bottom line
      ctx.beginPath();
      ctx.roundRect(centerX - lineWidth / 2, iconStartY + lineGap * 2, lineWidth, lineHeight, lineHeight / 2);
      ctx.fill();
    }

    // Add hit region for hamburger button
    this._carouselHitRegions.push({
      name: 'hamburger',
      x: buttonX - 5,
      y: buttonY - 5,
      w: buttonSize + 10,
      h: buttonSize + 10
    });
  }

  /**
   * Draw music playback state - track name, play/pause, prev/next controls
   * Uses Eye Tea Green (#84CFC5) for accent color
   */
  _drawMusicState(ctx, w, h) {
    // Clear hit regions
    this._carouselHitRegions = [];

    const time = performance.now() / 1000;
    const pulse = Math.sin(time * 2) * 0.5 + 0.5;  // Faster pulse for music

    // Get music data
    const data = this._musicData || {};
    const trackName = data.trackName || 'Unknown Track';
    const isPlaying = data.isPlaying !== false;
    const currentTime = data.currentTime || 0;
    const duration = data.duration || '0:00';

    // Format current time as MM:SS
    const mins = Math.floor(currentTime / 60);
    const secs = Math.floor(currentTime % 60);
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')} / ${duration}`;

    // === LAYOUT ===
    // Track name at top, controls in middle, time at bottom
    const accentColor = '#84CFC5';
    const accentRGB = '132, 207, 197';

    // Draw Emotive Engine logo (smaller, top-left area)
    if (this._logoImage) {
      const logoWidth = 120;
      const logoHeight = logoWidth / (this._logoImage.width / this._logoImage.height);
      ctx.globalAlpha = 0.4;
      ctx.drawImage(this._logoImage, 20, 15, logoWidth, logoHeight);
      ctx.globalAlpha = 1;
    }

    // Track name with glow
    ctx.shadowColor = `rgba(${accentRGB}, 0.7)`;
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 22px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(trackName, w / 2, 45);
    ctx.shadowBlur = 0;

    // === PLAYBACK CONTROLS ===
    const controlY = h / 2 + 5;
    const buttonRadius = 28;
    const smallButtonRadius = 22;
    const buttonSpacing = 70;

    // Previous button (left)
    const prevX = w / 2 - buttonSpacing;
    this._drawMusicButton(ctx, prevX, controlY, smallButtonRadius, '⏮', 'music-prev', pulse, accentColor, accentRGB);

    // Play/Pause button (center, larger)
    const playX = w / 2;
    const playIcon = isPlaying ? '⏸' : '▶';
    this._drawMusicButton(ctx, playX, controlY, buttonRadius, playIcon, 'music-play', pulse, accentColor, accentRGB, isPlaying);

    // Next button (right)
    const nextX = w / 2 + buttonSpacing;
    this._drawMusicButton(ctx, nextX, controlY, smallButtonRadius, '⏭', 'music-next', pulse, accentColor, accentRGB);

    // Time display
    ctx.shadowColor = `rgba(${accentRGB}, 0.5)`;
    ctx.shadowBlur = 8;
    ctx.fillStyle = accentColor;
    ctx.font = '400 16px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(timeStr, w / 2, h - 35);
    ctx.shadowBlur = 0;

    // === HAMBURGER MENU BUTTON (top-right) ===
    this._drawHamburgerButton(ctx, w, h, pulse);
  }

  /**
   * Draw a circular music control button
   */
  _drawMusicButton(ctx, x, y, radius, icon, hitName, pulse, accentColor, accentRGB, isActive = false) {
    // Check if button is pressed
    const isPressed = this._pressedButton === hitName;
    const pressProgress = isPressed
      ? Math.min((performance.now() - this._pressStart) / this._pressDuration, 1)
      : 0;
    const flashIntensity = pressProgress < 0.3
      ? pressProgress / 0.3
      : 1 - (pressProgress - 0.3) / 0.7;

    // Button circle
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);

    // Glow effect
    const glowAlpha = isPressed ? 0.6 + flashIntensity * 0.3 : (isActive ? 0.4 : 0.2) + pulse * 0.1;
    ctx.shadowColor = `rgba(${accentRGB}, ${glowAlpha})`;
    ctx.shadowBlur = isPressed ? 15 + flashIntensity * 10 : (isActive ? 12 : 8) + pulse * 4;

    // Background
    const bgAlpha = isPressed ? 0.3 + flashIntensity * 0.2 : (isActive ? 0.25 : 0.1) + pulse * 0.05;
    ctx.fillStyle = `rgba(${accentRGB}, ${bgAlpha})`;
    ctx.fill();

    // Border
    const borderAlpha = isPressed ? 0.9 : (isActive ? 0.8 : 0.5) + pulse * 0.1;
    ctx.strokeStyle = `rgba(${accentRGB}, ${borderAlpha})`;
    ctx.lineWidth = isActive ? 2.5 : 2;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Icon
    ctx.fillStyle = isPressed ? '#ffffff' : (isActive ? '#ffffff' : `rgba(255, 255, 255, 0.9)`);
    ctx.font = `${radius * 0.7}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, x, y);

    // Hit region
    this._carouselHitRegions.push({
      name: hitName,
      x: x - radius - 5,
      y: y - radius - 5,
      w: radius * 2 + 10,
      h: radius * 2 + 10
    });
  }

  /**
   * Draw listening state - animated waveform with Supple Blue glow and cancel bracket
   * Uses Supple Blue (#32ACE2) to indicate active input state
   */
  _drawListeningState(ctx, w, h) {
    // Clear hit regions and draw cancel bracket
    this._speakingHitRegions = [];
    this._drawCancelBracket(ctx, w, h);

    // Content area starts after bracket
    const bracketWidth = 80;
    const bracketInset = 4;
    const contentStartX = bracketWidth + bracketInset + 20;
    const contentWidth = w - contentStartX - 20;
    const contentCenterX = contentStartX + contentWidth / 2;

    // Text with blue glow
    ctx.shadowColor = 'rgba(50, 172, 226, 0.7)';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#ffffff';
    ctx.font = '400 24px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Listening...', contentCenterX, h / 2 - 40);
    ctx.shadowBlur = 0;

    // Animated waveform bars with Supple Blue glow
    const barCount = 7;
    const barWidth = 14;
    const barSpacing = 22;
    const startX = contentCenterX - (barCount * barSpacing) / 2;

    for (let i = 0; i < barCount; i++) {
      const phase = this._animationFrame * 0.15 + i * 0.8;
      const height = 20 + Math.sin(phase) * 25 + Math.sin(phase * 1.5) * 15;
      const x = startX + i * barSpacing;
      const y = h / 2 + 20 - height / 2;

      // Bar with Supple Blue glow
      ctx.shadowColor = 'rgba(50, 172, 226, 0.8)';
      ctx.shadowBlur = 8 + Math.sin(phase) * 4;
      ctx.fillStyle = `rgba(50, 172, 226, ${0.7 + Math.sin(phase) * 0.3})`;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, height, barWidth / 3);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  /**
   * Draw processing state - spinning indicator with cancel bracket
   * Uses Smooth Azure (#4090CE) to indicate work in progress
   */
  _drawProcessingState(ctx, w, h) {
    // Clear hit regions for processing state (reuse speaking hit regions)
    this._speakingHitRegions = [];

    // Draw cancel bracket (left side, full height)
    this._drawCancelBracket(ctx, w, h);

    // Content area starts after bracket
    const bracketWidth = 80;
    const bracketInset = 4;
    const contentStartX = bracketWidth + bracketInset + 20;
    const contentWidth = w - contentStartX - 20;
    const contentCenterX = contentStartX + contentWidth / 2;

    // Text with Smooth Azure glow
    ctx.shadowColor = 'rgba(64, 144, 206, 0.7)';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#ffffff';
    ctx.font = '400 24px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Processing...', contentCenterX, h / 2 - 30);
    ctx.shadowBlur = 0;

    // Spinning dots with Smooth Azure glow
    const dotCount = 8;
    const radius = 25;
    const centerX = contentCenterX;
    const centerY = h / 2 + 30;

    for (let i = 0; i < dotCount; i++) {
      const angle = (i / dotCount) * Math.PI * 2 + this._animationFrame * 0.1;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      const alpha = (Math.sin(angle - this._animationFrame * 0.1) + 1) / 2;

      ctx.shadowColor = 'rgba(64, 144, 206, 0.8)';
      ctx.shadowBlur = 6 + alpha * 8;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(64, 144, 206, ${0.4 + alpha * 0.6})`;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  /**
   * Draw unified cancel bracket on left side - matches carousel bracket style
   * Uses Magenta Majesty (#DD4A9A) for attention-grabbing cancel action
   * Full-height left bracket with cancel icon centered
   */
  _drawCancelBracket(ctx, w, h) {
    const bracketWidth = 80;
    const bracketLineWidth = 4;
    const bracketInset = 4;
    const phoneCornerRadius = 28;
    const edgeInset = 4;

    // Check for pressed button - same flash calculation as carousel
    const cancelPressed = this._pressedButton === 'cancel';
    const pressProgress = cancelPressed
      ? Math.min((performance.now() - this._pressStart) / this._pressDuration, 1)
      : 0;
    // Flash fades out over time
    const flashIntensity = pressProgress < 0.3
      ? pressProgress / 0.3
      : 1 - (pressProgress - 0.3) / 0.7;

    // Colors - bright flash when pressed
    const magentaFlash = `rgba(221, 74, 154, ${0.9 + flashIntensity * 0.1})`;
    const cancelColor = cancelPressed ? magentaFlash : 'rgba(221, 74, 154, 0.8)';

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw full-height left bracket [
    ctx.strokeStyle = cancelColor;
    ctx.lineWidth = cancelPressed ? bracketLineWidth + 2 : bracketLineWidth;
    if (cancelPressed) {
      ctx.shadowColor = '#DD4A9A';
      ctx.shadowBlur = 20 * flashIntensity;
    }
    ctx.beginPath();
    ctx.moveTo(bracketInset + bracketWidth, edgeInset);
    ctx.lineTo(bracketInset + phoneCornerRadius, edgeInset);
    ctx.quadraticCurveTo(bracketInset + edgeInset, edgeInset, bracketInset + edgeInset, edgeInset + phoneCornerRadius);
    ctx.lineTo(bracketInset + edgeInset, h - edgeInset - phoneCornerRadius);
    ctx.quadraticCurveTo(bracketInset + edgeInset, h - edgeInset, bracketInset + phoneCornerRadius, h - edgeInset);
    ctx.lineTo(bracketInset + bracketWidth, h - edgeInset);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Cancel icon (✕) centered in bracket - with strong flash effect
    const cancelCenterX = bracketInset + bracketWidth / 2 + 4;
    const cancelCenterY = h / 2;
    ctx.fillStyle = cancelPressed ? `rgba(255, 150, 200, ${0.8 + flashIntensity * 0.2})` : '#DD4A9A';
    if (cancelPressed) {
      ctx.shadowColor = '#FF69B4';
      ctx.shadowBlur = 25 * flashIntensity;
    }
    ctx.font = '700 26px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', cancelCenterX, cancelCenterY);
    ctx.shadowBlur = 0;

    // Hit region for cancel - full height bracket area
    this._speakingHitRegions.push({
      name: 'cancel',
      x: 0,
      y: 0,
      w: bracketWidth + bracketInset,
      h: h
    });
  }

  /**
   * Draw speaking state - text with animated indicator and cancel bracket
   */
  _drawSpeakingState(ctx, w, h) {
    // Clear hit regions for speaking state
    this._speakingHitRegions = [];

    // Draw cancel bracket (left side, full height)
    this._drawCancelBracket(ctx, w, h);

    // Content area starts after bracket
    const bracketWidth = 80;
    const bracketInset = 4;
    const contentStartX = bracketWidth + bracketInset + 20;
    const contentWidth = w - contentStartX - 20;
    const contentCenterX = contentStartX + contentWidth / 2;

    // Draw text - clean white with subtle teal glow
    ctx.fillStyle = '#ffffff';
    ctx.font = '400 26px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(132, 207, 197, 0.5)';
    ctx.shadowBlur = 15;

    // Wrap text if needed
    const words = this._screenText.split(' ');
    let lines = [];
    let currentLine = '';
    const maxWidth = contentWidth - 20;

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

    // Draw lines centered in content area
    const lineHeight = 32;
    const startY = h / 2 - (lines.length * lineHeight) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, contentCenterX, startY + i * lineHeight);
    });

    // Reset shadow for other elements
    ctx.shadowBlur = 0;

    // Progress bar at bottom - teal theme (in content area)
    const barY = h - 35;
    const barWidth = contentWidth - 20;
    const barHeight = 4;
    const barX = contentStartX + 10;

    // Background track - subtle gray
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 2);
    ctx.fill();

    // Filled progress with teal glow
    if (this._progress > 0) {
      ctx.shadowColor = 'rgba(132, 207, 197, 0.9)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#84CFC5';
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
   * Layout: Cancel bracket on left, phase/timer in content area, progress dots at bottom
   * Uses Poppins font and teal accents
   */
  _drawMeditationState(ctx, w, h) {
    // Draw cancel bracket (left side, full height)
    this._speakingHitRegions = [];
    this._drawCancelBracket(ctx, w, h);

    // Content area starts after bracket
    const bracketWidth = 80;
    const bracketInset = 4;
    const contentStartX = bracketWidth + bracketInset + 20;
    const contentWidth = w - contentStartX - 20;
    const contentCenterX = contentStartX + contentWidth / 2;

    const data = this._meditationData;
    const phase = data?.phase || this._screenText || 'Breathe';
    const timer = data?.timer ?? '';
    const cycle = data?.cycle ?? 0;
    const maxCycles = data?.maxCycles ?? 5;

    // Split layout: Phase instruction on left of content, Timer on right
    if (timer !== '') {
      // Left side of content: Phase instruction - large, left-justified
      ctx.fillStyle = '#ffffff';
      ctx.font = '400 36px Poppins, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(phase, contentStartX, h / 2);

      // Right side: Large timer number with subtle teal glow
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 80px Montserrat, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(132, 207, 197, 0.4)';
      ctx.shadowBlur = 25;
      ctx.fillText(String(timer), w - 30, h / 2);
      ctx.shadowBlur = 0;
    } else {
      // No timer - show message centered in content area (intro/outro/affirmations)
      ctx.fillStyle = '#ffffff';
      ctx.font = '400 26px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(132, 207, 197, 0.4)';
      ctx.shadowBlur = 15;

      // Wrap text if needed
      const words = this._screenText.split(' ');
      let lines = [];
      let currentLine = '';
      const maxTextWidth = contentWidth - 20;

      for (const word of words) {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxTextWidth && currentLine) {
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
        ctx.fillText(line, contentCenterX, textStartY + i * lineHeight);
      });

      ctx.shadowBlur = 0;
    }

    // Progress dots at bottom - teal theme (centered in content area)
    const dotRadius = 5;
    const dotSpacing = 20;
    const dotsY = h - 28;
    const totalDotsWidth = (maxCycles - 1) * dotSpacing;
    const dotsStartX = contentCenterX - totalDotsWidth / 2;

    for (let i = 0; i < maxCycles; i++) {
      const dotX = dotsStartX + i * dotSpacing;
      const isComplete = i < cycle;
      const isCurrent = i === cycle;

      ctx.beginPath();
      ctx.arc(dotX, dotsY, isCurrent ? dotRadius + 1 : dotRadius, 0, Math.PI * 2);

      if (isComplete) {
        // Completed cycles - bright teal with glow
        ctx.fillStyle = '#84CFC5';
        ctx.shadowColor = 'rgba(132, 207, 197, 0.8)';
        ctx.shadowBlur = 8;
      } else if (isCurrent) {
        // Current cycle - semi-bright teal
        ctx.fillStyle = 'rgba(132, 207, 197, 0.6)';
        ctx.shadowBlur = 0;
      } else {
        // Future cycles - dim
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.shadowBlur = 0;
      }

      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // ==================== PANEL STATE ====================

  /**
   * Draw panel state - delegates to panel's render function
   * Used by MenuPanel subclasses (EffectsPanel, MusicPanel, etc.)
   */
  _drawPanelState(ctx, w, h) {
    if (!this._panelData) return;

    // Let the panel handle its own rendering
    if (typeof this._panelData.render === 'function') {
      this._panelData.render(ctx, w, h, this);
    }

    // Update hit regions from panel
    this._carouselHitRegions = typeof this._panelData.hitRegions === 'function'
      ? this._panelData.hitRegions()
      : (this._panelData.hitRegions || []);
  }

  /**
   * Draw simple cancel/confirm brackets for panels (no navigation arrows)
   * Used by panel render functions to match carousel styling
   */
  drawPanelBrackets(ctx, w, h) {
    const bracketWidth = 80;
    const bracketLineWidth = 4;
    const bracketInset = 4;
    const cornerRadius = 28;
    const edgeInset = 4;

    // Check for pressed buttons
    const pressProgress = this._pressedButton
      ? Math.min((performance.now() - this._pressStart) / this._pressDuration, 1)
      : 0;
    const flashIntensity = pressProgress < 0.3
      ? pressProgress / 0.3
      : 1 - (pressProgress - 0.3) / 0.7;

    const cancelPressed = this._pressedButton === 'cancel';
    const confirmPressed = this._pressedButton === 'confirm';

    // Colors
    const magentaFlash = `rgba(221, 74, 154, ${0.9 + flashIntensity * 0.1})`;
    const greenFlash = `rgba(92, 212, 158, ${0.9 + flashIntensity * 0.1})`;
    const cancelColor = cancelPressed ? magentaFlash : 'rgba(221, 74, 154, 0.8)';
    const confirmColor = confirmPressed ? greenFlash : 'rgba(74, 184, 136, 0.8)';

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // LEFT BRACKET - Cancel (full height)
    ctx.strokeStyle = cancelColor;
    ctx.lineWidth = cancelPressed ? bracketLineWidth + 2 : bracketLineWidth;
    if (cancelPressed) {
      ctx.shadowColor = '#DD4A9A';
      ctx.shadowBlur = 15 * flashIntensity;
    }
    ctx.beginPath();
    ctx.moveTo(bracketInset + bracketWidth, edgeInset);
    ctx.lineTo(bracketInset + cornerRadius, edgeInset);
    ctx.quadraticCurveTo(bracketInset + edgeInset, edgeInset, bracketInset + edgeInset, edgeInset + cornerRadius);
    ctx.lineTo(bracketInset + edgeInset, h - edgeInset - cornerRadius);
    ctx.quadraticCurveTo(bracketInset + edgeInset, h - edgeInset, bracketInset + cornerRadius, h - edgeInset);
    ctx.lineTo(bracketInset + bracketWidth, h - edgeInset);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Cancel icon centered
    const cancelCenterX = bracketInset + bracketWidth / 2 + 4;
    const cancelCenterY = h / 2;
    ctx.fillStyle = cancelPressed ? '#E85DB0' : '#DD4A9A';
    ctx.shadowColor = '#DD4A9A';
    ctx.shadowBlur = cancelPressed ? 15 * flashIntensity : 0;
    ctx.font = '700 28px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', cancelCenterX, cancelCenterY);
    ctx.shadowBlur = 0;

    // RIGHT BRACKET - Confirm (full height)
    const rightX = w - bracketInset - bracketWidth;
    ctx.strokeStyle = confirmColor;
    ctx.lineWidth = confirmPressed ? bracketLineWidth + 2 : bracketLineWidth;
    if (confirmPressed) {
      ctx.shadowColor = '#5CD49E';
      ctx.shadowBlur = 15 * flashIntensity;
    }
    ctx.beginPath();
    ctx.moveTo(rightX, edgeInset);
    ctx.lineTo(rightX + bracketWidth - cornerRadius, edgeInset);
    ctx.quadraticCurveTo(rightX + bracketWidth - edgeInset, edgeInset, rightX + bracketWidth - edgeInset, edgeInset + cornerRadius);
    ctx.lineTo(rightX + bracketWidth - edgeInset, h - edgeInset - cornerRadius);
    ctx.quadraticCurveTo(rightX + bracketWidth - edgeInset, h - edgeInset, rightX + bracketWidth - cornerRadius, h - edgeInset);
    ctx.lineTo(rightX, h - edgeInset);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Confirm icon centered
    const confirmCenterX = rightX + bracketWidth / 2 - 4;
    const confirmCenterY = h / 2;
    ctx.fillStyle = confirmPressed ? '#5CD49E' : '#4AB888';
    ctx.shadowColor = '#5CD49E';
    ctx.shadowBlur = confirmPressed ? 15 * flashIntensity : 0;
    ctx.font = '700 28px Poppins, sans-serif';
    ctx.fillText('✓', confirmCenterX, confirmCenterY);
    ctx.shadowBlur = 0;

    // Return hit regions
    return [
      { name: 'cancel', x: 0, y: 0, w: bracketWidth + bracketInset, h: h },
      { name: 'confirm', x: w - bracketWidth - bracketInset, y: 0, w: bracketWidth + bracketInset, h: h }
    ];
  }

  /**
   * Draw text variant pills (shared between carousel and panels)
   * @returns {Array} Hit regions for the pills
   */
  drawTextPills(ctx, options, y, height, canvasWidth) {
    const { items, selectedIndices, centerX, centerWidth, onToggle } = options;
    const pillHeight = 44;
    const pillPadding = 24;
    const checkmarkWidth = 22;
    const spacing = 14;
    const hitRegions = [];

    // Accent color (matches 3d-example-style.css --accent)
    const accentColor = '#6ee7ff';
    const accentRgb = '110, 231, 255';

    // Measure all pills (including space for checkmark when active)
    ctx.font = '600 16px Poppins, sans-serif';
    const pillWidths = items.map(item => {
      const textWidth = ctx.measureText(item.label).width;
      return textWidth + pillPadding * 2 + checkmarkWidth;
    });
    const totalWidth = pillWidths.reduce((a, b) => a + b, 0) + (items.length - 1) * spacing;
    let startX = centerX + (centerWidth - totalWidth) / 2;

    // Position pills centered in available height
    const pillY = y + height / 2 - pillHeight / 2;

    items.forEach((item, i) => {
      const pillW = pillWidths[i];
      const pillX = startX;
      const isActive = selectedIndices ? selectedIndices.includes(i) : (item.active === true);

      // Pill background - transparent base, accent tint when active
      ctx.fillStyle = isActive
        ? `rgba(${accentRgb}, 0.2)`
        : 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillHeight, pillHeight / 2);
      ctx.fill();

      // Border - thicker, accent when active, subtle when inactive
      ctx.strokeStyle = isActive
        ? accentColor
        : 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Checkmark for active state (positioned left of text)
      if (isActive) {
        ctx.fillStyle = accentColor;
        ctx.font = '700 16px Poppins, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('✓', pillX + pillPadding, pillY + pillHeight / 2);
      }

      // Text - accent when active, muted when inactive
      ctx.fillStyle = isActive ? accentColor : 'rgba(255, 255, 255, 0.6)';
      ctx.font = '600 16px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label.toUpperCase(), pillX + pillW / 2 + (isActive ? 5 : 0), pillY + pillHeight / 2);

      // Hit region
      hitRegions.push({
        name: `pill-${i}`,
        x: pillX - 5,
        y: pillY - 5,
        w: pillW + 10,
        h: pillHeight + 10,
        extra: { index: i, id: item.id, label: item.label }
      });

      startX += pillW + spacing;
    });

    return hitRegions;
  }

  // ==================== MUSIC STATE ====================

  /**
   * Set music data and enter music mode
   * @param {Object|null} data - Music data or null to exit
   * @param {string} data.trackName - Current track name
   * @param {boolean} data.isPlaying - Whether music is currently playing
   * @param {number} data.currentTime - Current playback time in seconds
   * @param {string} data.duration - Track duration formatted as MM:SS
   */
  setMusicData(data) {
    this._musicData = data;
    if (data) {
      this._screenState = 'music';
    } else {
      this._screenState = 'idle';
      this._screenText = 'Hold to speak';
    }
    this._renderScreen();
  }

  /**
   * Update music data without changing state (for time updates)
   * @param {Object} data - Partial music data to update
   */
  updateMusicData(data) {
    if (this._musicData && this._screenState === 'music') {
      Object.assign(this._musicData, data);
      this._renderScreen();
    }
  }

  // ==================== CAROUSEL STATE ====================

  /**
   * SSS color mapping for crystal variants
   */
  static SSS_COLORS = {
    'default': '#ffffff',  // Quartz (white)
    'ruby': '#e0115f',     // Ruby (red)
    'citrine': '#e4a700',  // Citrine (yellow/orange)
    'emerald': '#4AB888',  // Brand-harmonized mint green (HSL 156°)
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
   * Set panel data and enter panel mode
   * Used by MenuPanel subclasses (EffectsPanel, MusicPanel, etc.)
   * @param {Object|null} data - Panel data or null to exit
   * @param {string} data.id - Panel identifier
   * @param {string} data.title - Panel title
   * @param {Function} data.render - Render function (ctx, w, h) => void
   * @param {Function} data.hitRegions - Function returning hit regions array
   */
  setPanelData(data) {
    this._panelData = data;
    if (data) {
      this._screenState = 'panel';
      // Render first so hit regions are populated correctly
      this._renderScreen();
      // Then get hit regions (after render has updated them)
      this._carouselHitRegions = typeof data.hitRegions === 'function'
        ? data.hitRegions()
        : (data.hitRegions || []);
    } else {
      this._screenState = 'idle';
      this._screenText = 'Hold to speak';
      this._carouselHitRegions = [];
      this._renderScreen();
    }
  }

  /**
   * Set side menu open state (toggles hamburger/close icon)
   * @param {boolean} isOpen - Whether the side menu is open
   */
  setMenuOpen(isOpen) {
    this._menuOpen = isOpen;
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
   * Flash a button to indicate it was pressed
   * @param {string} buttonName - Name of the button ('cancel', 'confirm', 'prev-geometry', 'next-geometry')
   * @param {number} duration - Duration of flash in ms (default 200)
   */
  flashButton(buttonName, duration = 200) {
    this._pressedButton = buttonName;
    this._pressStart = performance.now();
    this._pressDuration = duration;
    this._renderScreen();

    // Clear press state after duration
    setTimeout(() => {
      if (this._pressedButton === buttonName) {
        this._pressedButton = null;
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

    // === CAROUSEL GRADIENT BACKGROUND ===
    // Consistent crystal blue/teal colors, alternating gradient direction per geometry
    // Even index = top-left to bottom-right, Odd index = bottom-right to top-left
    const gradientStart = 'rgba(64, 144, 206, 0.4)';  // Smooth Azure
    const gradientEnd = 'rgba(26, 58, 77, 0.3)';      // Deep navy

    const diagonal = Math.max(w, h);
    const isEvenIndex = currentIndex % 2 === 0;

    // Alternate gradient direction based on geometry index
    const bgGradient = isEvenIndex
      ? ctx.createLinearGradient(0, 0, diagonal, diagonal)           // Top-left to bottom-right
      : ctx.createLinearGradient(diagonal, diagonal, 0, 0);          // Bottom-right to top-left

    bgGradient.addColorStop(0, gradientStart);
    bgGradient.addColorStop(1, gradientEnd);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, w, h);

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

    // Check for pressed buttons and calculate flash intensity
    const pressProgress = this._pressedButton
      ? Math.min((performance.now() - this._pressStart) / this._pressDuration, 1)
      : 0;
    // Flash fades out over time
    const flashIntensity = pressProgress < 0.3
      ? pressProgress / 0.3
      : 1 - (pressProgress - 0.3) / 0.7;

    // Determine which button is pressed on this side
    const cancelPressed = this._pressedButton === 'cancel' && side === 'left';
    const confirmPressed = this._pressedButton === 'confirm' && side === 'right';
    const prevPressed = this._pressedButton === 'prev-geometry' && side === 'left';
    const nextPressed = this._pressedButton === 'next-geometry' && side === 'right';

    // Base colors - Eye Tea Green teal theme for navigation
    const bracketGlow = 'rgba(132, 207, 197, 0.2)';

    // Flash colors - bright versions for feedback
    // Eye Tea Green teal for navigation (prev/next)
    const tealFlash = `rgba(132, 207, 197, ${0.9 + flashIntensity * 0.1})`;
    // Magenta Majesty for cancel (brand color)
    const magentaFlash = `rgba(221, 74, 154, ${0.9 + flashIntensity * 0.1})`;
    // Brand-harmonized mint green for confirm - HSL(156°) bridges Eye Tea Green (170°) and pure green (120°)
    const greenFlash = `rgba(92, 212, 158, ${0.9 + flashIntensity * 0.1})`;

    // Default colors - Teal for navigation, Magenta for cancel
    const cancelColor = cancelPressed ? magentaFlash : 'rgba(221, 74, 154, 0.8)';
    // Brand-harmonized confirm: #4AB888 = HSL(156, 47%, 51%) - cool mint that complements Eye Tea Green
    const confirmColor = confirmPressed ? greenFlash : 'rgba(74, 184, 136, 0.8)';
    const prevColor = prevPressed ? tealFlash : 'rgba(132, 207, 197, 0.9)';
    const nextColor = nextPressed ? tealFlash : 'rgba(132, 207, 197, 0.9)';

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (side === 'left') {
      // Draw [ bracket shape - split at 1/3

      // Top 1/3 bracket (Cancel zone) - follows phone corner curve
      ctx.strokeStyle = cancelColor;
      ctx.lineWidth = cancelPressed ? lineWidth + 2 : lineWidth;
      if (cancelPressed) {
        ctx.shadowColor = '#DD4A9A';
        ctx.shadowBlur = 15 * flashIntensity;
      }
      ctx.beginPath();
      ctx.moveTo(x + width, topInset);
      ctx.lineTo(x + cornerRadius, topInset);
      ctx.quadraticCurveTo(x + edgeInset, topInset, x + edgeInset, topInset + cornerRadius);
      ctx.lineTo(x + edgeInset, splitY - 6);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Bottom 2/3 bracket (Prev zone)
      ctx.strokeStyle = prevColor;
      ctx.lineWidth = prevPressed ? lineWidth + 2 : lineWidth;
      if (prevPressed) {
        ctx.shadowColor = '#84CFC5';
        ctx.shadowBlur = 15 * flashIntensity;
      }
      ctx.beginPath();
      ctx.moveTo(x + edgeInset, splitY + 6);
      ctx.lineTo(x + edgeInset, height - bottomInset - cornerRadius);
      ctx.quadraticCurveTo(x + edgeInset, height - bottomInset, x + cornerRadius, height - bottomInset);
      ctx.lineTo(x + width, height - bottomInset);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Horizontal divider line (subtle)
      ctx.strokeStyle = bracketGlow;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + edgeInset, splitY);
      ctx.lineTo(x + width - 15, splitY);
      ctx.stroke();

      // Cancel icon (✕) in top 1/3 - Magenta Majesty
      const cancelCenterX = x + width / 2 + 4;
      const cancelCenterY = actionHeight / 2 + 2;
      ctx.fillStyle = cancelPressed ? '#E85DB0' : '#DD4A9A';
      ctx.shadowColor = '#DD4A9A';
      ctx.shadowBlur = cancelPressed ? 15 * flashIntensity : 0;
      ctx.font = '700 26px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✕', cancelCenterX, cancelCenterY);
      ctx.shadowBlur = 0;

      // Prev arrow (‹) in bottom 2/3 - Eye Tea Green teal
      const prevCenterX = x + width / 2 + 4;
      const prevCenterY = height - actionHeight / 2 - 2;  // Mirror from bottom
      ctx.fillStyle = prevPressed ? '#84CFC5' : '#ffffff';
      ctx.shadowColor = '#84CFC5';
      ctx.shadowBlur = prevPressed ? 15 * flashIntensity : 0;
      ctx.font = '700 52px Poppins, sans-serif';
      ctx.fillText('‹', prevCenterX, prevCenterY);
      ctx.shadowBlur = 0;

    } else {
      // Draw ] bracket shape - split at 1/3

      // Top 1/3 bracket (Confirm zone) - follows phone corner curve
      ctx.strokeStyle = confirmColor;
      ctx.lineWidth = confirmPressed ? lineWidth + 2 : lineWidth;
      if (confirmPressed) {
        ctx.shadowColor = '#5CD49E';  // Brand-harmonized mint green glow
        ctx.shadowBlur = 15 * flashIntensity;
      }
      ctx.beginPath();
      ctx.moveTo(x, topInset);
      ctx.lineTo(x + width - cornerRadius, topInset);
      ctx.quadraticCurveTo(x + width - edgeInset, topInset, x + width - edgeInset, topInset + cornerRadius);
      ctx.lineTo(x + width - edgeInset, splitY - 6);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Bottom 2/3 bracket (Next zone)
      ctx.strokeStyle = nextColor;
      ctx.lineWidth = nextPressed ? lineWidth + 2 : lineWidth;
      if (nextPressed) {
        ctx.shadowColor = '#84CFC5';
        ctx.shadowBlur = 15 * flashIntensity;
      }
      ctx.beginPath();
      ctx.moveTo(x + width - edgeInset, splitY + 6);
      ctx.lineTo(x + width - edgeInset, height - bottomInset - cornerRadius);
      ctx.quadraticCurveTo(x + width - edgeInset, height - bottomInset, x + width - cornerRadius, height - bottomInset);
      ctx.lineTo(x, height - bottomInset);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Horizontal divider line (subtle)
      ctx.strokeStyle = bracketGlow;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 15, splitY);
      ctx.lineTo(x + width - edgeInset, splitY);
      ctx.stroke();

      // Confirm icon (✓) in top 1/3 - Brand-harmonized mint green
      const confirmCenterX = x + width / 2 - 4;
      const confirmCenterY = actionHeight / 2 + 2;
      ctx.fillStyle = confirmPressed ? '#5CD49E' : '#4AB888';  // HSL(156°) mint green
      ctx.shadowColor = '#5CD49E';
      ctx.shadowBlur = confirmPressed ? 15 * flashIntensity : 0;
      ctx.font = '700 26px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✓', confirmCenterX, confirmCenterY);
      ctx.shadowBlur = 0;

      // Next arrow (›) in bottom 2/3 - Eye Tea Green teal
      const nextCenterX = x + width / 2 - 4;
      const nextCenterY = height - actionHeight / 2 - 2;  // Mirror from bottom
      ctx.fillStyle = nextPressed ? '#84CFC5' : '#ffffff';
      ctx.shadowColor = '#84CFC5';
      ctx.shadowBlur = nextPressed ? 15 * flashIntensity : 0;
      ctx.font = '700 52px Poppins, sans-serif';
      ctx.fillText('›', nextCenterX, nextCenterY);
      ctx.shadowBlur = 0;
    }
  }

  /**
   * Draw SSS variant gradient slider - colored gemstone spectrum
   * Clean minimal design with glass-like knob
   */
  _drawSSSVariants(ctx, variants, currentIdx, y, height, canvasWidth, centerX, centerWidth) {
    // Slider centered vertically, using most of horizontal space
    const sliderPadding = 8;
    const sliderX = centerX + sliderPadding;
    const sliderW = centerWidth - sliderPadding * 2;
    const sliderH = 12;  // Clean thin track
    const sliderY = y + height * 0.5;  // Center vertically
    const knobRadius = 18;  // Proportional knob

    // Create gradient from all variant colors
    const gradient = ctx.createLinearGradient(sliderX, 0, sliderX + sliderW, 0);
    variants.forEach((variant, i) => {
      const color = HoloPhone.SSS_COLORS[variant.preset] || HoloPhone.SSS_COLORS['default'];
      const stop = i / (variants.length - 1);
      gradient.addColorStop(stop, color);
    });

    // Draw gradient track with rounded ends - no glow for cleaner look
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(sliderX, sliderY - sliderH / 2, sliderW, sliderH, sliderH / 2);
    ctx.fill();

    // Track border - subtle white outline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Calculate knob position based on current selection
    const knobProgress = currentIdx / (variants.length - 1);
    const knobX = sliderX + knobProgress * sliderW;

    // Get current color
    const currentColor = HoloPhone.SSS_COLORS[variants[currentIdx]?.preset] || HoloPhone.SSS_COLORS['default'];

    // Subtle outer glow
    ctx.shadowColor = currentColor;
    ctx.shadowBlur = 15;

    // Knob fill with current color
    ctx.fillStyle = currentColor;
    ctx.beginPath();
    ctx.arc(knobX, sliderY, knobRadius, 0, Math.PI * 2);
    ctx.fill();

    // Reset shadow
    ctx.shadowBlur = 0;

    // Knob 3D highlight - glass-like effect
    const knobGradient = ctx.createRadialGradient(
      knobX - knobRadius * 0.35, sliderY - knobRadius * 0.35, 0,
      knobX, sliderY, knobRadius
    );
    knobGradient.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    knobGradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.25)');
    knobGradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.05)');
    knobGradient.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
    ctx.fillStyle = knobGradient;
    ctx.beginPath();
    ctx.arc(knobX, sliderY, knobRadius, 0, Math.PI * 2);
    ctx.fill();

    // Knob border - clean white
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
   * Draw text-based variant pills - compact layout with glow effects
   * Positioned at 38% height to stay clear of arrows
   */
  _drawTextVariants(ctx, variants, currentIdx, y, height, canvasWidth, centerX, centerWidth) {
    const pillHeight = 40;
    const pillPadding = 20;
    const spacing = 12;

    // Measure all pills
    ctx.font = '600 20px Poppins, sans-serif';
    const pillWidths = variants.map(v => ctx.measureText(v.label || v.name).width + pillPadding * 2);
    const totalWidth = pillWidths.reduce((a, b) => a + b, 0) + (variants.length - 1) * spacing;
    let startX = centerX + (centerWidth - totalWidth) / 2;

    // Position pills at 38% height
    const pillY = y + height * 0.38 - pillHeight / 2;

    variants.forEach((variant, i) => {
      const pillW = pillWidths[i];
      const pillX = startX;
      const isActive = i === currentIdx;

      // Active pill glow - Supple Blue
      if (isActive) {
        ctx.shadowColor = 'rgba(50, 172, 226, 0.6)';
        ctx.shadowBlur = 15;
      }

      // Pill background - subtle blue tint when active
      if (isActive) {
        ctx.fillStyle = 'rgba(50, 172, 226, 0.25)';
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      }
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillHeight, pillHeight / 2);
      ctx.fill();

      // Reset shadow before border
      ctx.shadowBlur = 0;

      // Border - white when active, subtle blue otherwise
      if (isActive) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(50, 172, 226, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Text with glow for active
      if (isActive) {
        ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
        ctx.shadowBlur = 6;
      }
      ctx.fillStyle = isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.7)';
      ctx.font = isActive ? '600 20px Poppins, sans-serif' : '400 20px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(variant.label || variant.name, pillX + pillW / 2, pillY + pillHeight / 2);

      // Reset shadow
      ctx.shadowBlur = 0;

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
   * Enhanced with glow effects
   */
  _drawMoonPhaseRow(ctx, variants, currentIdx, phase, y, height, canvasWidth, centerX, centerWidth) {
    const pillHeight = 40;
    const pillPadding = 18;
    const spacing = 12;
    const phaseVariantActive = variants[currentIdx]?.name === 'phase';

    // Pills positioned at 30% of height
    const pillY = y + height * 0.30 - pillHeight / 2;

    // Measure all pills
    ctx.font = '600 20px Poppins, sans-serif';
    const pillWidths = variants.map(v => ctx.measureText(v.label || v.name).width + pillPadding * 2);
    const totalWidth = pillWidths.reduce((a, b) => a + b, 0) + (variants.length - 1) * spacing;
    let startX = centerX + (centerWidth - totalWidth) / 2;

    variants.forEach((variant, i) => {
      const label = variant.label || variant.name;
      const pillW = pillWidths[i];
      const pillX = startX;
      const isActive = i === currentIdx;

      // Active pill glow - Supple Blue
      if (isActive) {
        ctx.shadowColor = 'rgba(50, 172, 226, 0.6)';
        ctx.shadowBlur = 15;
      }

      // Pill background - subtle blue tint when active
      if (isActive) {
        ctx.fillStyle = 'rgba(50, 172, 226, 0.25)';
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      }
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillHeight, pillHeight / 2);
      ctx.fill();

      // Reset shadow before border
      ctx.shadowBlur = 0;

      // Border - white when active, subtle blue otherwise
      if (isActive) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(50, 172, 226, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Text with glow for active
      if (isActive) {
        ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
        ctx.shadowBlur = 6;
      }
      ctx.fillStyle = isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.7)';
      ctx.font = isActive ? '600 20px Poppins, sans-serif' : '400 20px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, pillX + pillW / 2, pillY + pillHeight / 2);

      // Reset shadow
      ctx.shadowBlur = 0;

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
      const sliderH = 12;  // Clean track height
      const knobRadius = 18;  // Smaller, cleaner knob

      // Slider track background - subtle
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.roundRect(sliderX, sliderY - sliderH / 2, sliderW, sliderH, sliderH / 2);
      ctx.fill();

      // Track border
      ctx.strokeStyle = 'rgba(50, 172, 226, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Slider fill - Supple Blue gradient
      const fillW = Math.max(sliderH, phase * sliderW);
      ctx.fillStyle = 'rgba(50, 172, 226, 0.6)';
      ctx.beginPath();
      ctx.roundRect(sliderX, sliderY - sliderH / 2, fillW, sliderH, sliderH / 2);
      ctx.fill();

      // Knob - clean white with subtle Supple Blue glow
      const knobX = sliderX + phase * sliderW;
      ctx.shadowColor = 'rgba(50, 172, 226, 0.5)';
      ctx.shadowBlur = 12;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(knobX, sliderY, knobRadius, 0, Math.PI * 2);
      ctx.fill();

      // Reset shadow
      ctx.shadowBlur = 0;

      // Knob border
      ctx.strokeStyle = 'rgba(50, 172, 226, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();

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

    // Re-render screen every frame for smooth animations
    // Idle state has pulsing logo, other states have various animations
    this._renderScreen();
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
