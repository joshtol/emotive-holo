/**
 * EmitterBase - 3D Holographic Projector Base
 * Loads and manages the 3D emitter model in the scene
 *
 * The emitter is rendered on layer 3 to be completely independent of OrbitControls.
 * It maintains a fixed position and orientation regardless of camera movement.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export class EmitterBase {
  constructor(scene, camera, renderer, options = {}) {
    this.mainScene = scene;  // Reference to main scene for env map capture
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

    // Environment mapping - captures mascot scene for reflections
    this.cubeCamera = null;
    this.cubeRenderTarget = null;
    this._envMapReady = false;
    this._frameCount = 0;
    this._envMapUpdateInterval = 2;  // Update every N frames for performance

    this.options = {
      basePath: '/assets/models/emitter',
      scale: options.scale || 0.15,
      position: options.position || { x: 0, y: -0.65, z: 0 },
      rotation: options.rotation || { x: 0, y: 0, z: 0 },
      ...options
    };

    // Create a SEPARATE scene for the emitter to avoid light conflicts
    // The main scene has DirectionalLights whose targets can cause render errors
    this.scene = new THREE.Scene();

    // Create a separate camera for the emitter
    // This camera will track the main camera's zoom level
    this.emitterCamera = new THREE.PerspectiveCamera(
      camera.fov,
      camera.aspect,
      camera.near,
      camera.far
    );
    // Store initial camera distance for zoom tracking
    this._baseCameraZ = 3;
    this._initialMainCameraZ = null;

    // Setup lights for the emitter's own scene
    this.emitterLights = [];
    this._setupEmitterLights();
  }

  /**
   * Setup lights for the emitter's separate scene
   * Since we have our own scene, we can use any light type safely
   */
  _setupEmitterLights() {
    // Ambient light - lower to increase contrast and depth
    const ambient = new THREE.AmbientLight(0xfff8f0, 0.5);
    this.scene.add(ambient);
    this.emitterLights.push(ambient);

    // Key light - warm window light from upper right (matching background)
    const keyLight = new THREE.PointLight(0xfff4e8, 1.2, 0, 0);
    keyLight.position.set(2.5, 3, -2);
    this.scene.add(keyLight);
    this.emitterLights.push(keyLight);

    // Fill light from front-left - softer to maintain shadows
    const fillLight = new THREE.PointLight(0xffffff, 0.3, 0, 0);
    fillLight.position.set(-2, 1, 3);
    this.scene.add(fillLight);
    this.emitterLights.push(fillLight);

    // Subtle front fill for wood base readability
    const frontFill = new THREE.PointLight(0xfff8f0, 0.25, 0, 0);
    frontFill.position.set(0, -0.3, 3);
    this.scene.add(frontFill);
    this.emitterLights.push(frontFill);

    // Rim/back light - warm golden tint for edge definition, matching window light
    const rimLight = new THREE.PointLight(0xffe4c0, 1.0, 0, 0);  // Warmer, stronger
    rimLight.position.set(-1.5, 2, -3);
    this.scene.add(rimLight);
    this.emitterLights.push(rimLight);

    // Secondary rim from opposite side - warm amber tint
    const rimLight2 = new THREE.PointLight(0xffd8a8, 0.6, 0, 0);  // Warmer amber
    rimLight2.position.set(2, 1, -2.5);
    this.scene.add(rimLight2);
    this.emitterLights.push(rimLight2);
  }

  /**
   * Setup dynamic environment mapping from the mascot scene
   * Creates a cube camera that captures the crystal/particles for reflections
   *
   * NOTE: Environment mapping disabled - causes render errors when capturing
   * the main scene which has DirectionalLights with problematic targets.
   * Using static background HDRI instead.
   */
  _setupEnvironmentMapping() {
    // Dynamic cube camera disabled - causes render errors
    // Load static background as environment for ambient lighting instead
    this._loadBackgroundHDRI();
  }

  /**
   * Load background image as environment map for scene ambient lighting
   * This gives the emitter accurate color tones from the room
   */
  _loadBackgroundHDRI() {
    const textureLoader = new THREE.TextureLoader();
    // Derive assets root from basePath (e.g., '/emotive-holo/assets/models/emitter' -> '/emotive-holo/assets')
    const assetsRoot = this.options.basePath.replace(/\/models\/emitter$/, '');
    textureLoader.load(`${assetsRoot}/backgrounds/living-room.jpg`, (texture) => {
      // Set up as equirectangular environment
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;

      // Store for blending with dynamic cube map
      this._backgroundEnvMap = texture;

      console.log('Background environment map loaded');
    });
  }

  /**
   * Update environment map - disabled for now
   * Dynamic cube camera capture causes render errors with the main scene's lights
   */
  updateEnvironmentMap() {
    // No-op - using static HDRI instead of dynamic capture
    // Apply background env map to materials once loaded
    if (this._backgroundEnvMap && !this._envMapReady && this.mesh) {
      this._applyEnvironmentToMaterials();
      this._envMapReady = true;
    }
  }

  /**
   * Apply the environment map to all emitter materials
   * Using static background HDRI for ambient reflections
   */
  _applyEnvironmentToMaterials() {
    if (!this.mesh || !this._backgroundEnvMap) return;

    this.mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.envMap = this._backgroundEnvMap;
        // Higher intensity for visible reflections
        child.material.envMapIntensity = 1.2;
        child.material.needsUpdate = true;
      }
    });

    console.log('Background environment map applied to emitter');
  }

  /**
   * Get the environment map texture for sharing with other objects
   * @returns {THREE.Texture|null}
   */
  getEnvironmentMap() {
    return this._backgroundEnvMap || null;
  }

  /**
   * Create the holographic beam effect
   * A lazy, atmospheric projection with waving caustics
   * Beam spreads wide and fades before reaching the geometry
   */
  _createBeamEffect() {
    // Create container for all beam elements
    this.beamGroup = new THREE.Group();
    // No layer restriction - emitter has its own scene

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
        opacity: { value: 0.72 }  // Increased for better visibility
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
    // No layer restriction - emitter has its own scene
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
    // No layer restriction - emitter has its own scene
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
    // No layer restriction - emitter has its own scene
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
    // No layer restriction - emitter has its own scene
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
      // Setup Draco decoder for compressed GLB
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

      const gltfLoader = new GLTFLoader();
      gltfLoader.setDRACOLoader(dracoLoader);

      gltfLoader.load(
        `${this.options.basePath}/emitter.glb`,
        (gltf) => {
          this.mesh = gltf.scene;

          // Extract diffuse texture from GLB for custom shader material
          let diffuseTexture = null;
          let bumpTexture = null;

          this.mesh.traverse((child) => {
            if (child.isMesh && child.material) {
              if (child.material.map) {
                diffuseTexture = child.material.map;
                // Enable anisotropic filtering for sharper textures
                diffuseTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
                diffuseTexture.minFilter = THREE.LinearMipmapLinearFilter;
                diffuseTexture.magFilter = THREE.LinearFilter;
                diffuseTexture.generateMipmaps = true;
                diffuseTexture.colorSpace = THREE.SRGBColorSpace;
              }
              // GLB may have normal/bump map embedded
              if (child.material.bumpMap) {
                bumpTexture = child.material.bumpMap;
              } else if (child.material.normalMap) {
                // Use normal map as fallback if no bump map
                bumpTexture = child.material.normalMap;
              }
            }
          });

          // Create PBR material with per-pixel material differentiation
          const pbrMaterial = new THREE.MeshStandardMaterial({
            map: diffuseTexture,
            bumpMap: bumpTexture,
            bumpScale: bumpTexture ? 0.57 : 0,  // Visible bump for wood grain texture
            roughness: 0.5,
            metalness: 0.1,
            envMapIntensity: 1.2  // Higher for visible reflections
          });

          // Custom shader modification for per-pixel material properties
          // Gold regions (high saturation yellow/orange) get metallic look
          // Dark regions (wood) get high roughness
          // Light regions (ceramic/porcelain) get medium glossy finish
          pbrMaterial.onBeforeCompile = (shader) => {
            // Add uniforms for material differentiation
            shader.uniforms.goldThreshold = { value: 0.4 };

            // Insert code before the roughnessFactor calculation
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <roughnessmap_fragment>',
              `
              #include <roughnessmap_fragment>

              // Get diffuse color for material classification
              vec3 texColor = texture2D(map, vMapUv).rgb;

              // Calculate luminance and saturation
              float lum = dot(texColor, vec3(0.299, 0.587, 0.114));
              float maxC = max(max(texColor.r, texColor.g), texColor.b);
              float minC = min(min(texColor.r, texColor.g), texColor.b);
              float sat = (maxC - minC) / (maxC + 0.001);

              // Detect gold: high saturation, warm hue (R > G > B)
              bool isGold = sat > 0.3 && texColor.r > texColor.g * 0.9 && texColor.g > texColor.b * 1.2;

              // Detect wood: darker, desaturated brown tones
              bool isWood = lum < 0.35 && sat < 0.5 && texColor.r > texColor.b;

              // Detect ceramic/porcelain: lighter, low saturation (relaxed threshold)
              bool isCeramic = lum > 0.4 && sat < 0.35;

              // Apply material properties based on surface type
              if (isGold) {
                roughnessFactor = 0.25;  // Shiny gold
              } else if (isWood) {
                roughnessFactor = 0.4;   // Polished lacquered wood
              } else if (isCeramic) {
                roughnessFactor = 0.3;   // Glossy ceramic
              }
              `
            );

            // Lighten wood regions by boosting diffuse color
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <color_fragment>',
              `
              #include <color_fragment>

              // Lighten wood base color for better visibility
              vec3 colorTexColor = texture2D(map, vMapUv).rgb;
              float colorLum = dot(colorTexColor, vec3(0.299, 0.587, 0.114));
              float colorMaxC = max(max(colorTexColor.r, colorTexColor.g), colorTexColor.b);
              float colorMinC = min(min(colorTexColor.r, colorTexColor.g), colorTexColor.b);
              float colorSat = (colorMaxC - colorMinC) / (colorMaxC + 0.001);

              // Detect wood regions and lighten them
              bool isWoodColor = colorLum < 0.35 && colorSat < 0.5 && colorTexColor.r > colorTexColor.b;
              if (isWoodColor) {
                // Lighten wood by 15% with warm tint
                diffuseColor.rgb *= 1.15;
                diffuseColor.rgb += vec3(0.03, 0.015, 0.005);  // Warm highlight
              }
              `
            );

            // Modify metalness based on surface type
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <metalnessmap_fragment>',
              `
              #include <metalnessmap_fragment>

              // Re-calculate surface type for metalness
              vec3 texColorMetal = texture2D(map, vMapUv).rgb;
              float satMetal = (max(max(texColorMetal.r, texColorMetal.g), texColorMetal.b) -
                               min(min(texColorMetal.r, texColorMetal.g), texColorMetal.b)) /
                               (max(max(texColorMetal.r, texColorMetal.g), texColorMetal.b) + 0.001);

              bool isGoldMetal = satMetal > 0.3 && texColorMetal.r > texColorMetal.g * 0.9 && texColorMetal.g > texColorMetal.b * 1.2;

              if (isGoldMetal) {
                metalnessFactor = 0.85;  // Highly metallic gold
              } else {
                metalnessFactor = 0.0;   // Non-metallic for wood/ceramic
              }
              `
            );

            // Store shader reference for live updates
            pbrMaterial.userData.shader = shader;
          };

          // Store material reference for slider updates
          this._emitterMaterial = pbrMaterial;
          this._meshMaterials = [];

          // Apply the material to all meshes
          this.mesh.traverse((child) => {
            if (child.isMesh) {
              const mat = pbrMaterial.clone();
              // Create a custom onBeforeCompile that stores the shader ref
              mat.onBeforeCompile = (shader) => {
                pbrMaterial.onBeforeCompile(shader);
                mat.userData.shader = shader;
              };
              child.material = mat;
              this._meshMaterials.push(mat);
            }
          });

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

          // Add to scene
          this.scene.add(this.mesh);

          // Initialize the emitter camera at a reasonable default distance
          // This will be overridden by setCameraDistance() from layout-scaler
          // The emitter scene is small, so camera needs to be relatively close
          this._baseCameraZ = 3.0;  // Default - will be set by layoutScaler
          this._initialMainCameraZ = this._baseCameraZ;
          this.emitterCamera.position.set(0, 0, this._baseCameraZ);
          this.emitterCamera.lookAt(0, 0, 0);

          // Create the holographic beam effect
          this._createBeamEffect();

          // Setup dynamic environment mapping from mascot scene
          this._setupEnvironmentMapping();

          console.log('Emitter base loaded from GLB');
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
          console.error('Error loading emitter GLB:', error);
          reject(error);
        }
      );
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

    // Update dynamic environment map (captures mascot for reflections)
    this.updateEnvironmentMap();

    // Update beam animation (assume ~60fps = 16ms per frame)
    this._updateBeam(0.016);

    // Render emitter scene on top of main scene
    // Must disable ALL auto-clearing to preserve the main scene's render
    const autoClearWas = this.renderer.autoClear;
    const autoClearColorWas = this.renderer.autoClearColor;
    const autoClearDepthWas = this.renderer.autoClearDepth;
    const autoClearStencilWas = this.renderer.autoClearStencil;

    this.renderer.autoClear = false;
    this.renderer.autoClearColor = false;
    this.renderer.autoClearDepth = false;
    this.renderer.autoClearStencil = false;

    // Clear only the depth buffer so emitter renders on top correctly
    this.renderer.clearDepth();

    this.renderer.render(this.scene, this.emitterCamera);

    // Restore original settings
    this.renderer.autoClear = autoClearWas;
    this.renderer.autoClearColor = autoClearColorWas;
    this.renderer.autoClearDepth = autoClearDepthWas;
    this.renderer.autoClearStencil = autoClearStencilWas;
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
   * Set the emitter camera distance (Z position)
   * Controls how large the emitter/phone appear on screen
   * Smaller distance = closer camera = larger apparent size
   * @param {number} distance - Camera Z distance
   */
  setCameraDistance(distance) {
    if (this.emitterCamera) {
      this._baseCameraZ = distance;
      this.emitterCamera.position.z = distance;
      this.emitterCamera.lookAt(0, 0, 0);
      console.log('Emitter camera distance set to:', distance);
    }
  }

  /**
   * Set camera view offset to match main camera positioning
   * @param {number} fullWidth - Full canvas width
   * @param {number} fullHeight - Full canvas height
   * @param {number} offsetX - X offset for view
   * @param {number} offsetY - Y offset for view
   * @param {number} width - View width
   * @param {number} height - View height
   */
  setViewOffset(fullWidth, fullHeight, offsetX, offsetY, width, height) {
    if (this.emitterCamera) {
      this.emitterCamera.setViewOffset(fullWidth, fullHeight, offsetX, offsetY, width, height);
    }
  }

  /**
   * Clear camera view offset
   */
  clearViewOffset() {
    if (this.emitterCamera) {
      this.emitterCamera.clearViewOffset();
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

    // Clean up environment mapping
    if (this.cubeCamera) {
      this.scene.remove(this.cubeCamera);
      this.cubeCamera = null;
    }
    if (this.cubeRenderTarget) {
      this.cubeRenderTarget.dispose();
      this.cubeRenderTarget = null;
    }
    if (this._backgroundEnvMap) {
      this._backgroundEnvMap.dispose();
      this._backgroundEnvMap = null;
    }

    // Clean up camera
    this.emitterCamera = null;
  }
}

export default EmitterBase;
