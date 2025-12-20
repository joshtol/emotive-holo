/**
 * Emo Holographic AI Assistant
 * Main orchestration module
 */

// Detect base path for assets (handles GitHub Pages /emotive-holo/ prefix)
const BASE_PATH = window.location.pathname.includes('/emotive-holo/') ? '/emotive-holo' : '';

import { EmotiveMascot3D } from '@joshtol/emotive-engine/3d';
import { VoiceInput } from './voice-input.js';
import { ClaudeClient } from './claude-client.js';
import { NativeTTS } from './native-tts.js';
import { MeditationController } from './meditation.js';
import { GeometryCarousel } from './carousel.js';
import { EmitterBase } from './emitter-base.js';
import { HoloPhone } from './holo-phone.js';
import { layoutScaler } from './layout-scaler.js';
import { StoryDirector } from './story-director.js';
import { TutorialController } from './tutorial.js';
import './shadow-debug.js'; // Auto-inits if ?shadow-debug=contact|core|penumbra in URL

class EmoAssistant {
  constructor() {
    // State
    this.state = 'idle'; // idle, listening, thinking, speaking, meditation, carousel, tutorial
    this.currentGeometry = 'crystal';
    this.mascot = null;

    // Idle revert timer - returns to calm state after activity
    this._idleRevertTimer = null;
    this._captionHideTimer = null;
    this.IDLE_REVERT_DELAY = 8000;  // 8 seconds to return to calm
    this.CAPTION_HIDE_DELAY = 6000; // 6 seconds before hiding caption

    // Manual selection flag - prevents auto-revert when user deliberately chooses something
    this._userManualSelection = false;

    // User-requested emotion flag - prevents emotion revert when user explicitly asked for it
    this._userRequestedEmotion = false;

    // Modules
    this.voiceInput = null;
    this.claude = null;
    this.tts = null;
    this.meditation = null;
    this.carousel = null;
    this.storyDirector = null;
    this.tutorial = null;

    // DOM elements
    this.elements = {
      container: document.getElementById('mascot-container'),
      caption: document.getElementById('caption'),
      status: document.getElementById('status'),
      voiceIndicator: document.getElementById('voice-indicator'),
      // Holographic phone display
      holoPhone: document.getElementById('holo-phone'),
      screenText: document.querySelector('#holo-phone .screen-text'),
      // Response progress bar
      responseProgress: document.getElementById('response-progress'),
      responseProgressFill: document.querySelector('#response-progress .progress-fill'),
      // Floating carousel title (holographic projection above emitter)
      carouselTitle: document.getElementById('carousel-title'),
      carouselTitleName: document.querySelector('#carousel-title .title-name'),
      carouselTitleVariant: document.querySelector('#carousel-title .title-variant')
    };

    // AbortController for cancelling in-flight requests
    this._abortController = null;

    // Default screen text
    this.DEFAULT_SCREEN_TEXT = 'Hold to speak';

    // Phone touch overlay reference (created in setupEventListeners)
    this._phoneOverlay = null;

    // Carousel slider drag state
    this._carouselSliderDragging = false;
    this._carouselSliderRegion = null;
  }

  async init() {
    console.log('Initializing Emo Assistant...');

    // Initialize layout scaler for consistent proportions across resolutions
    layoutScaler.init();
    const layout3D = layoutScaler.get3DParams();

    // Check if tutorial should show - if so, start with 'rough' geometry
    const tutorialCheck = new TutorialController({ mascot: null, carousel: null, holoPhone: null, onComplete: () => {} });
    if (tutorialCheck.shouldShow()) {
      this.currentGeometry = 'rough';
    }

    // Initialize 3D mascot with multiplexer material for shader effects
    this.mascot = new EmotiveMascot3D({
      coreGeometry: this.currentGeometry,
      enableParticles: true,
      enablePostProcessing: true,
      enableControls: true,
      autoRotate: true,
      cameraDistance: layout3D.cameraDistance,
      fov: 45,
      enableBlinking: true,
      enableBreathing: true,
      targetFPS: 60,
      backgroundColor: 0x000000,
      materialVariant: 'multiplexer',  // Required for crystal presets, moon phases, eclipses
      assetBasePath: `${BASE_PATH}/assets`  // Path to OBJ models and textures
    });

    await this.mascot.init(this.elements.container);
    this.mascot.start();

    // Keep OrbitControls target at origin (where mascot is) so rotation keeps mascot centered
    // Shift target to adjust mascot vertical position on screen
    // Negative Y = mascot appears higher, Positive Y = mascot appears lower
    const controls = this.mascot.core3D?.renderer?.controls;
    if (controls) {
      // Desktop: shift down (-0.15) so mascot renders higher
      // Mobile: shift down (-0.12) to raise mascot slightly above emitter
      const targetY = layoutScaler.isMobile ? -0.12 : -0.15;
      controls.target.set(0, targetY, 0);
      controls.update();
    }

    // Shift camera view to position scene at layout center (67% on desktop, 50% on mobile)
    // This allows full viewport rendering while keeping the scene positioned correctly
    const camera = this.mascot.core3D?.renderer?.camera;
    if (camera && !layoutScaler.isMobile) {
      const width = window.innerWidth;
      const height = window.innerHeight;
      // Offset X: shift view left so scene appears at 67% instead of 50%
      // (67% - 50%) * width = 17% * width shift
      const offsetX = (0.5 - layoutScaler.desktop.centerX / 100) * width;
      camera.setViewOffset(width, height, offsetX, 0, width, height);

      // Update view offset on resize (also updates emitter camera if present)
      this._viewOffsetHandler = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const ox = (0.5 - layoutScaler.desktop.centerX / 100) * w;
        camera.setViewOffset(w, h, ox, 0, w, h);
        // Also update emitter camera if it exists
        if (this.emitterBase) {
          this.emitterBase.setViewOffset(w, h, ox, 0, w, h);
        }
      };
      window.addEventListener('resize', this._viewOffsetHandler);
    }

