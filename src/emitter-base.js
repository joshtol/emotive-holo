/**
 * EmitterBase - 3D Holographic Projector Base
 * Loads and manages the 3D emitter model in the scene
 *
 * The emitter is rendered on layer 3 to be completely independent of OrbitControls.
 * It maintains a fixed position and orientation regardless of camera movement.
 */

import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

export class EmitterBase {
  constructor(scene, camera, renderer, options = {}) {
    this.scene = scene;
    this.camera = camera;  // Main camera - we'll track its zoom
    this.renderer = renderer;
    this.mesh = null;
    this.beam = null;  // Holographic beam effect (outer cone)
    this.beamCore = null;  // Inner bright beam
    this.beamGroup = null;  // Container for beam elements
    this.apertureGlow = null;  // Glow at emitter aperture
    this.apertureRing = null;  // Animated ring around aperture
    this.beamParticles = null;  // Rising particle stream
    this.arcDischarges = [];  // Electric arc sparks
    this.scanlines = null;  // Scanline interference mesh

    // Animation state
    this._time = 0;
    this._nextArcTime = 0;
    this._glowColor = new THREE.Color(0x40e0d0);  // Default cyan, syncs with mascot
    this.options = {
      basePath: '/assets/models/emitter',
      scale: options.scale || 0.15,
      position: options.position || { x: 0, y: -0.65, z: 0 },
      rotation: options.rotation || { x: 0, y: 0, z: 0 },
      ...options
    };

    // Create a separate camera for the emitter
    // This camera will track the main camera's zoom level
    this.emitterCamera = new THREE.PerspectiveCamera(
      camera.fov,
      camera.aspect,
      camera.near,
      camera.far
    );
    // Set camera to only see layer 3 (emitter layer)
    this.emitterCamera.layers.set(3);
    // Store initial camera distance for zoom tracking
    this._baseCameraZ = 3;
    this._initialMainCameraZ = null;

    // Create dedicated lights for the emitter layer
    this.emitterLights = [];
    this._setupEmitterLights();
  }

