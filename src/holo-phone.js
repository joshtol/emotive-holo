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

    // Screen texture components
    this.screenCanvas = null;
    this.screenContext = null;
    this.screenTexture = null;
    this.screenMaterial = null;

    // Screen content state
    this._screenText = 'Hold to speak';
    this._screenState = 'idle';  // idle, listening, processing, speaking
    this._animationFrame = 0;

    // UV calibration values (can be adjusted in grid mode)
    this._uvMin = { x: 0.04, y: 0.27 };
    this._uvMax = { x: 0.36, y: 0.91 };
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
      default:
        this._drawIdleState(ctx, w, h);
    }

    // Add screen edge glow
    this._drawScreenGlow(ctx, w, h);

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
   * Draw processing state - spinning indicator
   */
  _drawProcessingState(ctx, w, h) {
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
   * Draw speaking state - text with animated indicator
   */
  _drawSpeakingState(ctx, w, h) {
    ctx.fillStyle = '#40e0d0';
    ctx.font = '24px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';

    // Wrap text if needed
    const words = this._screenText.split(' ');
    let lines = [];
    let currentLine = '';
    const maxWidth = w - 60;

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
    const lineHeight = 30;
    const startY = h / 2 - (lines.length * lineHeight) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, startY + i * lineHeight);
    });

    // Animated speaking indicator
    const dotY = h - 40;
    for (let i = 0; i < 3; i++) {
      const phase = this._animationFrame * 0.2 + i * 0.5;
      const bounce = Math.abs(Math.sin(phase)) * 10;
      ctx.beginPath();
      ctx.arc(w / 2 - 20 + i * 20, dotY - bounce, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#40e0d0';
      ctx.fill();
    }
  }

  /**
   * Draw subtle screen edge glow
   */
  _drawScreenGlow(ctx, w, h) {
    const glowWidth = 3;
    ctx.strokeStyle = 'rgba(64, 224, 208, 0.5)';
    ctx.lineWidth = glowWidth;
    ctx.strokeRect(glowWidth / 2, glowWidth / 2, w - glowWidth, h - glowWidth);
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
      <div style="margin-bottom: 8px;">Arrow keys: adjust | Shift: big steps</div>
      ${controls.map(c => {
        const active = this._activeControl === c.key;
        return `<div style="color: ${active ? '#ffff00' : '#ffffff'}">${c.label}: ${c.val.toFixed(2)}${active ? ' ◄' : ''}</div>`;
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

      const step = e.shiftKey ? 0.05 : 0.01;
      let changed = false;

      switch (e.key) {
        case '1': this._activeControl = 'minY'; changed = true; break;
        case '2': this._activeControl = 'maxY'; changed = true; break;
        case '3': this._activeControl = 'minX'; changed = true; break;
        case '4': this._activeControl = 'maxX'; changed = true; break;
        case 'ArrowLeft':
        case 'ArrowDown':
          this._adjustUV(-step);
          changed = true;
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          this._adjustUV(step);
          changed = true;
          break;
        case 'c':
        case 'C':
          const uvText = `this._uvMin = { x: ${this._uvMin.x.toFixed(2)}, y: ${this._uvMin.y.toFixed(2)} };\nthis._uvMax = { x: ${this._uvMax.x.toFixed(2)}, y: ${this._uvMax.y.toFixed(2)} };`;
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
    console.log('Grid controls active: 1-4 select edge, arrows adjust, C to copy');
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
    if (this.screenMaterial && this.screenMaterial.uniforms) {
      this.screenMaterial.uniforms.screenUVMin.value.set(this._uvMin.x, this._uvMin.y);
      this.screenMaterial.uniforms.screenUVMax.value.set(this._uvMax.x, this._uvMax.y);
    }
  }

  /**
   * Load the phone model (GLB format with Draco compression)
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

          // Create shader material that composites screen canvas over phone texture
          this.screenMaterial = new THREE.ShaderMaterial({
            uniforms: {
              phoneTexture: { value: diffuseTexture },
              screenTexture: { value: this.screenTexture },
              // UV bounds of screen region in the phone texture
              screenUVMin: { value: new THREE.Vector2(this._uvMin.x, this._uvMin.y) },
              screenUVMax: { value: new THREE.Vector2(this._uvMax.x, this._uvMax.y) }
            },
            vertexShader: `
              varying vec2 vUv;
              varying vec3 vNormal;
              varying vec3 vViewPosition;

              void main() {
                vUv = uv;
                vNormal = normalize(normalMatrix * normal);
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                vViewPosition = -mvPosition.xyz;
                gl_Position = projectionMatrix * mvPosition;
              }
            `,
            fragmentShader: `
              uniform sampler2D phoneTexture;
              uniform sampler2D screenTexture;
              uniform vec2 screenUVMin;
              uniform vec2 screenUVMax;

              varying vec2 vUv;
              varying vec3 vNormal;
              varying vec3 vViewPosition;

              void main() {
                // Sample base phone texture
                vec4 phoneColor = texture2D(phoneTexture, vUv);

                // Check if we're in the screen UV region
                bool inScreen = vUv.x >= screenUVMin.x && vUv.x <= screenUVMax.x &&
                                vUv.y >= screenUVMin.y && vUv.y <= screenUVMax.y;

                if (inScreen) {
                  // Map phone UV to screen texture UV (0-1 range)
                  vec2 screenUV = (vUv - screenUVMin) / (screenUVMax - screenUVMin);
                  // Rotate 90 degrees CW for landscape display and flip to correct mirror
                  float temp = screenUV.x;
                  screenUV.x = 1.0 - screenUV.y;  // Flip X to fix mirror
                  screenUV.y = 1.0 - temp;
                  vec4 screenColor = texture2D(screenTexture, screenUV);

                  // Use screen color in the screen region
                  gl_FragColor = screenColor;
                } else {
                  // Simple lighting for phone body
                  vec3 lightDir = normalize(vec3(1.0, 2.0, 3.0));
                  float diff = max(dot(vNormal, lightDir), 0.0) * 0.5 + 0.5;
                  gl_FragColor = vec4(phoneColor.rgb * diff, phoneColor.a);
                }
              }
            `,
            side: THREE.DoubleSide
          });

          // Apply material to all meshes
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

          console.log('HoloPhone loaded with screen shader (GLB)');
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
    this._renderScreen();
  }

  /**
   * Update animation frame (call each render)
   */
  update(deltaTime) {
    if (this._gridMode) return;
    this._animationFrame++;

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