    // Initialize 3D emitter base (add to mascot's THREE.js scene)
    // The emitter renders on a separate layer with its own fixed camera
    // so it's completely independent of OrbitControls
    const scene = this.mascot.core3D?.renderer?.scene;
    const mainCamera = this.mascot.core3D?.renderer?.camera;
    const renderer = this.mascot.core3D?.renderer?.renderer;
    if (scene && mainCamera && renderer) {
      // Enable ACES Filmic tone mapping for better HDR handling
      // This gives more realistic color response and prevents blown highlights
      const THREE = await import('three');
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;  // Balanced exposure for realistic colors
      // Emitter uses realistic proportions from layout scaler
      this.emitterBase = new EmitterBase(scene, mainCamera, renderer, {
        basePath: `${BASE_PATH}/assets/models/emitter`,
        scale: layout3D.emitterScale,
        position: { x: 0, y: layout3D.emitterY, z: 0 },
        rotation: { x: 0, y: 0, z: 0 }
      });
      await this.emitterBase.load();

      // Initialize 3D phone display in the emitter's scene
      // Phone in front of emitter, resting on gold lip, tilted 5 deg away from camera
      // Scale phone proportionally to emitter (0.25 was tuned for desktop emitterScale 0.32)
      const phoneScaleRatio = layout3D.emitterScale / 0.32;
      const phoneZRatio = phoneScaleRatio; // Z position also scales with emitter
      this.holoPhone3D = new HoloPhone(this.emitterBase.scene, mainCamera, renderer, {
        basePath: `${BASE_PATH}/assets/models/phone`,
        // Phone should be roughly 5-6 inches wide (landscape), close to emitter base width
        scale: 0.25 * phoneScaleRatio,
        // Phone sits on the gold shelf, leaning back against the emitter body
        // Z controls distance from emitter center, Y sets vertical position
        // Phone top edge touches emitter side while angled
        position: { x: 0, y: layout3D.emitterY + 0.06 * phoneScaleRatio, z: 0.28 * phoneZRatio },
        // Landscape (Z=PI/2), tilted back to lean against emitter (negative X tilts top toward emitter)
        rotation: { x: -0.18, y: 0, z: Math.PI / 2 }
      });
      await this.holoPhone3D.load();

      // Share environment map from emitter to phone for PBR reflections
      // Check periodically since env map loads asynchronously
      const shareEnvMap = () => {
        const envMap = this.emitterBase.getEnvironmentMap();
        if (envMap) {
          this.holoPhone3D.setEnvironmentMap(envMap);
          console.log('Environment map shared with phone');
        } else {
          // Check again in 100ms if not ready
          setTimeout(shareEnvMap, 100);
        }
      };
      shareEnvMap();

      // Hide CSS phone element since we're using 3D now
      if (this.elements.holoPhone) {
        this.elements.holoPhone.style.display = 'none';
      }

      // Connect emitter to layoutScaler for dynamic shadow sizing
      // This allows shadows to scale proportionately to the actual rendered emitter
      layoutScaler.setEmitter(this.emitterBase);

      // Also shift emitter camera up on desktop to match main camera offset
      if (!layoutScaler.isMobile && this.emitterBase.emitterCamera) {
        this.emitterBase.emitterCamera.position.y -= 0.15;

        // Apply same view offset as main camera so emitter renders at 67% position
        const width = window.innerWidth;
        const height = window.innerHeight;
        const offsetX = (0.5 - layoutScaler.desktop.centerX / 100) * width;
        this.emitterBase.setViewOffset(width, height, offsetX, 0, width, height);
      }

      // Hook into the mascot's render loop to render emitter after main scene
      // We need to render the emitter AFTER the main scene renders
      const originalRender = this.mascot.core3D.renderer.render.bind(this.mascot.core3D.renderer);
      this.mascot.core3D.renderer.render = (params) => {
        // Render main scene first
        originalRender(params);
        // Update and render 3D phone
        if (this.holoPhone3D) {
          this.holoPhone3D.update(0.016);
        }
        // Then render emitter on top with fixed camera
        if (this.emitterBase) {
          this.emitterBase.render();
        }
      };
    }

    // Listen for layout scale changes to update shadows
    window.addEventListener('layoutscale', () => {
      layoutScaler.updateShadows();
    });
    // Initial shadow update - now with emitter bounds available
    layoutScaler.updateShadows();

    // Also update shadows after a short delay to ensure 3D is fully rendered
    // This gives us accurate emitter bounds for shadow positioning
    setTimeout(() => {
      layoutScaler.updateShadows();
      // Debug: log phone screen bounds
      if (this.holoPhone3D && this.emitterBase?.emitterCamera) {
        const bounds = this.holoPhone3D.getScreenBounds(this.emitterBase.emitterCamera);
        console.log('Phone screen bounds:', bounds);

        // Show debug overlay if ?phone-touch-debug is in URL
        if (window.location.search.includes('phone-touch-debug')) {
          this._showPhoneBoundsDebug(bounds);
        }
      }
    }, 100);

    // Set initial calm state
    this.mascot.feel('calm, gentle breathing');

    // Initialize modules
    this.voiceInput = new VoiceInput();
    this.claude = new ClaudeClient();
    this.tts = new NativeTTS(this.mascot);
    // Pass holoPhone3D to meditation so it can update the display
    this.meditation = new MeditationController(this.mascot, this.tts, this.elements, this.holoPhone3D);
    // Pass holoPhone3D to carousel so it can render on the phone screen
    this.carousel = new GeometryCarousel(this.mascot, this.elements.container, this.holoPhone3D);
    // StoryDirector for inline story directives
    this.storyDirector = new StoryDirector(this.mascot);

    // Wire up carousel state change to sync main state
    this.carousel.onStateChange = (carouselState) => {
      if (carouselState === 'carousel') {
        this.setState('carousel');
        // Show floating holographic title (also needed for tutorial)
        if (this.elements.carouselTitle) {
          this.elements.carouselTitle.classList.remove('hidden');
        }
      } else if (carouselState === 'idle' && this.state === 'carousel') {
        this.setState('idle');
        this.resetScreen();
        // Hide floating holographic title
        if (this.elements.carouselTitle) {
          this.elements.carouselTitle.classList.add('hidden');
        }
      }
    };

    // Wire up floating holographic title updates
    this.carousel.onTitleChange = (data) => {
      if (data && data.name) {
        this._updateCarouselTitle(data.name, data.variant);
      }
    };

