/**
 * Geometry Carousel
 * Approachable futurism redesign - soft glass panel at bottom
 * The live mascot morphs in place, no preview thumbnails needed
 */

import { animateMoonPhase } from '@joshtol/emotive-engine/3d';

export class GeometryCarousel {
  constructor(mascot, container) {
    this.mascot = mascot;
    this.container = container;

    this.isVisible = false;
    this.currentIndex = 0;
    this.currentVariantIndex = 0;

    this.onSelect = null;

    // SSS preset variants shared by crystal-type geometries
    this.sssVariants = [
      { name: 'default', label: 'Quartz' },
      { name: 'emerald', label: 'Emerald' },
      { name: 'ruby', label: 'Ruby' },
      { name: 'sapphire', label: 'Sapphire' },
      { name: 'amethyst', label: 'Amethyst' }
    ];

    // Available geometries with variants
    // These must match THREE_GEOMETRIES in emotive-engine
    this.geometries = [
      {
        name: 'crystal',
        label: 'Crystal',
        variants: this.sssVariants,
        usesSSS: true
      },
      {
        name: 'moon',
        label: 'Moon',
        variants: [
          { name: 'full', label: 'Full' },
          { name: 'waxing-crescent', label: 'Crescent' },
          { name: 'first-quarter', label: 'Half' },
          { name: 'blood', label: 'Blood' },
          { name: 'eclipse', label: 'Eclipse' }
        ]
      },
      {
        name: 'sun',
        label: 'Sun',
        variants: [
          { name: 'default', label: 'Normal' },
          { name: 'annular', label: 'Annular' },
          { name: 'total', label: 'Total' }
        ]
      },
      {
        name: 'heart',
        label: 'Heart',
        variants: this.sssVariants,
        usesSSS: true
      },
      {
        name: 'star',
        label: 'Star',
        variants: this.sssVariants,
        usesSSS: true
      },
      {
        name: 'rough',
        label: 'Rough',
        variants: this.sssVariants,
        usesSSS: true
      }
    ];

    this.setupDOM();
    this.setupEventListeners();
  }

  setupDOM() {
    // Get carousel container
    this.carouselEl = document.getElementById('carousel');

    // Create the new panel structure
    this.panel = document.createElement('div');
    this.panel.className = 'carousel-panel';

    // Navigation row: [< Arrow] [Title] [Arrow >]
    this.navRow = document.createElement('div');
    this.navRow.className = 'carousel-nav';

    this.leftArrow = document.createElement('button');
    this.leftArrow.className = 'carousel-arrow';
    this.leftArrow.innerHTML = '&#8249;'; // ‹
    this.leftArrow.setAttribute('aria-label', 'Previous geometry');

    this.titleBlock = document.createElement('div');
    this.titleBlock.className = 'carousel-title';

    this.titleEl = document.createElement('h2');
    this.titleEl.textContent = 'Crystal';

    this.subtitleEl = document.createElement('div');
    this.subtitleEl.className = 'subtitle';
    this.subtitleEl.textContent = 'Quartz';

    this.titleBlock.appendChild(this.titleEl);
    this.titleBlock.appendChild(this.subtitleEl);

    this.rightArrow = document.createElement('button');
    this.rightArrow.className = 'carousel-arrow';
    this.rightArrow.innerHTML = '&#8250;'; // ›
    this.rightArrow.setAttribute('aria-label', 'Next geometry');

    this.navRow.appendChild(this.leftArrow);
    this.navRow.appendChild(this.titleBlock);
    this.navRow.appendChild(this.rightArrow);

    // Variant dots (horizontal)
    this.variantDots = document.createElement('div');
    this.variantDots.className = 'carousel-variants';

    // Action buttons
    this.actionsRow = document.createElement('div');
    this.actionsRow.className = 'carousel-actions';

    this.selectBtn = document.createElement('button');
    this.selectBtn.className = 'carousel-btn primary';
    this.selectBtn.textContent = 'Select';

    this.cancelBtn = document.createElement('button');
    this.cancelBtn.className = 'carousel-btn secondary';
    this.cancelBtn.textContent = 'Cancel';

    this.actionsRow.appendChild(this.selectBtn);
    this.actionsRow.appendChild(this.cancelBtn);

    // Assemble panel
    this.panel.appendChild(this.navRow);
    this.panel.appendChild(this.variantDots);
    this.panel.appendChild(this.actionsRow);

    // Close button (top right)
    this.closeBtn = document.createElement('button');
    this.closeBtn.className = 'carousel-close';
    this.closeBtn.innerHTML = '&times;';
    this.closeBtn.setAttribute('aria-label', 'Close');

    // Add to carousel container
    this.carouselEl.appendChild(this.panel);
    this.carouselEl.appendChild(this.closeBtn);
  }

  setupEventListeners() {
    // Arrow navigation
    this.leftArrow.addEventListener('click', () => this.navigate(-1));
    this.rightArrow.addEventListener('click', () => this.navigate(1));

    // Select/Cancel buttons
    this.selectBtn.addEventListener('click', () => this.confirmSelection());
    this.cancelBtn.addEventListener('click', () => this.hide());
    this.closeBtn.addEventListener('click', () => this.hide());

    // Keyboard navigation
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

    // Touch swipe support
    this.setupTouchSwipe();
  }

