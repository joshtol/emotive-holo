/**
 * Geometry Carousel
 * Renders on the 3D phone screen - delegates drawing to HoloPhone
 * The live mascot morphs in place, no preview thumbnails needed
 */

import { animateMoonPhase } from '@joshtol/emotive-engine/3d';

export class GeometryCarousel {
  constructor(mascot, container, holoPhone) {
    this.mascot = mascot;
    this.container = container;
    this.holoPhone = holoPhone;
    this.titleElement = document.getElementById('carousel-title');

    this.isVisible = false;
    this.currentIndex = 0;
    this.currentVariantIndex = 0;

    this.onSelect = null;
    this.onStateChange = null; // Callback for state changes (show/hide)
    this.onTitleChange = null; // Callback for floating title updates

    // Bind resize handler for dynamic title positioning
    this._onResize = this._updateTitlePosition.bind(this);
    window.addEventListener('resize', this._onResize);

    // Moon phase slider value (0-1 for phone canvas)
    this._phaseSliderValue = 0.5; // Default to full moon

    // Cherry-picked gestures to play after geometry selection
    this.selectionGestures = [
      'orbit', 'lean', 'reach', 'bounce', 'sway',
      'spin', 'breathe', 'pulse', 'shimmer'
    ];

    // SSS preset variants shared by crystal-type geometries
    // Order: Quartz (white) -> Ruby (red) -> Citrine (yellow) -> Emerald (green) -> Sapphire (blue) -> Amethyst (purple)
    this.sssVariants = [
      { name: 'default', label: 'Quartz', preset: 'default' },
      { name: 'ruby', label: 'Ruby', preset: 'ruby' },
      { name: 'citrine', label: 'Citrine', preset: 'citrine' },
      { name: 'emerald', label: 'Emerald', preset: 'emerald' },
      { name: 'sapphire', label: 'Sapphire', preset: 'sapphire' },
      { name: 'amethyst', label: 'Amethyst', preset: 'amethyst' }
    ];

    // Available geometries with variants
    // These must match THREE_GEOMETRIES in emotive-engine
    // Order: Crystal, Moon, Star, Sun, Rough, Heart
    this.geometries = [
      {
        id: 'crystal',
        name: 'Crystal',
        variants: this.sssVariants,
        sss: true
      },
      {
        id: 'moon',
        name: 'Moon',
        variants: [
          { name: 'phase', label: 'Phase' },
          { name: 'blood', label: 'Eclipse' },
          { name: 'partial', label: 'Partial' }
        ],
        hasPhaseSlider: true
      },
      {
        id: 'star',
        name: 'Star',
        variants: this.sssVariants,
        sss: true
      },
      {
        id: 'sun',
        name: 'Sun',
        variants: [
          { name: 'default', label: 'Normal' },
          { name: 'annular', label: 'Annular' },
          { name: 'total', label: 'Total' }
        ]
      },
      {
        id: 'rough',
        name: 'Rough',
        variants: this.sssVariants,
        sss: true
      },
      {
        id: 'heart',
        name: 'Heart',
        variants: this.sssVariants,
        sss: true
      }
    ];

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Keyboard navigation only - touch handled via main.js routing to phone
    this.keyHandler = (e) => {
      if (!this.isVisible) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          this.navigate(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.navigate(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.navigateVariant(-1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.navigateVariant(1);
          break;
        case 'Enter':
          e.preventDefault();
          this.confirmSelection();
          break;
        case 'Escape':
          e.preventDefault();
          this.hide();
          break;
      }
    };

    document.addEventListener('keydown', this.keyHandler);
  }

  /**
   * Push current carousel state to phone for rendering
   * Also updates the floating holographic title
   */
  _updatePhoneCarousel() {
    if (!this.holoPhone) return;

    const current = this.geometries[this.currentIndex];
    const currentVariant = current.variants[this.currentVariantIndex];

    this.holoPhone.setCarouselData({
      geometries: this.geometries,
      currentIndex: this.currentIndex,
      currentVariantIndex: this.currentVariantIndex,
      variants: current.variants,
      phase: this._phaseSliderValue
    });

    // Update floating holographic title
    // For Moon Phase variant, show the actual phase name from the slider
    if (this.onTitleChange) {
      let variantLabel = currentVariant?.label || currentVariant?.name || '';

      // If we're on Moon geometry with Phase variant active, show the actual phase
      if (current.id === 'moon' && currentVariant?.name === 'phase' && this._moonPhaseLabel) {
        variantLabel = this._moonPhaseLabel;
      }

      this.onTitleChange({
        name: current.name,
        variant: variantLabel
      });
    }
  }

  show() {
    this.isVisible = true;

    // Store original state for cancel restoration
    this._originalIndex = this.currentIndex;
    this._originalVariantIndex = this.currentVariantIndex;

    // Add class to dim the mascot
    document.getElementById('hologram-container').classList.add('carousel-active');

    // Float mascot up during selection
    this._animateMascotFloat(true);

    // Position title dynamically between mascot and emitter
    this._updateTitlePosition();

    // Notify state change
    if (this.onStateChange) {
      this.onStateChange('carousel');
    }

    // Update phone display
    this._updatePhoneCarousel();
  }

  /**
   * Dynamically position carousel title between mascot bottom and emitter top
   */
  _updateTitlePosition() {
    if (!this.titleElement || !this.isVisible) return;

    const vh = window.innerHeight;
    const isMobile = window.innerWidth < 768 || window.innerWidth / vh < 1;

    // Mascot is centered vertically, estimate its bottom at ~55% from top
    // Emitter top is roughly at 70-75% from top of viewport
    // Position title equidistant between them
    const mascotBottom = isMobile ? 0.52 : 0.50; // % from top
    const emitterTop = isMobile ? 0.68 : 0.65;   // % from top
    const titleCenter = (mascotBottom + emitterTop) / 2;

    // Convert to bottom percentage
    const bottomPercent = (1 - titleCenter) * 100;

    this.titleElement.style.bottom = `${bottomPercent}%`;
    this.titleElement.style.top = 'auto';
  }

  hide(triggerGesture = false) {
    this.isVisible = false;

    // Remove dim class
    document.getElementById('hologram-container').classList.remove('carousel-active');

    // Play gesture as mascot starts moving back down
    if (triggerGesture) {
      this._playRandomSelectionGesture();
    }

    // Float mascot back down to normal position
    this._animateMascotFloat(false);

    // Clear phone carousel state
    if (this.holoPhone) {
      this.holoPhone.setCarouselData(null);
    }

    // Notify state change
    if (this.onStateChange) {
      this.onStateChange('idle');
    }
  }

  /**
   * Handle touch events from phone screen
   * @param {string} hitName - Hit region name
   * @param {Object} extra - Extra data from hit region
   */
  handlePhoneTouch(hitName, extra) {
    switch (hitName) {
      case 'prev-geometry':
        this.navigate(-1);
        break;
      case 'next-geometry':
        this.navigate(1);
        break;
      case 'confirm':
        this.confirmSelection();
        break;
      case 'cancel':
        // Restore original geometry/variant before closing
        this.currentIndex = this._originalIndex;
        this.currentVariantIndex = this._originalVariantIndex;
        this.applyCurrentGeometry();

        // Clear the floating title
        if (this.onTitleChange) {
          this.onTitleChange(null);
        }

        // Close carousel without gesture
        this.hide(false);
        break;
      case 'variant':
        if (extra?.index !== undefined) {
          this.selectVariant(extra.index);
        }
        break;
      case 'phase-slider':
        // Slider drag handled separately via handlePhaseSliderDrag
        break;
      case 'sss-slider':
        // SSS slider drag handled separately via handleSSSSliderDrag
        break;
    }
  }

  /**
   * Handle SSS slider drag - snaps to nearest gem variant
   * @param {number} normalizedX - 0-1 position within slider
   * @param {number} variantCount - Number of variants
   */
  handleSSSSliderDrag(normalizedX, variantCount) {
    // Snap to nearest variant
    const index = Math.round(normalizedX * (variantCount - 1));
    const clampedIndex = Math.max(0, Math.min(variantCount - 1, index));

    if (clampedIndex !== this.currentVariantIndex) {
      this.selectVariant(clampedIndex);
    }
  }

  /**
   * Handle phase slider drag
   * @param {number} normalizedX - 0-1 position within slider
   */
  handlePhaseSliderDrag(normalizedX) {
    this._phaseSliderValue = Math.max(0, Math.min(1, normalizedX));

    // Map 0-1 to 0-100 for the phase calculation
    const sliderValue = Math.round(this._phaseSliderValue * 100);
    this.setMoonPhase(sliderValue);

    // Update phone display
    this._updatePhoneCarousel();
  }

  /**
   * Select a variant by index
   */
  selectVariant(index) {
    const current = this.geometries[this.currentIndex];
    if (index >= 0 && index < current.variants.length) {
      this.currentVariantIndex = index;
      this._updatePhoneCarousel();
      this.applyCurrentVariant();
    }
  }

  /**
   * Animate mascot floating up (for selection) or down (to normal)
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
   * Play a random gesture from the selection gestures list
   */
  _playRandomSelectionGesture() {
    if (!this.mascot?.feel) return;

    const gesture = this.selectionGestures[
      Math.floor(Math.random() * this.selectionGestures.length)
    ];
    this.mascot.feel(gesture);
  }

  navigate(direction) {
    this.currentIndex = (this.currentIndex + this.geometries.length + direction) % this.geometries.length;
    this.currentVariantIndex = 0; // Reset variant when changing geometry
    this._updatePhoneCarousel();
    this.applyCurrentGeometry();
  }

  navigateVariant(direction) {
    const current = this.geometries[this.currentIndex];
    const variantCount = current.variants.length;

    if (variantCount <= 1) return;

    this.currentVariantIndex = (this.currentVariantIndex + variantCount + direction) % variantCount;
    this._updatePhoneCarousel();
    this.applyCurrentVariant();
  }

  applyCurrentGeometry() {
    const current = this.geometries[this.currentIndex];

    // Morph to new geometry
    if (this.mascot && this.mascot.morphTo) {
      this.mascot.morphTo(current.id);

      // Apply the default variant after a short delay to let the morph complete
      setTimeout(() => {
        this.applyCurrentVariant();
      }, 500);
    }
  }

  applyCurrentVariant() {
    const current = this.geometries[this.currentIndex];
    const variant = current.variants[this.currentVariantIndex];

    // Apply variant-specific settings
    if (current.id === 'moon') {
      this.applyMoonVariant(variant.name);
    } else if (current.id === 'sun') {
      this.applySunVariant(variant.name);
    } else if (current.sss) {
      // All crystal-type geometries use SSS presets
      this.applySSSVariant(variant.name);
    }
  }

  applyMoonVariant(variant) {
    if (!this.mascot.core3D) return;

    // Get the moon material - customMaterial is where moon phases are controlled
    const material = this.mascot.core3D.customMaterial;

    // Turn off eclipse first for non-eclipse variants
    if (variant !== 'blood' && variant !== 'partial') {
      this.mascot.core3D.setMoonEclipse?.('off');
    }

    switch (variant) {
      case 'phase':
        // Phase variant - use current phase from slider
        if (material?.uniforms) {
          const phaseName = this._moonPhaseName ?? 'full';
          animateMoonPhase(material, phaseName, 500);
        }
        break;
      case 'blood':
        // Full moon with total lunar eclipse (blood moon effect)
        if (material?.uniforms) {
          animateMoonPhase(material, 'full', 500);
        }
        this.mascot.core3D.setMoonEclipse?.('total');
        break;
      case 'partial':
        // Full moon with partial eclipse
        if (material?.uniforms) {
          animateMoonPhase(material, 'full', 500);
        }
        this.mascot.core3D.setMoonEclipse?.('partial');
        break;
    }
  }

  /**
   * Set moon phase from slider (0-100 mapped to 8 named phases)
   * @param {number} sliderValue - 0-100 slider value
   */
  setMoonPhase(sliderValue) {
    // Map slider 0-100 to the 8 named moon phases
    const phases = [
      { max: 7, name: 'new', label: 'New Moon' },
      { max: 21, name: 'waxing-crescent', label: 'Waxing Crescent' },
      { max: 35, name: 'first-quarter', label: 'First Quarter' },
      { max: 46, name: 'waxing-gibbous', label: 'Waxing Gibbous' },
      { max: 54, name: 'full', label: 'Full Moon' },
      { max: 64, name: 'waning-gibbous', label: 'Waning Gibbous' },
      { max: 78, name: 'last-quarter', label: 'Last Quarter' },
      { max: 93, name: 'waning-crescent', label: 'Waning Crescent' },
      { max: 100, name: 'new', label: 'New Moon' }
    ];

    const phase = phases.find(p => sliderValue <= p.max) || phases[phases.length - 1];
    this._moonPhaseName = phase.name;
    this._moonPhaseLabel = phase.label;

    const material = this.mascot.core3D?.customMaterial;
    if (material?.uniforms) {
      animateMoonPhase(material, phase.name, 300);
    }
  }

  applySunVariant(variant) {
    if (!this.mascot.core3D) return;

    switch (variant) {
      case 'default':
        this.mascot.core3D.setSunShadow?.('off');
        break;
      case 'annular':
        this.mascot.core3D.setSunShadow?.('annular');
        break;
      case 'total':
        this.mascot.core3D.setSunShadow?.('total');
        break;
    }
  }

  applySSSVariant(variant) {
    // SSS color variants for crystal, heart, star, rough geometries
    // Map variant names to SSS preset names
    const presetMap = {
      'default': 'quartz',
      'ruby': 'ruby',
      'citrine': 'citrine',
      'emerald': 'emerald',
      'sapphire': 'sapphire',
      'amethyst': 'amethyst'
    };

    const presetName = presetMap[variant] || 'quartz';

    // Use the mascot's setSSSPreset API
    if (this.mascot.setSSSPreset) {
      this.mascot.setSSSPreset(presetName);
    }
  }

  confirmSelection() {
    const current = this.geometries[this.currentIndex];
    const variant = current.variants[this.currentVariantIndex];

    if (this.onSelect) {
      this.onSelect(current.id, variant.name);
    }

    // Hide with gesture trigger - plays a random gesture when mascot lands
    this.hide(true);
  }

  // Jump directly to a geometry by name (for voice commands)
  selectByName(name) {
    const index = this.geometries.findIndex(g =>
      g.id.toLowerCase() === name.toLowerCase() ||
      g.name.toLowerCase() === name.toLowerCase()
    );

    if (index !== -1) {
      this.currentIndex = index;
      this.currentVariantIndex = 0;
      this.applyCurrentGeometry();
      return true;
    }

    return false;
  }
}