    // Wire up TTS progress tracking - update 3D phone progress bar
    this.tts.onProgress = (progress) => {
      if (this.holoPhone3D) {
        this.holoPhone3D.setProgress(progress);
      }
    };

    // Wire up TTS character position to StoryDirector for inline directives
    this.tts.onCharPosition = (charIndex) => {
      if (this.storyDirector) {
        this.storyDirector.updateProgress(charIndex);
      }
    };

    // Wire up CC-style chunk display - shows 2-3 lines, advances when TTS catches up
    this.tts.onChunkChange = (chunkText) => {
      if (this.state === 'speaking') {
        // Update 3D phone display with current chunk
        if (this.holoPhone3D) {
          this.holoPhone3D.setText(chunkText);
        }
        // Also update CSS phone as fallback
        if (this.elements.screenText) {
          this.elements.screenText.textContent = chunkText;
        }
      }
    };

    // Setup event listeners
    this.setupEventListeners();

    // Initialize tutorial controller
    this.tutorial = new TutorialController({
      mascot: this.mascot,
      carousel: this.carousel,
      holoPhone: this.holoPhone3D,
      onComplete: () => {
        console.log('Tutorial complete, resuming normal operation');
        this.setState('idle');
      }
    });

    // Show ready state
    this.setStatus('Ready');
    setTimeout(() => this.setStatus(''), 2000);

    console.log('Emo Assistant initialized');