  setupTouchSwipe() {
    let touchStartX = 0;
    let touchStartY = 0;

    this.panel.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    this.panel.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;

      // Horizontal swipe (more horizontal than vertical)
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
        if (deltaX > 0) {
          this.navigate(-1); // Swipe right = previous
        } else {
          this.navigate(1); // Swipe left = next
        }
      }
      // Vertical swipe for variants
      else if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 30) {
        if (deltaY > 0) {
          this.navigateVariant(-1); // Swipe down = previous variant
        } else {
          this.navigateVariant(1); // Swipe up = next variant
        }
      }
    }, { passive: true });
  }

  show() {
    this.isVisible = true;
    this.carouselEl.classList.remove('hidden');

    // Add class to dim the mascot
    document.getElementById('hologram-container').classList.add('carousel-active');

    // Float mascot up during selection
    this._animateMascotFloat(true);

    this.updateDisplay();
  }

  hide() {
    this.isVisible = false;
    this.carouselEl.classList.add('hidden');

    // Remove dim class
    document.getElementById('hologram-container').classList.remove('carousel-active');

    // Float mascot back down to normal position
    this._animateMascotFloat(false);
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

  navigate(direction) {
    this.currentIndex = (this.currentIndex + direction + this.geometries.length) % this.geometries.length;
    this.currentVariantIndex = 0; // Reset variant when changing geometry
    this.updateDisplay();
    this.applyCurrentGeometry();
  }

  navigateVariant(direction) {
    const current = this.geometries[this.currentIndex];
    const variantCount = current.variants.length;

    if (variantCount <= 1) return;

    this.currentVariantIndex = (this.currentVariantIndex + direction + variantCount) % variantCount;
    this.updateDisplay();
    this.applyCurrentVariant();
  }

  updateDisplay() {
    const current = this.geometries[this.currentIndex];
    const variant = current.variants[this.currentVariantIndex];

    // Update title and subtitle
    this.titleEl.textContent = current.label;
    this.subtitleEl.textContent = variant.label;

    // Update variant dots
    this.updateVariantDots(current.variants);
  }

  updateVariantDots(variants) {
    this.variantDots.innerHTML = '';

    // Only show variants if more than 1
    if (variants.length <= 1) {
      this.variantDots.style.display = 'none';
      return;
    }

    this.variantDots.style.display = 'flex';

    // Use pill buttons for better UX
    variants.forEach((variant, index) => {
      const pill = document.createElement('button');
      pill.className = 'variant-pill' + (index === this.currentVariantIndex ? ' active' : '');
      pill.textContent = variant.label;
      pill.addEventListener('click', () => {
        this.currentVariantIndex = index;
        this.updateDisplay();
        this.applyCurrentVariant();
      });
      this.variantDots.appendChild(pill);
    });
  }

  applyCurrentGeometry() {
    const current = this.geometries[this.currentIndex];

    // Morph to new geometry
    if (this.mascot && this.mascot.morphTo) {
      this.mascot.morphTo(current.name);

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
    if (current.name === 'moon') {
      this.applyMoonVariant(variant.name);
    } else if (current.name === 'sun') {
      this.applySunVariant(variant.name);
    } else if (current.usesSSS) {
      // All crystal-type geometries use SSS presets
      this.applySSSVariant(variant.name);
    }
  }

  applyMoonVariant(variant) {
    if (!this.mascot.core3D) return;

    // Get the moon mesh material for animateMoonPhase
    const moonMesh = this.mascot.core3D.mesh;
    const material = moonMesh?.material;

    // Turn off eclipse first for non-eclipse variants
    if (variant !== 'blood' && variant !== 'eclipse') {
      this.mascot.core3D.setMoonEclipse?.('off');
    }

    switch (variant) {
      case 'full':
        if (material?.uniforms) {
          animateMoonPhase(material, 'full', 1000);
        }
        break;
      case 'waxing-crescent':
        // Use the correct phase name from Moon.js
        if (material?.uniforms) {
          animateMoonPhase(material, 'waxing-crescent', 1000);
        }
        break;
      case 'first-quarter':
        if (material?.uniforms) {
          animateMoonPhase(material, 'first-quarter', 1000);
        }
        break;
      case 'blood':
        // Full moon with total lunar eclipse (blood moon effect)
        if (material?.uniforms) {
          animateMoonPhase(material, 'full', 500);
        }
        this.mascot.core3D.setMoonEclipse?.('total');
        break;
      case 'eclipse':
        // Full moon with partial eclipse
        if (material?.uniforms) {
          animateMoonPhase(material, 'full', 500);
        }
        this.mascot.core3D.setMoonEclipse?.('partial');
        break;
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
      'emerald': 'emerald',
      'ruby': 'ruby',
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
      this.onSelect(current.name, variant.name);
    }

    this.hide();
  }

  // Jump directly to a geometry by name (for voice commands)
  selectByName(name) {
    const index = this.geometries.findIndex(g =>
      g.name.toLowerCase() === name.toLowerCase() ||
      g.label.toLowerCase() === name.toLowerCase()
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
