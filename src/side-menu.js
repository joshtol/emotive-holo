/**
 * SideMenu - Floating CSS-based menu labels around the mascot
 *
 * Layout:
 * - Left column: Music, Meditate, Effects
 * - Right column: Settings, Moods, Stories
 * - Triggered by hamburger icon on holophone
 *
 * Uses CarouselAudio for sound feedback
 */

import { CarouselAudio } from './audio/carousel-audio.js';

// Detect base path for assets (handles GitHub Pages /emotive-holo/ prefix)
const BASE_PATH = window.location.pathname.includes('/emotive-holo/') ? '/emotive-holo' : '';

// Emotion configurations for mood mode
// Left side: positive emotions, Right side: negative/intense emotions
const MOOD_LEFT_ITEMS = [
  { id: 'neutral', label: 'NEUTRAL', svg: `${BASE_PATH}/assets/emotions/neutral.svg` },
  { id: 'joy', label: 'JOY', svg: `${BASE_PATH}/assets/emotions/joy.svg` },
  { id: 'love', label: 'LOVE', svg: `${BASE_PATH}/assets/emotions/love.svg` },
  { id: 'excited', label: 'EXCITED', svg: `${BASE_PATH}/assets/emotions/excited.svg` },
  { id: 'calm', label: 'CALM', svg: `${BASE_PATH}/assets/emotions/calm.svg` },
  { id: 'euphoria', label: 'EUPHORIA', svg: `${BASE_PATH}/assets/emotions/euphoria.svg` }
];

const MOOD_RIGHT_ITEMS = [
  { id: 'surprise', label: 'SURPRISE', svg: `${BASE_PATH}/assets/emotions/surprise.svg` },
  { id: 'fear', label: 'FEAR', svg: `${BASE_PATH}/assets/emotions/fear.svg` },
  { id: 'sadness', label: 'SADNESS', svg: `${BASE_PATH}/assets/emotions/sadness.svg` },
  { id: 'disgust', label: 'DISGUST', svg: `${BASE_PATH}/assets/emotions/disgust.svg` },
  { id: 'anger', label: 'ANGER', svg: `${BASE_PATH}/assets/emotions/anger.svg` },
  { id: 'glitch', label: 'GLITCH', svg: `${BASE_PATH}/assets/emotions/glitch.svg` }
];

export class SideMenu {
  constructor(options = {}) {
    this.onSelect = options.onSelect || (() => {});
    this.onMoodSelect = options.onMoodSelect || (() => {});
    this.onMoodModeChange = options.onMoodModeChange || (() => {});
    this.onOpen = options.onOpen || (() => {});
    this.onClose = options.onClose || (() => {});
    this.layoutScaler = options.layoutScaler;

    this.isOpen = false;
    this.selectedItem = null;
    this.isMoodMode = false;

    // Initial scroll position for mood carousels
    this.leftCarouselIndex = 0;
    this.rightCarouselIndex = 0;

    // Menu items configuration (3 per side, icon above label)
    this.leftItems = [
      { id: 'music', label: 'MUSIC', icon: '♪' },
      { id: 'meditate', label: 'MEDITATE', icon: '◎' },
      { id: 'effects', label: 'EFFECTS', icon: '✧' }
    ];

    this.rightItems = [
      { id: 'settings', label: 'SETTINGS', icon: '⚙' },
      { id: 'moods', label: 'MOODS', icon: '☽' },
      { id: 'stories', label: 'STORIES', icon: '☷' }
    ];

    // Audio
    this.audio = new CarouselAudio();

    // DOM elements
    this.container = null;
    this.leftColumn = null;
    this.rightColumn = null;
    this.hamburgerButton = null;

    this._createStyles();
    this._createDOM();
    this._bindEvents();
  }

  /**
   * Sync audio with breathing audio for musical continuity
   */
  syncAudio(breathingAudio) {
    this.audio.syncProgression(breathingAudio);
  }

