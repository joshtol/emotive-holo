/**
 * Emo Holographic AI Assistant
 * Main orchestration module
 */

import { EmotiveMascot3D } from '@joshtol/emotive-engine/3d';
import { VoiceInput } from './voice-input.js';
import { ClaudeClient } from './claude-client.js';
import { NativeTTS } from './native-tts.js';
import { MeditationController } from './meditation.js';
import { GeometryCarousel } from './carousel.js';
import { EmitterBase } from './emitter-base.js';
import { HoloPhone } from './holo-phone.js';
import { layoutScaler } from './layout-scaler.js';
import './shadow-debug.js'; // Auto-inits if ?shadow-debug=contact|core|penumbra in URL

class EmoAssistant {
  constructor() {
    // State
    this.state = 'idle'; // idle, listening, thinking, speaking, meditation, carousel
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

    // DOM elements
    this.elements = {
      container: document.getElementById('mascot-container'),
      caption: document.getElementById('caption'),
      status: document.getElementById('status'),
      voiceIndicator: document.getElementById('voice-indicator'),
      meditationOverlay: document.getElementById('meditation-overlay'),
      meditationPhase: document.getElementById('meditation-phase'),
      meditationTimer: document.getElementById('meditation-timer'),
      // Holographic phone display
      holoPhone: document.getElementById('holo-phone'),
      screenText: document.querySelector('#holo-phone .screen-text'),
      cancelButton: document.getElementById('cancel-btn'),
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
      assetBasePath: '/assets'  // Path to OBJ models and textures
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

    // Initialize 3D emitter base (add to mascot's THREE.js scene)
    // The emitter renders on a separate layer with its own fixed camera
    // so it's completely independent of OrbitControls
    const scene = this.mascot.core3D?.renderer?.scene;
    const camera = this.mascot.core3D?.renderer?.camera;
    const renderer = this.mascot.core3D?.renderer?.renderer;
    if (scene && camera && renderer) {
      // Enable ACES Filmic tone mapping for better HDR handling
      // This gives more realistic color response and prevents blown highlights
      const THREE = await import('three');
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;  // Balanced exposure for realistic colors
      // Emitter uses realistic proportions from layout scaler
      this.emitterBase = new EmitterBase(scene, camera, renderer, {
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
      this.holoPhone3D = new HoloPhone(this.emitterBase.scene, camera, renderer, {
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
    this.meditation = new MeditationController(this.mascot, this.tts, this.elements);
    // Pass holoPhone3D to carousel so it can render on the phone screen
    this.carousel = new GeometryCarousel(this.mascot, this.elements.container, this.holoPhone3D);

    // Wire up carousel state change to sync main state
    this.carousel.onStateChange = (carouselState) => {
      if (carouselState === 'carousel') {
        this.setState('carousel');
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

    // Wire up TTS progress tracking
    this.tts.onProgress = (progress) => {
      this.updateResponseProgress(progress);
    };

    // Wire up CC-style chunk display - shows 2-3 lines, advances when TTS catches up
    this.tts.onChunkChange = (chunkText) => {
      if (this.state === 'speaking' && this.elements.screenText) {
        this.elements.screenText.textContent = chunkText;
      }
    };

    // Setup event listeners
    this.setupEventListeners();

    // Show ready state
    this.setStatus('Ready');
    setTimeout(() => this.setStatus(''), 2000);

    console.log('Emo Assistant initialized');
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
      this.state = 'idle';
    };

    // Click on meditation overlay to cancel (tap anywhere to exit)
    if (this.elements.meditationOverlay) {
      this.elements.meditationOverlay.addEventListener('click', () => {
        if (this.state === 'meditation') {
          this.meditation.stop();
          this.setState('idle');
        }
      });
    }

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

    // Cancel button - abort current AI response (now separate from phone)
    if (this.elements.cancelButton) {
      this.elements.cancelButton.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Cancel button clicked');
        this.cancelCurrentOperation();
      });
    }
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
    this.elements.voiceIndicator.classList.remove('hidden');

    // Update screen state
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
    this.elements.voiceIndicator.classList.add('hidden');

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
        this.setState('meditation');
        this.setScreen(text, 'speaking');
        await this.tts.speak(text);
        if (feel) this.mascot.feel(feel);
        this.meditation.start();
        return;
      }

      // Normal response flow
      this.setState('speaking');
      console.log('Setting screen text:', text);
      // TTS will handle chunk display via onChunkChange callback
      // Just set speaking state, first chunk shown by TTS.speak()
      this.setScreen('', 'speaking');
      this._fullResponseText = text;  // Store for final display

      // Apply morph directive if present
      if (morph && this.mascot.morphTo) {
        console.log('Morphing to:', morph);
        this.mascot.morphTo(morph);
        this.currentGeometry = morph;  // Track for auto-revert
      }

      // Apply feel directive
      if (feel) {
        this.mascot.feel(feel);
        // Mark as user-requested so it won't auto-revert
        this._userRequestedEmotion = true;
      } else {
        // No feel directive in this response - clear the persistent emotion flag
        // so future interactions can auto-revert normally
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

      // Apply gesture chain if present
      if (chain && this.mascot.chain) {
        console.log('Playing chain:', chain);
        this.mascot.chain(chain);
      }

      // Apply camera preset if present
      if (camera && this.mascot.setCameraPreset) {
        console.log('Setting camera:', camera);
        this.mascot.setCameraPreset(camera);
      }

      // Show progress bar and speak the response
      this.showResponseProgress();
      await this.tts.speak(text);
      this.hideResponseProgress();

      // Ensure full text is shown after TTS completes
      if (this._fullResponseText) {
        this.setScreen(this._fullResponseText, '');
        this._fullResponseText = null;
      }

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
        morph = trimmed.substring(6).trim().toLowerCase();
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
        preset = trimmed.substring(7).trim().toLowerCase();
      } else if (trimmed.startsWith('UNDERTONE:')) {
        undertone = trimmed.substring(10).trim().toLowerCase();
      } else if (trimmed.startsWith('CHAIN:')) {
        chain = trimmed.substring(6).trim().toLowerCase();
      } else if (trimmed.startsWith('CAMERA:')) {
        camera = trimmed.substring(7).trim().toLowerCase();
      } else if (trimmed) {
        // Filter out action descriptions like *morphs into...*
        if (!trimmed.startsWith('*') || !trimmed.endsWith('*')) {
          text.push(trimmed);
        }
      }
    }

    // Fallback: detect morph from FEEL line if it contains "morph to X"
    if (!morph && feel) {
      const feelLower = feel.toLowerCase();
      const morphMatch = feelLower.match(/morph\s+to\s+(\w+)/);
      if (morphMatch) {
        const target = morphMatch[1];
        const validGeometries = ['moon', 'sun', 'crystal', 'heart', 'star', 'rough', 'sphere', 'diamond', 'torus', 'icosahedron', 'octahedron', 'tetrahedron', 'dodecahedron', 'ring'];
        if (validGeometries.includes(target)) {
          morph = target;
        }
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

    // Show/hide cancel button based on active AI states
    const showCancel = ['thinking', 'speaking', 'processing'].includes(newState);
    if (this.elements.cancelButton) {
      this.elements.cancelButton.classList.toggle('hidden', !showCancel);
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

    // Hide progress bar
    this.hideResponseProgress();

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