    // Check if we should show the tutorial (first visit)
    if (this.tutorial.shouldShow()) {
      // Delay slightly to let everything settle
      setTimeout(() => {
        this.setState('tutorial');
        this.tutorial.start();
      }, 1500);
    }
  }

  setupEventListeners() {
    // Push to talk - create an overlay div for the phone region
    // This intercepts events before they reach the canvas/OrbitControls
    const phoneOverlay = document.createElement('div');
    phoneOverlay.id = 'phone-touch-overlay';
    phoneOverlay.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 30vh;
      z-index: 1000;
      touch-action: none;
      cursor: pointer;
    `;
    document.body.appendChild(phoneOverlay);
    this._phoneOverlay = phoneOverlay;
    console.log('Phone overlay created and added to body');

    // Mouse events on overlay
    phoneOverlay.addEventListener('mousedown', (e) => {
      console.log('MOUSEDOWN on overlay, state:', this.state);
      e.preventDefault();
      e.stopPropagation();

      // Route to carousel if in carousel state
      if (this.state === 'carousel') {
        this._handleCarouselTouch(e.clientX, e.clientY, 'start');
        return;
      }

      // Cancel meditation on click
      if (this.state === 'meditation') {
        console.log('Cancelling meditation via click');
        this.tts.stop();
        this.meditation.stop();
        this.setState('idle');
        return;
      }

      // Check for speaking/processing state cancel button
      if (this.state === 'speaking' || this.state === 'processing') {
        this._handleSpeakingTouch(e.clientX, e.clientY);
        return;
      }

      this.startListening();
    });

    phoneOverlay.addEventListener('mousemove', (e) => {
      // Handle carousel slider drag
      if (this.state === 'carousel' && this._carouselSliderDragging) {
        e.preventDefault();
        this._handleCarouselSliderDrag(e.clientX, e.clientY);
      }
    });

    phoneOverlay.addEventListener('mouseup', (e) => {
      console.log('MOUSEUP on overlay');

      // End carousel slider drag
      if (this._carouselSliderDragging) {
        this._carouselSliderDragging = false;
        this._carouselSliderRegion = null;
        return;
      }

      if (this.state === 'listening') this.stopListening();
    });

    phoneOverlay.addEventListener('mouseleave', () => {
      if (this._carouselSliderDragging) {
        this._carouselSliderDragging = false;
        this._carouselSliderRegion = null;
      }
      if (this.state === 'listening') this.stopListening();
    });

    // Touch events on overlay
    phoneOverlay.addEventListener('touchstart', (e) => {
      console.log('TOUCHSTART on overlay, touches:', e.touches.length, 'state:', this.state);
      e.preventDefault();
      e.stopPropagation();

      // Route to carousel if in carousel state
      if (this.state === 'carousel') {
        const touch = e.touches[0];
        this._handleCarouselTouch(touch.clientX, touch.clientY, 'start');
        return;
      }

      // Cancel meditation on touch
      if (this.state === 'meditation') {
        console.log('Cancelling meditation via touch');
        this.tts.stop();
        this.meditation.stop();
        this.setState('idle');
        return;
      }

      // Check for speaking/processing state cancel button
      if (this.state === 'speaking' || this.state === 'processing') {
        const touch = e.touches[0];
        this._handleSpeakingTouch(touch.clientX, touch.clientY);
        return;
      }

      this.startListening();
    }, { passive: false });

    phoneOverlay.addEventListener('touchmove', (e) => {
      // Handle carousel slider drag
      if (this.state === 'carousel' && this._carouselSliderDragging) {
        e.preventDefault();
        const touch = e.touches[0];
        this._handleCarouselSliderDrag(touch.clientX, touch.clientY);
      }
    }, { passive: false });

    phoneOverlay.addEventListener('touchend', (e) => {
      console.log('TOUCHEND on overlay, state:', this.state);
      e.preventDefault();

      // End carousel slider drag
      if (this._carouselSliderDragging) {
        this._carouselSliderDragging = false;
        this._carouselSliderRegion = null;
        return;
      }

      if (this.state === 'listening') this.stopListening();
    }, { passive: false });

    phoneOverlay.addEventListener('touchcancel', (e) => {
      console.log('TOUCHCANCEL on overlay');
      e.preventDefault();
      this._carouselSliderDragging = false;
      this._carouselSliderRegion = null;
      if (this.state === 'listening') this.stopListening();
    }, { passive: false });

    // Fallback: CSS phone element (if still visible)
    if (this.elements.holoPhone) {
      this.elements.holoPhone.addEventListener('mousedown', () => this.startListening());
      this.elements.holoPhone.addEventListener('mouseup', () => this.stopListening());
      this.elements.holoPhone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.startListening();
      }, { passive: false });
      this.elements.holoPhone.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.stopListening();
      }, { passive: false });
    }

    // Keyboard shortcut (spacebar for voice, escape to cancel)
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat && this.state === 'idle') {
        e.preventDefault();
        this.startListening();
      }
      // Escape key cancels meditation or current operation
      if (e.code === 'Escape') {
        e.preventDefault();
        if (this.state === 'meditation') {
          this.meditation.stop();
          this.setState('idle');
        } else {
          this.cancelCurrentOperation();
        }
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && this.state === 'listening') {
        e.preventDefault();
        this.stopListening();
      }
    });

    // Click on mascot to open carousel
    this.elements.container.addEventListener('click', () => {
      if (this.state === 'idle') {
        this.openCarousel();
      }
    });

    // Carousel selection callback
    this.carousel.onSelect = (geometry, variant) => {
      this.currentGeometry = geometry;
      this._userManualSelection = true;  // User manually selected - don't auto-revert
      this.closeCarousel();
    };

    // Meditation end callback
    this.meditation.onEnd = () => {
      this.setState('idle');
    };

    // Voice input result
    this.voiceInput.onResult = (transcript) => {
      this.handleVoiceInput(transcript);
    };

    // Voice input error
    this.voiceInput.onError = (error) => {
      console.error('Voice input error:', error);
      // Show more helpful error messages
      if (error === 'not-allowed' || error === 'permission-denied') {
        this.setScreen('Microphone access denied', '');
      } else if (error === 'not-supported') {
        this.setScreen('Voice not supported', '');
      } else {
        this.setScreen('Voice error: ' + error, '');
      }
      this.setState('idle');
      // Schedule screen to revert to default
      this.scheduleScreenRevert();
    };

  }

  startListening() {
    console.log('startListening called, current state:', this.state);
    if (this.state !== 'idle') {
      console.log('Not idle, ignoring startListening');
      return;
    }

    // Clear any pending revert timers - user is actively interacting
    this.clearIdleRevert();
    this.clearScreenRevert();

    // Reset manual selection flag - voice interactions should auto-revert
    this._userManualSelection = false;
    // Note: Don't reset _userRequestedEmotion here - preserve user's emotional state
    // It will be cleared only if the new response doesn't include a feel directive

    this.setState('listening');
    if (this.elements.holoPhone) {
      this.elements.holoPhone.classList.add('listening');
    }
    // Add blur to background
    document.getElementById('hologram-container')?.classList.add('listening-active');

    // Update screen state (3D phone shows listening animation)
    this.setScreen('Listening...', 'listening');

    // Only set attentive emotion if user hasn't requested a persistent emotion
    if (!this._userRequestedEmotion) {
      this.mascot.feel('attentive, alert');
    }

    // Start voice recognition
    console.log('Starting voice input...');
    try {
      this.voiceInput.start();
    } catch (e) {
      console.error('Exception starting voice:', e);
      this.setScreen('Voice failed: ' + e.message, '');
      this.setState('idle');
      this.scheduleScreenRevert();
    }
  }

  stopListening() {
    console.log('stopListening called, current state:', this.state);
    if (this.state !== 'listening') {
      console.log('Not in listening state, ignoring stopListening');
      return;
    }

    // Transition to processing state while waiting for recognition result
    this.setState('processing');
    if (this.elements.holoPhone) {
      this.elements.holoPhone.classList.remove('listening');
    }
    // Remove blur from background
    document.getElementById('hologram-container')?.classList.remove('listening-active');

    console.log('Stopping voice input...');
    this.voiceInput.stop();

    // Update screen
    this.setScreen('Processing...', '');

    // Set a timeout to reset to idle if no result comes
    this._processingTimeout = setTimeout(() => {
      if (this.state === 'processing') {
        console.log('Processing timeout, resetting to idle');
        this.setState('idle');
        this.resetScreen();
        // Only reset emotion if user hasn't requested a persistent one
        if (!this._userRequestedEmotion) {
          this.mascot.feel('neutral, settle');
        }
      }
    }, 3000);
  }

  async handleVoiceInput(transcript) {
    // Clear processing timeout since we got a result
    if (this._processingTimeout) {
      clearTimeout(this._processingTimeout);
      this._processingTimeout = null;
    }

    if (!transcript.trim()) {
      this.setState('idle');
      this.resetScreen();
      // Only reset emotion if user hasn't requested a persistent one
      if (!this._userRequestedEmotion) {
        this.mascot.feel('neutral, settle');
      }
      return;
    }

    console.log('User said:', transcript);
    this.setState('thinking');
    this.setScreen('Thinking...', '');
    // Only set thinking emotion if user hasn't requested a persistent one
    if (!this._userRequestedEmotion) {
      this.mascot.feel('focused, orbit');
    }

    try {
      // Get response from Claude
      const response = await this.claude.chat(transcript);
      console.log('Claude response:', response);

      // Parse response for all directives
      const { text, feel, morph, startMeditation, toggles, preset, undertone, chain, camera } = this.parseResponse(response);

      // Check for meditation mode
      if (startMeditation || this.isMeditationRequest(transcript)) {
        // Detect box breathing request
        const isBoxBreathing = this.isBoxBreathingRequest(transcript);
        this.meditation.setPattern(isBoxBreathing ? 'box' : 'default');

        // Parse inline directives from meditation intro text
        this.storyDirector.reset();
        const cleanMeditationText = this.storyDirector.parse(text);

        // Apply any initial directives (morph, preset, feel from response)
        if (morph && this.mascot.morphTo) {
          this.mascot.morphTo(morph);
        }
        if (preset && this.mascot.setSSSPreset) {
          this.mascot.setSSSPreset(preset);
        }
        if (feel) this.mascot.feel(feel);

        // Set up TTS progress tracking for inline directives
        this.tts.onCharPosition = (charIndex) => {
          this.storyDirector.updateProgress(charIndex);
        };

        // Use 'speaking' state so onChunkChange callback updates the display
        // (meditation state is set after intro TTS completes)
        this.setState('speaking');
        this.setScreen('', 'speaking');  // TTS onChunkChange will populate chunks
        await this.tts.speak(cleanMeditationText);

        // Trigger any remaining directives
        this.storyDirector.triggerRemaining();
        // Note: Don't nullify onCharPosition - it's set once at init and reused for stories

        // Now enter meditation mode for the breathing exercises
        this.setState('meditation');
        this.meditation.start();
        return;
      }

      // Normal response flow
      this.setState('speaking');

      // Parse inline story directives (strips them from text, schedules for playback)
      this.storyDirector.reset();
      const cleanText = this.storyDirector.parse(text);
      const hasInlineDirectives = this.storyDirector.hasDirectives();

      console.log('Setting screen text:', cleanText);
      // TTS will handle chunk display via onChunkChange callback
      // Just set speaking state, first chunk shown by TTS.speak()
      this.setScreen('', 'speaking');

      // Apply morph directive if present (end-of-response directive)
      if (morph && this.mascot.morphTo) {
        console.log('Morphing to:', morph);
        this.mascot.morphTo(morph);
        this.currentGeometry = morph;  // Track for auto-revert
      }

      // Apply feel directive (end-of-response directive)
      // Skip if we have inline directives - let StoryDirector handle emotions
      if (feel && !hasInlineDirectives) {
        this.mascot.feel(feel);
        // Mark as user-requested so it won't auto-revert
        this._userRequestedEmotion = true;
      } else if (!hasInlineDirectives) {
        // No feel directive and no inline directives - clear the persistent emotion flag
        this._userRequestedEmotion = false;
      }

      // Apply undertone if present
      if (undertone && this.mascot.updateUndertone) {
        console.log('Setting undertone:', undertone);
        this.mascot.updateUndertone(undertone);
      }

      // Apply toggle directives
      for (const toggle of toggles) {
        this.applyToggle(toggle.feature, toggle.enabled);
      }

      // Apply SSS preset if present
      if (preset && this.mascot.setSSSPreset) {
        console.log('Applying preset:', preset);
        this.mascot.setSSSPreset(preset);
      }

      // Apply gesture chain if present (skip if inline directives will handle it)
      if (chain && this.mascot.chain && !hasInlineDirectives) {
        console.log('Playing chain:', chain);
        this.mascot.chain(chain);
      }

      // Apply camera preset if present (skip during storytelling - camera changes are disorienting)
      if (camera && this.mascot.setCameraPreset && !hasInlineDirectives) {
        console.log('Setting camera:', camera);
        this.mascot.setCameraPreset(camera);
      }

      // Speak the response (progress bar is on 3D phone, updated via onProgress callback)
      // Use clean text with directives stripped
      await this.tts.speak(cleanText);

      // Trigger any remaining directives that weren't reached
      if (hasInlineDirectives) {
        this.storyDirector.triggerRemaining();
      }

      // Keep showing the last chunk of text (don't dump full text)
      // The phone will continue displaying whatever was last set via onChunkChange

      // Return to idle but keep emotional state for a bit
      this.setState('idle');

      // Schedule screen to revert to default and emotion to revert to calm
      this.scheduleScreenRevert();
      this.scheduleIdleRevert();

    } catch (error) {
      console.error('Error handling voice input:', error);
      this.setScreen('Something went wrong', '');
      this.setState('idle');
      this.mascot.feel('confused, shake');
      // Still schedule revert even on error
      this.scheduleScreenRevert();
      this.scheduleIdleRevert();
    }
  }

  parseResponse(response) {
    // Valid values for validation - MUST match what the engine supports
    const VALID_GEOMETRIES = ['crystal', 'moon', 'sun', 'heart', 'star', 'rough'];
    const VALID_EMOTIONS = ['neutral', 'joy', 'calm', 'love', 'excited', 'euphoria', 'sadness', 'anger', 'fear', 'surprise', 'disgust', 'focused', 'suspicion', 'resting', 'glitch'];
    const VALID_PRESETS = ['quartz', 'emerald', 'ruby', 'sapphire', 'amethyst', 'citrine'];
    const VALID_UNDERTONES = ['nervous', 'confident', 'sarcastic', 'hesitant', 'calm', 'clear'];
    const VALID_CHAINS = ['rise', 'flow', 'burst', 'drift', 'chaos', 'morph', 'rhythm', 'spiral', 'routine', 'radiance', 'twinkle', 'stream'];
    const VALID_CAMERAS = ['front', 'side', 'top', 'bottom', 'angle', 'back'];

    const lines = response.split('\n');
    let text = [];
    let feel = null;
    let morph = null;
    let startMeditation = false;
    let toggles = [];      // Array of { feature, enabled }
    let preset = null;     // SSS preset name
    let undertone = null;  // Emotional undertone
    let chain = null;      // Gesture chain name
    let camera = null;     // Camera preset

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('FEEL:')) {
        feel = trimmed.substring(5).trim();
      } else if (trimmed.startsWith('MORPH:')) {
        const requestedMorph = trimmed.substring(6).trim().toLowerCase();
        if (VALID_GEOMETRIES.includes(requestedMorph)) {
          morph = requestedMorph;
        } else {
          console.warn(`[parseResponse] Invalid geometry "${requestedMorph}" - valid: ${VALID_GEOMETRIES.join(', ')}`);
        }
      } else if (trimmed.startsWith('MEDITATION:')) {
        if (trimmed.includes('start')) {
          startMeditation = true;
        }
      } else if (trimmed.startsWith('TOGGLE:')) {
        // Parse: "TOGGLE: wobble off" or "TOGGLE: particles on"
        const toggleStr = trimmed.substring(7).trim().toLowerCase();
        const parts = toggleStr.split(/\s+/);
        if (parts.length >= 2) {
          const feature = parts[0];
          const enabled = parts[1] === 'on';
          toggles.push({ feature, enabled });
        }
      } else if (trimmed.startsWith('PRESET:')) {
        const requestedPreset = trimmed.substring(7).trim().toLowerCase();
        if (VALID_PRESETS.includes(requestedPreset)) {
          preset = requestedPreset;
        } else {
          console.warn(`[parseResponse] Invalid preset "${requestedPreset}" - valid: ${VALID_PRESETS.join(', ')}`);
        }
      } else if (trimmed.startsWith('UNDERTONE:')) {
        const requestedUndertone = trimmed.substring(10).trim().toLowerCase();
        if (VALID_UNDERTONES.includes(requestedUndertone)) {
          undertone = requestedUndertone;
        } else {
          console.warn(`[parseResponse] Invalid undertone "${requestedUndertone}" - valid: ${VALID_UNDERTONES.join(', ')}`);
        }
      } else if (trimmed.startsWith('CHAIN:')) {
        const requestedChain = trimmed.substring(6).trim().toLowerCase();
        if (VALID_CHAINS.includes(requestedChain)) {
          chain = requestedChain;
        } else {
          console.warn(`[parseResponse] Invalid chain "${requestedChain}" - valid: ${VALID_CHAINS.join(', ')}`);
        }
      } else if (trimmed.startsWith('CAMERA:')) {
        const requestedCamera = trimmed.substring(7).trim().toLowerCase();
        if (VALID_CAMERAS.includes(requestedCamera)) {
          camera = requestedCamera;
        } else {
          console.warn(`[parseResponse] Invalid camera "${requestedCamera}" - valid: ${VALID_CAMERAS.join(', ')}`);
        }
      } else if (trimmed) {
        // Filter out action descriptions like *morphs into...*
        if (!trimmed.startsWith('*') || !trimmed.endsWith('*')) {
          text.push(trimmed);
        }
      }
    }

    // Validate emotion in feel directive (first word before comma is the emotion)
    if (feel) {
      const emotionPart = feel.split(',')[0].trim().toLowerCase();
      if (!VALID_EMOTIONS.includes(emotionPart)) {
        console.warn(`[parseResponse] Invalid emotion "${emotionPart}" in FEEL - valid: ${VALID_EMOTIONS.join(', ')}`);
        // Don't nullify feel entirely - gesture part might still be valid
      }
    }

    return {
      text: text.join(' ') || 'Here you go!',
      feel,
      morph,
      startMeditation,
      toggles,
      preset,
      undertone,
      chain,
      camera
    };
  }

  isMeditationRequest(transcript) {
    const lower = transcript.toLowerCase();
    const keywords = [
      // Direct meditation requests
      'meditation', 'meditate', 'meditating',
      // Breathing related
      'breathing exercise', 'breathing exercises', 'breathe with me',
      'breathwork', 'deep breaths', 'take a breath', 'breathing',
      // Calm/relax requests
      'calm me', 'calm down', 'help me calm', 'calming',
      'relax', 'relaxation', 'help me relax', 'relaxing',
      // Stress/anxiety relief
      'stressed', 'anxious', 'anxiety', 'stress',
      'overwhelmed', 'panic', 'panicking',
      // Guide requests
      'guided breathing', 'guide me', 'mindfulness', 'mindful',
      // General wellness requests
      'center myself', 'find peace', 'need peace',
      'help me feel better', 'ground me', 'grounding'
    ];
    return keywords.some(kw => lower.includes(kw));
  }

  isBoxBreathingRequest(transcript) {
    const lower = transcript.toLowerCase();
    const keywords = [
      'box breathing', 'box breath',
      '4-4-4-4', '4 4 4 4',
      'square breathing', 'tactical breathing',
      'navy seal breathing'
    ];
    return keywords.some(kw => lower.includes(kw));
  }

  openCarousel() {
    // Clear timers when opening carousel
    this.clearIdleRevert();
    this.clearScreenRevert();

    // Don't hide the phone overlay - we need it for carousel touch events
    // The overlay touch handlers will route to carousel when in carousel state

    this.setState('carousel');
    // Screen is now controlled by carousel via holoPhone.setCarouselData()
    this.carousel.show();

    // Show floating holographic title
    if (this.elements.carouselTitle) {
      this.elements.carouselTitle.classList.remove('hidden');
    }
  }

  closeCarousel() {
    this.carousel.hide();
    this.setState('idle');
    this.resetScreen();

    // Hide floating holographic title
    if (this.elements.carouselTitle) {
      this.elements.carouselTitle.classList.add('hidden');
    }

    // Phone overlay stays visible - it's used for all touch interactions

    // Don't schedule idle revert if user manually selected something
    // They chose it deliberately, so keep it until they interact again
  }

  setState(newState) {
    this.state = newState;
    console.log('State:', newState);

    // Clear status on idle
    if (newState === 'idle') {
      this.setStatus('');
    }

  }

  setStatus(text) {
    this.elements.status.textContent = text;
    this.elements.status.classList.toggle('visible', !!text);
  }

  /**
   * Update the holographic phone display
   * @param {string} text - Text to display
   * @param {string} state - CSS class state ('listening', 'speaking', or '')
   */
  setScreen(text, state) {
    // Update 3D phone if available
    if (this.holoPhone3D) {
      this.holoPhone3D.setText(text);
      this.holoPhone3D.setState(state || 'idle');
    }

    // Also update CSS phone as fallback
    if (this.elements.screenText) {
      this.elements.screenText.textContent = text;
    }
    if (this.elements.holoPhone) {
      this.elements.holoPhone.classList.remove('listening', 'speaking');
      if (state) {
        this.elements.holoPhone.classList.add(state);
      }
    }
  }

  /**
   * Reset screen to default "Hold to speak" state
   */
  resetScreen() {
    this.setScreen(this.DEFAULT_SCREEN_TEXT, '');
  }

  /**
   * Apply a toggle directive to enable/disable mascot features
   * @param {string} feature - Feature name (wobble, particles, blinking, breathing, autorotate)
   * @param {boolean} enabled - Whether to enable or disable
   */
  applyToggle(feature, enabled) {
    if (!this.mascot) return;

    console.log(`Toggle: ${feature} ${enabled ? 'on' : 'off'}`);

    switch (feature) {
      case 'wobble':
        if (enabled && this.mascot.enableWobble) {
          this.mascot.enableWobble();
        } else if (!enabled && this.mascot.disableWobble) {
          this.mascot.disableWobble();
        }
        break;

      case 'particles':
        if (enabled && this.mascot.enableParticles) {
          this.mascot.enableParticles();
        } else if (!enabled && this.mascot.disableParticles) {
          this.mascot.disableParticles();
        }
        break;

      case 'blinking':
        if (enabled && this.mascot.enableBlinking) {
          this.mascot.enableBlinking();
        } else if (!enabled && this.mascot.disableBlinking) {
          this.mascot.disableBlinking();
        }
        break;

      case 'breathing':
        if (enabled && this.mascot.enableBreathing) {
          this.mascot.enableBreathing();
        } else if (!enabled && this.mascot.disableBreathing) {
          this.mascot.disableBreathing();
        }
        break;

      case 'autorotate':
      case 'auto-rotate':
      case 'rotation':
        if (enabled && this.mascot.enableAutoRotate) {
          this.mascot.enableAutoRotate();
        } else if (!enabled && this.mascot.disableAutoRotate) {
          this.mascot.disableAutoRotate();
        }
        break;

      default:
        console.warn(`Unknown toggle feature: ${feature}`);
    }
  }

  /**
   * Schedule return to calm idle state after activity
   * Clears any existing timer first
   * Skips if user has made a manual selection (carousel, etc.)
   */
  scheduleIdleRevert() {
    // Don't auto-revert if user manually selected something
    if (this._userManualSelection) {
      console.log('Skipping idle revert - user made manual selection');
      return;
    }

    this.clearIdleRevert();

    this._idleRevertTimer = setTimeout(() => {
      if (this.state === 'idle') {
        console.log('Reverting to calm idle state');

        // Revert geometry back to crystal if it was changed by a MORPH command
        // Do this FIRST so the morph animation is smooth
        if (this.currentGeometry !== 'crystal' && this.mascot.morphTo) {
          console.log('Reverting geometry to crystal');
          this.mascot.morphTo('crystal');
          this.currentGeometry = 'crystal';
        }

        // Only revert emotion if user didn't explicitly request it
        if (!this._userRequestedEmotion) {
          // Set calm emotion without settle gesture (settle causes position changes
          // that conflict with the morph animation)
          this.mascot.feel('calm, gentle breathing');
        } else {
          console.log('Skipping emotion revert - user requested this emotion');
        }
      }
    }, this.IDLE_REVERT_DELAY);
  }

  /**
   * Clear idle revert timer (call when user starts new interaction)
   */
  clearIdleRevert() {
    if (this._idleRevertTimer) {
      clearTimeout(this._idleRevertTimer);
      this._idleRevertTimer = null;
    }
  }

  /**
   * Schedule screen to revert to default after displaying response
   */
  scheduleScreenRevert() {
    this.clearScreenRevert();

    this._screenRevertTimer = setTimeout(() => {
      this.resetScreen();
    }, this.CAPTION_HIDE_DELAY);
  }

  /**
   * Clear screen revert timer
   */
  clearScreenRevert() {
    if (this._screenRevertTimer) {
      clearTimeout(this._screenRevertTimer);
      this._screenRevertTimer = null;
    }
  }

  /**
   * Cancel the current AI operation (chat request or TTS playback)
   */
  cancelCurrentOperation() {
    console.log('Cancelling current operation, state:', this.state);

    // Abort any in-flight fetch request
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }

    // Stop TTS playback
    if (this.tts && this.tts.stop) {
      this.tts.stop();
    }

    // Reset 3D phone progress
    if (this.holoPhone3D) {
      this.holoPhone3D.setProgress(0);
    }

    // Clear any pending timeouts
    if (this._processingTimeout) {
      clearTimeout(this._processingTimeout);
      this._processingTimeout = null;
    }

    // Reset to idle state
    this.setState('idle');
    this.setScreen('Cancelled', '');
    // Only reset emotion if user hasn't requested a persistent one
    if (!this._userRequestedEmotion) {
      this.mascot.feel('neutral, settle');
    }

    // Schedule revert to default screen text
    this.scheduleScreenRevert();
  }

  /**
   * Convert screen coordinates to phone canvas coordinates using raycasting
   * Falls back to projected screen bounds if raycasting fails
   * @param {number} clientX - Screen X coordinate
   * @param {number} clientY - Screen Y coordinate
   * @returns {Object|null} - { x, y } in canvas coords (0-512, 0-228) or null if not on screen
   */
  _screenToPhoneCanvas(clientX, clientY) {
    if (!this.holoPhone3D || !this.emitterBase) {
      console.log('_screenToPhoneCanvas: missing holoPhone3D or emitterBase');
      return null;
    }

    // Try raycasting first (most accurate)
    if (this.emitterBase.emitterCamera) {
      const result = this.holoPhone3D.raycastToCanvas(
        clientX,
        clientY,
        this.emitterBase.emitterCamera
      );

      if (result) {
        if (!result.onScreen) {
          console.log('Raycast hit phone but not on screen area');
          return null;
        }
        console.log('Raycast hit phone screen:', { canvasX: result.canvasX, canvasY: result.canvasY });
        return { x: result.canvasX, y: result.canvasY };
      }
    }

    // Fallback: Use projected screen bounds from 3D position
    if (this.emitterBase.emitterCamera) {
      const bounds = this.holoPhone3D.getScreenBounds(this.emitterBase.emitterCamera);
      if (bounds) {
        // Check if touch is within projected phone screen bounds
        if (clientX >= bounds.left && clientX <= bounds.right &&
            clientY >= bounds.top && clientY <= bounds.bottom) {

          // Map to canvas coordinates (0-512 x 0-228)
          const normalizedX = (clientX - bounds.left) / bounds.width;
          const normalizedY = (clientY - bounds.top) / bounds.height;

          const canvasX = normalizedX * 512;
          // Invert Y axis - screen Y increases downward but canvas needs top=0
          // The phone is tilted back, so top of screen bounds = bottom of canvas
          const canvasY = (1 - normalizedY) * 228;

          console.log('Using projected bounds:', { canvasX, canvasY, normalizedX, normalizedY, bounds });
          return { x: canvasX, y: canvasY };
        }
        console.log('Touch outside projected phone bounds:', { clientX, clientY, bounds });
        return null;
      }
    }

    console.log('No valid coordinate conversion available');
    return null;
  }

  /**
   * Handle speaking state touch/click (for cancel button)
   * @param {number} clientX - Screen X coordinate
   * @param {number} clientY - Screen Y coordinate
   */
  _handleSpeakingTouch(clientX, clientY) {
    if (!this.holoPhone3D) return;

    const canvasCoords = this._screenToPhoneCanvas(clientX, clientY);
    if (!canvasCoords) return;

    const hitRegion = this.holoPhone3D.getSpeakingHitRegion(canvasCoords.x, canvasCoords.y);
    if (hitRegion && hitRegion.name === 'cancel') {
      console.log('Speaking cancel button tapped');
      this.cancelCurrentOperation();
    }
  }

  /**
   * Handle carousel touch/click
   * @param {number} clientX - Screen X coordinate
   * @param {number} clientY - Screen Y coordinate
   * @param {string} eventType - 'start', 'move', or 'end'
   */
  _handleCarouselTouch(clientX, clientY, eventType) {
    if (!this.holoPhone3D || !this.carousel) {
      console.log('_handleCarouselTouch: missing holoPhone3D or carousel');
      return;
    }

    console.log('_handleCarouselTouch:', clientX, clientY, eventType);

    const canvasCoords = this._screenToPhoneCanvas(clientX, clientY);
    console.log('Canvas coords:', canvasCoords);

    if (!canvasCoords) {
      // Touch outside phone screen - could close carousel on tap outside
      console.log('Touch outside phone screen');
      return;
    }

    const hitRegion = this.holoPhone3D.getHitRegion(canvasCoords.x, canvasCoords.y);
    console.log('Hit region:', hitRegion);

    if (hitRegion) {
      console.log('Carousel hit:', hitRegion.name, hitRegion.extra);

      // Check for phase slider - start drag mode
      if (hitRegion.name === 'phase-slider' && eventType === 'start') {
        this._carouselSliderDragging = true;
        this._carouselSliderType = 'phase';
        this._carouselSliderRegion = hitRegion.extra;
        // Also update slider immediately
        this._handleCarouselSliderDrag(clientX, clientY);
        return;
      }

      // Check for SSS slider - start drag mode
      if (hitRegion.name === 'sss-slider' && eventType === 'start') {
        this._carouselSliderDragging = true;
        this._carouselSliderType = 'sss';
        this._carouselSliderRegion = hitRegion.extra;
        // Also update slider immediately
        this._handleCarouselSliderDrag(clientX, clientY);
        return;
      }

      // Handle other hits
      this.carousel.handlePhoneTouch(hitRegion.name, hitRegion.extra);
    }
  }

  /**
   * Handle carousel slider drag (phase or SSS)
   * @param {number} clientX - Screen X coordinate
   * @param {number} clientY - Screen Y coordinate
   */
  _handleCarouselSliderDrag(clientX, clientY) {
    if (!this._carouselSliderRegion || !this.carousel) return;

    const canvasCoords = this._screenToPhoneCanvas(clientX, clientY);
    if (!canvasCoords) return;

    const { sliderX, sliderW, variantCount } = this._carouselSliderRegion;

    // Calculate normalized position within slider (0-1)
    const normalizedX = Math.max(0, Math.min(1, (canvasCoords.x - sliderX) / sliderW));

    // Route to appropriate handler based on slider type
    if (this._carouselSliderType === 'sss') {
      this.carousel.handleSSSSliderDrag(normalizedX, variantCount);
    } else {
      this.carousel.handlePhaseSliderDrag(normalizedX);
    }
  }

  /**
   * Update the floating holographic carousel title
   * @param {string} name - Geometry name (e.g., "Crystal", "Moon")
   * @param {string} variant - Variant name (e.g., "Quartz", "Phase")
   */
  _updateCarouselTitle(name, variant) {
    if (this.elements.carouselTitleName) {
      this.elements.carouselTitleName.textContent = name.toUpperCase();
    }
    if (this.elements.carouselTitleVariant) {
      this.elements.carouselTitleVariant.textContent = variant;
    }
  }

  /**
   * Show the response progress bar
   */
  showResponseProgress() {
    if (this.elements.responseProgress) {
      this.elements.responseProgress.classList.remove('hidden');
      this.updateResponseProgress(0);
    }
  }

  /**
   * Hide the response progress bar
   */
  hideResponseProgress() {
    if (this.elements.responseProgress) {
      this.elements.responseProgress.classList.add('hidden');
    }
    // Reset the fill
    if (this.elements.responseProgressFill) {
      this.elements.responseProgressFill.style.width = '0%';
    }
  }

  /**
   * Update the response progress bar
   * @param {number} progress - 0 to 1
   */
  updateResponseProgress(progress) {
    if (this.elements.responseProgressFill) {
      this.elements.responseProgressFill.style.width = `${progress * 100}%`;
    }
  }

  /**
   * Show debug overlay for phone touch bounds
   * @param {Object} bounds - Phone screen bounds
   */
  _showPhoneBoundsDebug(bounds) {
    // Remove any existing debug overlay
    const existing = document.getElementById('phone-bounds-debug');
    if (existing) existing.remove();

    if (!bounds) return;

    // Create debug overlay
    const debug = document.createElement('div');
    debug.id = 'phone-bounds-debug';
    debug.style.cssText = `
      position: fixed;
      left: ${bounds.left}px;
      top: ${bounds.top}px;
      width: ${bounds.width}px;
      height: ${bounds.height}px;
      border: 3px solid lime;
      background: rgba(0, 255, 0, 0.1);
      pointer-events: none;
      z-index: 9999;
      box-sizing: border-box;
    `;

    // Add center crosshair
    const crosshair = document.createElement('div');
    crosshair.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      width: 20px;
      height: 20px;
      margin-left: -10px;
      margin-top: -10px;
      border: 2px solid lime;
      border-radius: 50%;
    `;
    debug.appendChild(crosshair);

    // Add label
    const label = document.createElement('div');
    label.style.cssText = `
      position: absolute;
      bottom: -25px;
      left: 0;
      color: lime;
      font-size: 12px;
      font-family: monospace;
      white-space: nowrap;
    `;
    label.textContent = `Phone bounds: ${Math.round(bounds.width)}x${Math.round(bounds.height)} @ (${Math.round(bounds.centerX)}, ${Math.round(bounds.centerY)})`;
    debug.appendChild(label);

    document.body.appendChild(debug);
    console.log('Phone bounds debug overlay shown');
  }
}

// Initialize on page load
const emo = new EmoAssistant();
emo.init().catch(console.error);

// Export for debugging
window.emo = emo;

// Export tutorial reset for debugging (run TutorialController.reset() in console)
window.TutorialController = TutorialController;