  /**
   * Initialize audio context (call after user interaction)
   */
  async initAudio() {
    await this.audio.init();
  }

  /**
   * Create CSS styles
   */
  _createStyles() {
    if (document.getElementById('side-menu-styles')) return;

    const style = document.createElement('style');
    style.id = 'side-menu-styles';
    style.textContent = `
      .side-menu-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 100;
      }

      /* All positioning calculated from center (--layout-center-x) */
      .side-menu-column {
        position: absolute;
        top: 38%;
        transform: translateY(-50%);
        display: flex;
        flex-direction: column;
        gap: 2.5rem;
        pointer-events: none;
        padding: 1.5rem 0;
      }

      /* Bracket - vertical line with glow */
      .side-menu-column::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        width: 2px;
        background: linear-gradient(
          to bottom,
          transparent 0%,
          rgba(120, 180, 220, 0.3) 10%,
          rgba(120, 180, 220, 0.5) 50%,
          rgba(120, 180, 220, 0.3) 90%,
          transparent 100%
        );
        box-shadow:
          0 0 8px rgba(120, 180, 220, 0.4),
          0 0 15px rgba(120, 180, 220, 0.2);
        opacity: 0;
        transition: opacity 0.4s ease;
      }

      .side-menu-column.visible::before {
        opacity: 1;
      }

      /* LEFT COLUMN - bracket on left, items to right of bracket */
      .side-menu-column.left {
        left: calc(var(--layout-center-x, 50%) - 250px);
        transform: translateY(-50%);
        align-items: flex-start;
      }

      .side-menu-column.left::before {
        left: 0;
      }

      .side-menu-column.left .side-menu-item {
        align-items: flex-start;
        text-align: left;
        margin-left: 1.5rem;
      }

      /* RIGHT COLUMN - items on left, bracket on right */
      .side-menu-column.right {
        right: calc(100% - var(--layout-center-x, 50%) - 250px);
        transform: translateY(-50%);
        align-items: flex-end;
      }

      .side-menu-column.right::before {
        right: 0;
      }

      .side-menu-column.right .side-menu-item {
        align-items: flex-end;
        text-align: right;
        margin-right: 2.5rem;
      }

      .side-menu-item {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        padding: 0.75rem 1rem;
        background: transparent;
        color: rgba(255, 255, 255, 0.75);
        font-family: system-ui, -apple-system, sans-serif;
        cursor: pointer;
        pointer-events: auto;
        opacity: 0;
        transform: translateX(-20px);
        transition:
          opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1),
          transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
          color 0.25s ease;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }

      .side-menu-column.right .side-menu-item {
        transform: translateX(15px);
      }

      .side-menu-item.visible {
        opacity: 1;
        transform: translateX(0);
      }

      .side-menu-item:hover {
        color: rgba(255, 255, 255, 0.95);
      }

      .side-menu-item:hover .side-menu-icon {
        transform: scale(1.1);
        color: rgba(180, 220, 255, 1);
        text-shadow: 0 0 12px rgba(120, 180, 220, 0.7);
      }

      .side-menu-item:hover .side-menu-label {
        color: rgba(255, 255, 255, 0.95);
        text-shadow: 0 0 8px rgba(120, 180, 220, 0.5);
      }

      .side-menu-item:active {
        transform: scale(0.96);
      }

      .side-menu-item.selected .side-menu-icon {
        color: rgba(140, 200, 255, 1);
        text-shadow: 0 0 15px rgba(120, 180, 220, 0.8);
      }

      .side-menu-item.selected .side-menu-label {
        color: rgba(180, 220, 255, 1);
        text-shadow: 0 0 10px rgba(120, 180, 220, 0.6);
      }

      .side-menu-icon {
        font-size: 2.25rem;
        line-height: 1;
        color: rgba(200, 220, 240, 0.7);
        transition:
          transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
          color 0.25s ease,
          text-shadow 0.25s ease;
      }

      .side-menu-label {
        font-size: 1rem;
        font-weight: 600;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        white-space: nowrap;
        color: rgba(255, 255, 255, 0.5);
        transition:
          color 0.25s ease,
          text-shadow 0.25s ease;
      }

      /* Hamburger button */
      .hamburger-button {
        position: absolute;
        top: 1.5rem;
        right: 1.5rem;
        width: 42px;
        height: 42px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(20, 30, 40, 0.6);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(120, 180, 220, 0.15);
        border-radius: 50%;
        color: rgba(200, 220, 240, 0.85);
        font-size: 1.35rem;
        cursor: pointer;
        pointer-events: auto;
        opacity: 0;
        transition:
          opacity 0.3s ease,
          background 0.25s ease,
          border-color 0.25s ease,
          transform 0.2s ease,
          box-shadow 0.25s ease;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        z-index: 101;
        box-shadow:
          0 2px 8px rgba(0, 0, 0, 0.3),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
      }

      .hamburger-button.visible {
        opacity: 1;
      }

      .hamburger-button:hover {
        background: rgba(40, 60, 80, 0.7);
        border-color: rgba(120, 180, 220, 0.35);
        transform: scale(1.08);
        box-shadow:
          0 4px 16px rgba(0, 0, 0, 0.4),
          0 0 12px rgba(120, 180, 220, 0.15),
          inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }

      .hamburger-button:active {
        transform: scale(0.95);
      }

      .hamburger-button.open {
        background: rgba(60, 90, 120, 0.5);
        border-color: rgba(120, 180, 220, 0.4);
        color: rgba(180, 220, 255, 1);
      }

      /* ═══════════════════════════════════════════════════════════════
         MOOD MODE - Vertical carousel with emotion SVG buttons
         Uses native CSS scroll-snap for smooth momentum scrolling
         ═══════════════════════════════════════════════════════════════ */
      .side-menu-column.mood-mode {
        gap: 0;
        padding: 0;
        top: 38%;  /* Keep original position away from mascot */
      }

      .mood-carousel-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;

        /* Native scroll with snap - smooth momentum on all devices */
        max-height: 280px;
        overflow-y: auto;
        overflow-x: hidden;
        scroll-snap-type: y mandatory;
        scroll-behavior: smooth;
        -webkit-overflow-scrolling: touch;  /* iOS momentum */
        overscroll-behavior: contain;  /* Prevent scroll chaining */

        /* Hide scrollbar but keep functionality */
        scrollbar-width: none;  /* Firefox */
        -ms-overflow-style: none;  /* IE/Edge */

        /* Smooth fade at edges */
        mask-image: linear-gradient(
          to bottom,
          transparent 0%,
          black 15%,
          black 85%,
          transparent 100%
        );
        -webkit-mask-image: linear-gradient(
          to bottom,
          transparent 0%,
          black 15%,
          black 85%,
          transparent 100%
        );

        pointer-events: auto;
        padding: 0.5rem 0;
      }

      .mood-carousel-wrapper::-webkit-scrollbar {
        display: none;  /* Chrome/Safari */
      }

      .side-menu-column.left .mood-carousel-wrapper {
        align-items: flex-start;
        margin-left: 0;
      }

      .side-menu-column.right .mood-carousel-wrapper {
        align-items: flex-end;
        margin-right: 0.5rem;
      }

      .side-menu-mood-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.3rem;
        padding: 0.75rem 1.25rem;
        cursor: pointer;
        pointer-events: auto;
        opacity: 0;
        transform: scale(0.85);
        flex-shrink: 0;  /* Don't compress items */
        scroll-snap-align: center;  /* Snap to center */
        scroll-snap-stop: normal;  /* Allow fast scrolling */
        transition:
          opacity 0.2s cubic-bezier(0.25, 0.1, 0.25, 1),
          transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        /* Ensure minimum touch target size (44px recommended) */
        min-height: 44px;
        min-width: 44px;
      }

      .side-menu-column.left .side-menu-mood-item {
        margin-left: 0;
      }

      .side-menu-column.right .side-menu-mood-item {
        margin-right: 0;
      }

      .side-menu-mood-item.visible {
        opacity: 1;
        transform: scale(1);
      }

      .side-menu-mood-item:hover {
        transform: scale(1.1);
      }

      .side-menu-mood-item:active {
        transform: scale(0.95);
      }

      .side-menu-mood-item.selected {
        transform: scale(1.05);
      }

      .side-menu-mood-item.selected .mood-icon {
        filter: drop-shadow(0 0 12px rgba(255, 220, 100, 0.8));
      }

      .mood-icon {
        width: 56px;
        height: 56px;
        transition: filter 0.25s ease, transform 0.25s ease;
        filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.3));
      }

      .side-menu-mood-item:hover .mood-icon {
        filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.6));
      }

      .mood-label {
        font-size: 0.65rem;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.6);
        text-align: center;
        white-space: nowrap;
        transition: color 0.25s ease;
      }

      .side-menu-mood-item:hover .mood-label {
        color: rgba(255, 255, 255, 0.9);
      }

      .side-menu-mood-item.selected .mood-label {
        color: rgba(255, 220, 150, 1);
        text-shadow: 0 0 8px rgba(255, 200, 100, 0.5);
      }

      /* Mobile */
      @media (max-width: 768px) {
        .side-menu-column {
          gap: 1.5rem;
          top: 38%;
        }

        .side-menu-column.left {
          left: calc(var(--layout-center-x, 50%) - 180px);
        }

        .side-menu-column.left .side-menu-item {
          margin-left: 1rem;
        }

        .side-menu-column.right {
          right: calc(100% - var(--layout-center-x, 50%) - 180px);
        }

        .side-menu-column.right .side-menu-item {
          margin-right: 1.5rem;
        }

        .side-menu-item {
          padding: 0.4rem 0.5rem;
          gap: 0.4rem;
        }

        .side-menu-icon {
          font-size: 1.75rem;
        }

        .side-menu-label {
          font-size: 0.75rem;
          letter-spacing: 0.12em;
        }

        .hamburger-button {
          width: 40px;
          height: 40px;
          font-size: 1.25rem;
          top: 1rem;
          right: 1rem;
        }

        /* Mood mode mobile adjustments */
        .side-menu-column.mood-mode {
          gap: 0;
          top: 38%;
        }

        .mood-carousel-wrapper {
          max-height: 240px;
        }

        .side-menu-column.left .mood-carousel-wrapper {
          margin-left: 0;
        }

        .side-menu-column.right .mood-carousel-wrapper {
          margin-right: 0.25rem;
        }

        .mood-icon {
          width: 48px;
          height: 48px;
        }

        .mood-label {
          font-size: 0.55rem;
        }

        .side-menu-mood-item {
          padding: 0.6rem 1rem;
        }

        .side-menu-column.left .side-menu-mood-item {
          margin-left: 0;
        }

        .side-menu-column.right .side-menu-mood-item {
          margin-right: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Create DOM structure
   */
  _createDOM() {
    // Main container
    this.container = document.createElement('div');
    this.container.className = 'side-menu-container';

    // Left column
    this.leftColumn = document.createElement('div');
    this.leftColumn.className = 'side-menu-column left';
    this.leftItems.forEach((item, index) => {
      const el = this._createMenuItem(item, index, 'left');
      this.leftColumn.appendChild(el);
    });

    // Right column
    this.rightColumn = document.createElement('div');
    this.rightColumn.className = 'side-menu-column right';
    this.rightItems.forEach((item, index) => {
      const el = this._createMenuItem(item, index, 'right');
      this.rightColumn.appendChild(el);
    });

    // Hamburger button
    this.hamburgerButton = document.createElement('button');
    this.hamburgerButton.className = 'hamburger-button';
    this.hamburgerButton.innerHTML = '☰';
    this.hamburgerButton.setAttribute('aria-label', 'Toggle menu');

    this.container.appendChild(this.leftColumn);
    this.container.appendChild(this.rightColumn);
    this.container.appendChild(this.hamburgerButton);

    document.body.appendChild(this.container);
  }

  /**
   * Create a menu item element
   */
  _createMenuItem(item, index, side) {
    const el = document.createElement('div');
    el.className = 'side-menu-item';
    el.dataset.id = item.id;
    el.dataset.index = index;
    el.dataset.side = side;

    el.innerHTML = `
      <span class="side-menu-icon">${item.icon}</span>
      <span class="side-menu-label">${item.label}</span>
    `;

    return el;
  }

  /**
   * Bind event listeners
   */
  _bindEvents() {
    // Hamburger toggle
    this.hamburgerButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // Menu item clicks (handles regular items and mood items)
    this.container.addEventListener('click', (e) => {
      const moodItem = e.target.closest('.side-menu-mood-item');
      if (moodItem) {
        this._handleMoodClick(moodItem);
        return;
      }

      const item = e.target.closest('.side-menu-item');
      if (item) {
        this._handleItemClick(item);
      }
    });

    // Menu item hovers (handles both regular and mood items)
    this.container.addEventListener('mouseenter', (e) => {
      const item = e.target.closest('.side-menu-item, .side-menu-mood-item');
      if (item) {
        this.audio.resume();
        this.audio.playHoverStart(parseInt(item.dataset.index));
      }
    }, true);

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  /**
   * Handle menu item click
   */
  _handleItemClick(itemEl) {
    const id = itemEl.dataset.id;
    const index = parseInt(itemEl.dataset.index);

    // Update selection visual
    this.container.querySelectorAll('.side-menu-item').forEach(el => {
      el.classList.remove('selected');
    });
    itemEl.classList.add('selected');

    // Play selection sound
    this.audio.resume();
    this.audio.playSelectionChime(index);

    this.selectedItem = id;

    // Callback
    this.onSelect(id);
  }

  /**
   * Show hamburger button
   */
  showHamburger() {
    this.hamburgerButton.classList.add('visible');
  }

  /**
   * Hide hamburger button
   */
  hideHamburger() {
    this.hamburgerButton.classList.remove('visible');
  }

  /**
   * Toggle menu open/close
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Open the menu
   */
  open() {
    if (this.isOpen) return;
    this.isOpen = true;

    this.hamburgerButton.classList.add('open');
    this.hamburgerButton.innerHTML = '✕';

    // Show bracket frames
    this.leftColumn.classList.add('visible');
    this.rightColumn.classList.add('visible');

    // Play open sound
    this.audio.resume();
    this.audio.playOpenSound();

    // Notify parent
    this.onOpen();

    // Stagger animate items in
    const leftItems = this.leftColumn.querySelectorAll('.side-menu-item');
    const rightItems = this.rightColumn.querySelectorAll('.side-menu-item');

    leftItems.forEach((item, i) => {
      setTimeout(() => {
        item.classList.add('visible');
      }, i * 80);
    });

    rightItems.forEach((item, i) => {
      setTimeout(() => {
        item.classList.add('visible');
      }, i * 80);
    });
  }

  /**
   * Close the menu
   */
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;

    this.hamburgerButton.classList.remove('open');
    this.hamburgerButton.innerHTML = '☰';

    // Hide bracket frames
    this.leftColumn.classList.remove('visible');
    this.rightColumn.classList.remove('visible');

    // Play close sound
    this.audio.resume();
    this.audio.playCloseSound();

    // Animate items out (both regular and mood items)
    const items = this.container.querySelectorAll('.side-menu-item, .side-menu-mood-item');
    items.forEach((item) => {
      item.classList.remove('visible', 'selected');
    });

    this.selectedItem = null;

    // Exit mood mode if active (restore normal menu for next open)
    if (this.isMoodMode) {
      this.isMoodMode = false;
      this.leftColumn.classList.remove('mood-mode');
      this.rightColumn.classList.remove('mood-mode');
      // Notify parent to lower mascot and hide holo text
      this.onMoodModeChange(false);
      // Re-render to restore normal menu items
      this._renderColumns();
    }

    // Notify parent
    this.onClose();
  }

  /**
   * Hide the menu visually without resetting state
   * Used by MenuManager to temporarily hide menu when opening carousel
   * Preserves mood mode and doesn't fire callbacks
   */
  hideVisually() {
    if (!this.isOpen) return;

    // Hide visually but keep isOpen and isMoodMode state
    this.hamburgerButton.classList.remove('open');
    this.hamburgerButton.innerHTML = '☰';

    // Hide bracket frames
    this.leftColumn.classList.remove('visible');
    this.rightColumn.classList.remove('visible');

    // Animate items out (both regular and mood items)
    const items = this.container.querySelectorAll('.side-menu-item, .side-menu-mood-item');
    items.forEach((item) => {
      item.classList.remove('visible', 'selected');
    });

    this.selectedItem = null;

    // Don't reset isMoodMode or fire callbacks - caller handles state
  }

  /**
   * Restore menu visibility (after hideVisually)
   * Used by MenuManager to restore menu when returning from carousel
   */
  showVisually() {
    if (!this.isOpen) return;

    this.hamburgerButton.classList.add('open');
    this.hamburgerButton.innerHTML = '✕';

    // Show bracket frames
    this.leftColumn.classList.add('visible');
    this.rightColumn.classList.add('visible');

    // Animate items in (handle both regular and mood items)
    const leftItems = this.leftColumn.querySelectorAll('.side-menu-item, .side-menu-mood-item');
    const rightItems = this.rightColumn.querySelectorAll('.side-menu-item, .side-menu-mood-item');

    leftItems.forEach((item, i) => {
      setTimeout(() => {
        item.classList.add('visible');
      }, i * 80);
    });

    rightItems.forEach((item, i) => {
      setTimeout(() => {
        item.classList.add('visible');
      }, i * 80);
    });
  }

  /**
   * Clear selection
   */
  clearSelection() {
    this.container.querySelectorAll('.side-menu-item, .side-menu-mood-item').forEach(el => {
      el.classList.remove('selected');
    });
    this.selectedItem = null;
  }

  /**
   * Update layout based on scaler
   * Note: Positioning is now handled purely via CSS using --layout-center-x
   */
  updateLayout() {
    // CSS handles positioning via var(--layout-center-x)
    // This method kept for API compatibility
  }

  /**
   * Enter or exit mood selection mode
   * In mood mode, menu items are replaced with emotion SVG buttons in vertical carousels
   * @param {boolean} enabled - Whether to enable mood mode
   */
  setMoodMode(enabled) {
    if (this.isMoodMode === enabled) return;
    this.isMoodMode = enabled;

    // Reset carousel positions when entering mood mode
    if (enabled) {
      this.leftCarouselIndex = 1;  // Start with second item centered (shows 0,1,2)
      this.rightCarouselIndex = 1;
    }

    // Notify parent (for mascot raise animation)
    this.onMoodModeChange(enabled);

    // Clear any selections
    this.clearSelection();

    // Animate out current items
    const currentItems = this.container.querySelectorAll('.side-menu-item, .side-menu-mood-item');
    currentItems.forEach(item => {
      item.classList.remove('visible');
    });

    // Wait for animation, then swap content
    setTimeout(() => {
      this._renderColumns();

      // Add or remove mood-mode class
      if (enabled) {
        this.leftColumn.classList.add('mood-mode');
        this.rightColumn.classList.add('mood-mode');
      } else {
        this.leftColumn.classList.remove('mood-mode');
        this.rightColumn.classList.remove('mood-mode');
      }

      // Animate in new items with stagger
      const newItems = this.container.querySelectorAll('.side-menu-item, .side-menu-mood-item');
      newItems.forEach((item, i) => {
        setTimeout(() => {
          item.classList.add('visible');
        }, i * 50);
      });
    }, 200);
  }

  /**
   * Re-render column contents based on current mode
   */
  _renderColumns() {
    // Clear columns
    this.leftColumn.innerHTML = '';
    this.rightColumn.innerHTML = '';

    if (this.isMoodMode) {
      // Render mood carousel with 3 visible items per side
      this._renderMoodCarousel('left', MOOD_LEFT_ITEMS, this.leftCarouselIndex, this.leftColumn);
      this._renderMoodCarousel('right', MOOD_RIGHT_ITEMS, this.rightCarouselIndex, this.rightColumn);
    } else {
      // Render regular menu items
      this.leftItems.forEach((item, index) => {
        const el = this._createMenuItem(item, index, 'left');
        this.leftColumn.appendChild(el);
      });

      this.rightItems.forEach((item, index) => {
        const el = this._createMenuItem(item, index, 'right');
        this.rightColumn.appendChild(el);
      });
    }
  }

  /**
   * Render a mood carousel with all items (native scroll-snap handles visibility)
   * @param {string} side - 'left' or 'right'
   * @param {Array} items - Array of mood items
   * @param {number} initialIndex - Index to scroll to initially
   * @param {HTMLElement} column - Column element to render into
   */
  _renderMoodCarousel(side, items, initialIndex, column) {
    // Create a scrollable wrapper for all carousel items
    const wrapper = document.createElement('div');
    wrapper.className = 'mood-carousel-wrapper';
    wrapper.dataset.side = side;

    // Render ALL items - native scroll handles visibility
    items.forEach((item, i) => {
      const el = this._createMoodItem(item, i, side);
      wrapper.appendChild(el);
    });

    column.appendChild(wrapper);

    // Scroll to initial position after render
    requestAnimationFrame(() => {
      const targetItem = wrapper.children[initialIndex];
      if (targetItem) {
        targetItem.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    });
  }

  /**
   * Create a mood item element with SVG icon
   * @param {Object} item - Mood item config { id, label, svg }
   * @param {number} index - Item index
   * @param {string} side - 'left' or 'right'
   * @returns {HTMLElement}
   */
  _createMoodItem(item, index, side) {
    const el = document.createElement('div');
    el.className = 'side-menu-mood-item';
    el.dataset.id = item.id;
    el.dataset.index = index;
    el.dataset.side = side;
    el.dataset.mood = 'true';

    el.innerHTML = `
      <img class="mood-icon" src="${item.svg}" alt="${item.label}" />
      <span class="mood-label">${item.label}</span>
    `;

    return el;
  }

  /**
   * Handle mood item click
   * @param {HTMLElement} itemEl - Clicked element
   */
  _handleMoodClick(itemEl) {
    const id = itemEl.dataset.id;
    const index = parseInt(itemEl.dataset.index);
    const side = itemEl.dataset.side;
    const items = side === 'left' ? MOOD_LEFT_ITEMS : MOOD_RIGHT_ITEMS;

    // Update selection visual
    this.container.querySelectorAll('.side-menu-mood-item').forEach(el => {
      el.classList.remove('selected');
    });
    itemEl.classList.add('selected');

    // Play selection sound
    this.audio.resume();
    this.audio.playSelectionChime(index);

    // Scroll to center the selected item smoothly
    itemEl.scrollIntoView({ block: 'center', behavior: 'smooth' });

    // Get the label for the selected mood
    const moodItem = items.find(m => m.id === id);
    const label = moodItem ? moodItem.label : id.toUpperCase();

    // Callback with mood selection (include label for holo title)
    this.onMoodSelect(id, label);
  }

  /**
   * Clean up
   */
  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    const style = document.getElementById('side-menu-styles');
    if (style) {
      style.parentNode.removeChild(style);
    }

    this.audio.destroy();
  }
}

export default SideMenu;