  /**
   * Setup dedicated lights for the emitter on layer 3
   */
  _setupEmitterLights() {
    // Ambient light for base illumination
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    ambient.layers.enable(3);
    this.scene.add(ambient);
    this.emitterLights.push(ambient);

    // Key light matching the background's window lighting
    const keyLight = new THREE.DirectionalLight(0xfff8f0, 1.0);
    keyLight.position.set(2.5, 3.5, -2.5);
    keyLight.target.position.set(0, this.options.position.y, 0);
    keyLight.layers.enable(3);

    this.scene.add(keyLight);
    this.scene.add(keyLight.target);
    this.emitterLights.push(keyLight);

    // Fill light from front-left
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.25);
    fillLight.position.set(-2, 1.5, 3);
    fillLight.layers.enable(3);
    this.scene.add(fillLight);
    this.emitterLights.push(fillLight);
  }

  /**
   * Create the holographic beam effect
   * A lazy, atmospheric projection with waving caustics
   * Beam spreads wide and fades before reaching the geometry
   */
  _createBeamEffect() {
    // Create container for all beam elements
    this.beamGroup = new THREE.Group();
    this.beamGroup.layers.set(3);

    const emitterY = this.options.position.y;
    const beamHeight = 0.35;  // Shorter - fades before crystal
    const beamTopRadius = 0.18;  // Wide spread at top
    const beamBottomRadius = 0.025;  // Narrow at aperture

    // Main caustic beam - wide spreading cone with lazy waving patterns
    const beamGeometry = new THREE.CylinderGeometry(
      beamTopRadius,      // Top radius (wide)
      beamBottomRadius,   // Bottom radius (narrow)
      beamHeight,
      48,                 // More segments for smooth caustics
      1,
      true                // Open ended
    );

    const beamMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: this._glowColor.clone() },
        opacity: { value: 0.55 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying float vY;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vY = position.y;
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color;
        uniform float opacity;
        varying vec2 vUv;
        varying float vY;
        varying vec3 vWorldPos;

        // Simplex-like noise for caustics
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float caustic(vec2 uv, float t) {
          // Large, lazy waving caustic pattern
          float c1 = noise(uv * 2.0 + vec2(t * 0.15, t * 0.1));
          float c2 = noise(uv * 3.0 - vec2(t * 0.12, t * 0.08));
          float c3 = noise(uv * 1.5 + vec2(t * 0.08, -t * 0.15));

          // Combine for organic caustic look
          float caustics = c1 * c2 + c3 * 0.5;
          caustics = pow(caustics, 1.5);  // Enhance contrast
          return caustics;
        }

        void main() {
          // Normalized height (0 = bottom/aperture, 1 = top)
          float normalizedY = (vY + ${(beamHeight / 2).toFixed(3)}) / ${beamHeight.toFixed(3)};

          // Strong fade toward top (completely gone before crystal)
          float verticalFade = 1.0 - pow(normalizedY, 1.5);
          verticalFade *= smoothstep(0.0, 0.15, normalizedY);  // Also fade at very bottom

          // Large, slow-moving caustic patterns
          vec2 causticUV = vec2(vUv.x * 6.28318, normalizedY * 2.0);
          float caustics = caustic(causticUV, time);

          // Secondary larger caustic layer (even lazier)
          float bigCaustic = caustic(causticUV * 0.5, time * 0.7);
          caustics = mix(caustics, bigCaustic, 0.4);

          // Soft radial falloff (brighter in center, fades at edges)
          float radial = 1.0 - smoothstep(0.3, 0.5, abs(vUv.x - 0.5));

          // Very gentle pulse
          float pulse = sin(time * 0.8) * 0.1 + 0.9;

          // Combine everything
          float alpha = verticalFade * caustics * radial * opacity * pulse;

          // Slightly brighter where caustics concentrate
          vec3 finalColor = mix(color, color * 1.3, caustics * 0.3);

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.beam = new THREE.Mesh(beamGeometry, beamMaterial);
    this.beam.position.set(0, emitterY + 0.02 + beamHeight / 2, 0);
    this.beam.layers.set(3);
    this.beamGroup.add(this.beam);

    // Glowing aperture disc - like a projector lens with concentric rings
    const apertureGeometry = new THREE.CircleGeometry(0.055, 64);
    const apertureMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: this._glowColor.clone() }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color;
        varying vec2 vUv;

        void main() {
          vec2 center = vUv - 0.5;
          float dist = length(center) * 2.0;

          // Bright center core
          float core = 1.0 - smoothstep(0.0, 0.3, dist);
          core = pow(core, 2.0);

          // Concentric rings
          float rings = sin(dist * 25.0 - time * 2.0) * 0.5 + 0.5;
          rings *= smoothstep(0.1, 0.3, dist) * (1.0 - smoothstep(0.7, 1.0, dist));
          rings *= 0.3;

          // Outer glow falloff
          float glow = 1.0 - smoothstep(0.0, 1.0, dist);
          glow = pow(glow, 1.5);

          // Soft pulse
          float pulse = sin(time * 1.2) * 0.1 + 0.9;

          // Combine
          float intensity = (core * 0.8 + rings + glow * 0.4) * pulse;

          // Color gradient - brighter white in center
          vec3 finalColor = mix(color, vec3(1.0), core * 0.6);

          gl_FragColor = vec4(finalColor, intensity * 0.7);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.apertureGlow = new THREE.Mesh(apertureGeometry, apertureMaterial);
    this.apertureGlow.position.set(0, emitterY + 0.012, 0);
    this.apertureGlow.rotation.x = -Math.PI / 2;  // Lay flat facing up
    this.apertureGlow.layers.set(3);
    this.beamGroup.add(this.apertureGlow);

    // Secondary larger outer glow ring
    const outerGlowGeometry = new THREE.RingGeometry(0.045, 0.08, 64);
    const outerGlowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: this._glowColor.clone() }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color;
        varying vec2 vUv;

        void main() {
          // Radial position within ring (0 = inner edge, 1 = outer edge)
          float radial = vUv.y;

          // Soft glow that fades toward outer edge
          float glow = 1.0 - radial;
          glow = pow(glow, 2.0);

          // Gentle pulse
          float pulse = sin(time * 0.8) * 0.15 + 0.85;

          gl_FragColor = vec4(color, glow * 0.35 * pulse);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.outerGlow = new THREE.Mesh(outerGlowGeometry, outerGlowMaterial);
    this.outerGlow.position.set(0, emitterY + 0.011, 0);
    this.outerGlow.rotation.x = -Math.PI / 2;
    this.outerGlow.layers.set(3);
    this.beamGroup.add(this.outerGlow);

    this.scene.add(this.beamGroup);
    console.log('Holographic beam effect created - lazy caustic projector');
  }

  /**
   * Spawn an electric arc discharge from the aperture
   */
  _spawnArcDischarge() {
    const emitterY = this.options.position.y;

    // Random arc direction
    const angle = Math.random() * Math.PI * 2;
    const height = 0.08 + Math.random() * 0.12;
    const spread = 0.04 + Math.random() * 0.06;

    // Create arc as a line with multiple segments
    const segments = 8;
    const points = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = Math.cos(angle) * spread * t + (Math.random() - 0.5) * 0.025;
      const y = emitterY + 0.02 + height * t;
      const z = Math.sin(angle) * spread * t + (Math.random() - 0.5) * 0.025;
      points.push(new THREE.Vector3(x, y, z));
    }

    const arcGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const arcMaterial = new THREE.LineBasicMaterial({
      color: this._glowColor.clone(),
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending
    });

    const arc = new THREE.Line(arcGeometry, arcMaterial);
    arc.layers.set(3);
    arc.userData = {
      lifetime: 0.08 + Math.random() * 0.12,
      age: 0
    };

    this.arcDischarges.push(arc);
    this.beamGroup.add(arc);
  }

  /**
   * Update arc discharge animations
   */
  _updateArcDischarges(deltaTime) {
    // Spawn new arcs randomly
    this._time += deltaTime;
    if (this._time >= this._nextArcTime) {
      this._spawnArcDischarge();
      // Random interval between arcs
      this._nextArcTime = this._time + 0.1 + Math.random() * 0.4;

      // Occasionally spawn multiple arcs for a burst effect
      if (Math.random() < 0.25) {
        this._spawnArcDischarge();
        if (Math.random() < 0.4) {
          this._spawnArcDischarge();
        }
      }
    }

    // Update existing arcs
    for (let i = this.arcDischarges.length - 1; i >= 0; i--) {
      const arc = this.arcDischarges[i];
      arc.userData.age += deltaTime;

      // Fade out
      const life = arc.userData.age / arc.userData.lifetime;
      arc.material.opacity = 0.25 * (1.0 - life);

      // Remove dead arcs
      if (arc.userData.age >= arc.userData.lifetime) {
        this.beamGroup.remove(arc);
        arc.geometry.dispose();
        arc.material.dispose();
        this.arcDischarges.splice(i, 1);
      }
    }
  }

  /**
   * Update beam animation
   */
  _updateBeam(deltaTime) {
    // Update main caustic beam
    if (this.beam && this.beam.material.uniforms) {
      this.beam.material.uniforms.time.value += deltaTime;
    }

    // Animate aperture glow disc with rings
    if (this.apertureGlow?.material?.uniforms) {
      this.apertureGlow.material.uniforms.time.value += deltaTime;
    }

    // Animate outer glow ring
    if (this.outerGlow?.material?.uniforms) {
      this.outerGlow.material.uniforms.time.value += deltaTime;
    }

    // Update arc discharges
    this._updateArcDischarges(deltaTime);
  }

  /**
   * Set the glow color for all emitter effects
   * Syncs with the mascot's current emotion color
   * @param {THREE.Color|number|string} color - The color to set
   */
  setGlowColor(color) {
    if (!(color instanceof THREE.Color)) {
      color = new THREE.Color(color);
    }
    this._glowColor.copy(color);

    // Update caustic beam color
    if (this.beam?.material?.uniforms?.color) {
      this.beam.material.uniforms.color.value.copy(color);
    }

    // Update aperture glow disc
    if (this.apertureGlow?.material?.uniforms?.color) {
      this.apertureGlow.material.uniforms.color.value.copy(color);
    }

    // Update outer glow ring
    if (this.outerGlow?.material?.uniforms?.color) {
      this.outerGlow.material.uniforms.color.value.copy(color);
    }

    // Arc discharges will pick up new color on next spawn
  }

  async load() {
    return new Promise((resolve, reject) => {
      const mtlLoader = new MTLLoader();
      mtlLoader.setPath(`${this.options.basePath}/`);

      mtlLoader.load('emitter.mtl', (materials) => {
        materials.preload();

        // Fix texture path - MTL references wrong filename
        // Override to use the actual texture file (emitter.png)
        Object.values(materials.materials).forEach(material => {
          if (material.map) {
            const textureLoader = new THREE.TextureLoader();
            material.map = textureLoader.load(`${this.options.basePath}/emitter.png`);
            material.map.wrapS = THREE.RepeatWrapping;
            material.map.wrapT = THREE.RepeatWrapping;
          }
        });

        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        objLoader.setPath(`${this.options.basePath}/`);

        objLoader.load('emitter.obj', (obj) => {
          this.mesh = obj;

          // Apply transforms - fixed orientation, sits flat on table
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

          // Put emitter ONLY on layer 3 for separate rendering
          this.mesh.layers.set(3);
          this.mesh.traverse((child) => {
            if (child.isMesh) {
              child.layers.set(3);
            }
          });

          // Add to scene
          this.scene.add(this.mesh);

          // Initialize the emitter camera position based on main camera
          this._baseCameraZ = this.camera.position.length();
          this._initialMainCameraZ = this._baseCameraZ;
          this.emitterCamera.position.set(0, 0, this._baseCameraZ);
          this.emitterCamera.lookAt(0, 0, 0);

          // Create the holographic beam effect
          this._createBeamEffect();

          console.log('Emitter base loaded on layer 3');
          resolve(this.mesh);
        },
        // Progress callback
        (xhr) => {
          if (xhr.lengthComputable) {
            const progress = (xhr.loaded / xhr.total * 100).toFixed(0);
            console.log(`Loading emitter: ${progress}%`);
          }
        },
        // Error callback
        (error) => {
          console.error('Error loading emitter OBJ:', error);
          reject(error);
        });
      },
      // MTL progress
      undefined,
      // MTL error - try loading without materials
      (error) => {
        console.warn('MTL load failed, loading OBJ without materials:', error);
        this.loadWithoutMaterials().then(resolve).catch(reject);
      });
    });
  }

  async loadWithoutMaterials() {
    return new Promise((resolve, reject) => {
      const objLoader = new OBJLoader();
      objLoader.setPath(`${this.options.basePath}/`);

      objLoader.load('emitter.obj', (obj) => {
        this.mesh = obj;

        // Create a basic material with the texture
        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load(`${this.options.basePath}/emitter.png`);

        obj.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshStandardMaterial({
              map: texture,
              metalness: 0.3,
              roughness: 0.6
            });
            // Put ONLY on layer 3 for separate rendering
            child.layers.set(3);
          }
        });

        // Apply transforms - fixed orientation
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

        // Put emitter ONLY on layer 3 for separate rendering
        this.mesh.layers.set(3);

        // Add to scene
        this.scene.add(this.mesh);

        // Initialize the emitter camera position
        this._baseCameraZ = this.camera.position.length();
        this._initialMainCameraZ = this._baseCameraZ;
        this.emitterCamera.position.set(0, 0, this._baseCameraZ);
        this.emitterCamera.lookAt(0, 0, 0);

        // Create the holographic beam effect
        this._createBeamEffect();

        console.log('Emitter base loaded (without MTL) on layer 3');
        resolve(this.mesh);
      },
      undefined,
      (error) => {
        console.error('Error loading emitter OBJ:', error);
        reject(error);
      });
    });
  }

  setPosition(x, y, z) {
    if (this.mesh) {
      this.mesh.position.set(x, y, z);
    }
  }

  setScale(scale) {
    if (this.mesh) {
      this.mesh.scale.setScalar(scale);
    }
  }

  setRotation(x, y, z) {
    if (this.mesh) {
      this.mesh.rotation.set(x, y, z);
    }
  }

  setVisible(visible) {
    if (this.mesh) {
      this.mesh.visible = visible;
    }
  }

  /**
   * Render the emitter with its own FIXED camera
   * Called after the main scene render to overlay the emitter
   * The emitter is completely independent of the main camera - no zoom/rotation tracking
   */
  render() {
    if (!this.mesh || !this.renderer || !this.emitterCamera) return;

    // Emitter camera stays completely fixed - no zoom or rotation tracking
    // This ensures the emitter stays in place while you explore the mascot

    // Update beam animation (assume ~60fps = 16ms per frame)
    this._updateBeam(0.016);

    // Don't clear - render on top of existing scene
    // The emitter camera is set to layer 3 in constructor
    this.renderer.render(this.scene, this.emitterCamera);
  }

  /**
   * Update emitter camera aspect ratio on resize
   */
  resize(aspect) {
    if (this.emitterCamera) {
      this.emitterCamera.aspect = aspect;
      this.emitterCamera.updateProjectionMatrix();
    }
  }

  /**
   * Get the screen bounds of the emitter mesh by projecting its 3D bounding box
   * through the emitter camera. Returns coordinates in SVG viewBox percentage (0-100).
   *
   * IMPORTANT: The canvas may be offset from the viewport via CSS positioning.
   * The layoutCenterX parameter adjusts for this offset so the returned bounds
   * are in VIEWPORT coordinates (matching where the SVG shadows are placed).
   *
   * This is used to make shadows proportionate to the actual rendered emitter size,
   * regardless of viewport dimensions, camera settings, or layout mode.
   *
   * @param {number} layoutCenterX - The CSS layout center X in viewport % (e.g., 67 for desktop, 50 for mobile)
   * @returns {{ left: number, right: number, top: number, bottom: number, width: number, height: number, centerX: number, centerY: number } | null}
   */
  getScreenBounds(layoutCenterX = 50) {
    if (!this.mesh || !this.emitterCamera || !this.renderer) return null;

    // Compute bounding box of the emitter mesh in world space
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

    // Project each corner to screen space (normalized device coordinates: -1 to 1)
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    // Update camera matrices for accurate projection
    this.emitterCamera.updateMatrixWorld();
    this.emitterCamera.updateProjectionMatrix();

    for (const corner of corners) {
      const projected = corner.clone().project(this.emitterCamera);

      // Only consider points in front of camera
      if (projected.z < 1) {
        minX = Math.min(minX, projected.x);
        maxX = Math.max(maxX, projected.x);
        minY = Math.min(minY, projected.y);
        maxY = Math.max(maxY, projected.y);
      }
    }

    // Convert from NDC (-1 to 1) to canvas percentage (0 to 100)
    // NDC: x=-1 is left, x=1 is right; y=-1 is bottom, y=1 is top
    const canvasLeft = ((minX + 1) / 2) * 100;
    const canvasRight = ((maxX + 1) / 2) * 100;
    const canvasBottom = ((minY + 1) / 2) * 100;
    const canvasTop = ((maxY + 1) / 2) * 100;

    // The canvas is positioned with CSS: left = layoutCenterX - 50%
    // So canvas position 50% maps to viewport position layoutCenterX
    // Viewport X = canvasX + (layoutCenterX - 50)
    const xOffset = layoutCenterX - 50;
    const left = canvasLeft + xOffset;
    const right = canvasRight + xOffset;

    // For SVG which has y=0 at top, we need to flip
    // SVG coords: top of screen = 0, bottom = 100
    const svgTop = 100 - canvasTop;
    const svgBottom = 100 - canvasBottom;

    return {
      left,
      right,
      top: svgTop,
      bottom: svgBottom,
      width: right - left,  // Width doesn't change with offset
      height: svgBottom - svgTop,
      centerX: (left + right) / 2,
      centerY: (svgTop + svgBottom) / 2
    };
  }

  destroy() {
    // Clean up emitter mesh
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

    // Clean up beam effect
    if (this.beamGroup && this.scene) {
      this.scene.remove(this.beamGroup);
    }
    if (this.beam) {
      if (this.beam.geometry) this.beam.geometry.dispose();
      if (this.beam.material) this.beam.material.dispose();
      this.beam = null;
    }
    if (this.beamCore) {
      if (this.beamCore.geometry) this.beamCore.geometry.dispose();
      if (this.beamCore.material) this.beamCore.material.dispose();
      this.beamCore = null;
    }
    if (this.apertureGlow) {
      if (this.apertureGlow.geometry) this.apertureGlow.geometry.dispose();
      if (this.apertureGlow.material) this.apertureGlow.material.dispose();
      this.apertureGlow = null;
    }

    // Clean up aperture rings
    if (this.apertureRing) {
      if (this.apertureRing.geometry) this.apertureRing.geometry.dispose();
      if (this.apertureRing.material) this.apertureRing.material.dispose();
      this.apertureRing = null;
    }
    if (this.outerRing) {
      if (this.outerRing.geometry) this.outerRing.geometry.dispose();
      if (this.outerRing.material) this.outerRing.material.dispose();
      this.outerRing = null;
    }

    // Clean up beam particles
    if (this.beamParticles) {
      if (this.beamParticles.geometry) this.beamParticles.geometry.dispose();
      if (this.beamParticles.material) this.beamParticles.material.dispose();
      this.beamParticles = null;
    }

    // Clean up scanlines
    if (this.scanlines) {
      if (this.scanlines.geometry) this.scanlines.geometry.dispose();
      if (this.scanlines.material) this.scanlines.material.dispose();
      this.scanlines = null;
    }

    // Clean up arc discharges
    if (this.arcDischarges) {
      this.arcDischarges.forEach(arc => {
        if (arc.geometry) arc.geometry.dispose();
        if (arc.material) arc.material.dispose();
      });
      this.arcDischarges = [];
    }

    this.beamGroup = null;

    // Clean up emitter lights
    if (this.emitterLights) {
      this.emitterLights.forEach(light => {
        this.scene.remove(light);
      });
      this.emitterLights = [];
    }

    // Clean up camera
    this.emitterCamera = null;
  }
}

export default EmitterBase;
