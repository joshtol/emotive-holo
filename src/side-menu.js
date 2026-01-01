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

export class SideMenu {
  constructor(options = {}) {
    this.onSelect = options.onSelect || (() => {});
    this.onOpen = options.onOpen || (() => {});
    this.onClose = options.onClose || (() => {});
    this.layoutScaler = options.layoutScaler;

    this.isOpen = false;
    this.selectedItem = null;

    // Menu items configuration (3 per side, icon above label)
    this.leftItems = [
      { id: 'music', label: 'MUSIC', icon: '♪' },
      { id: 'meditate', label: 'MEDITATE', icon: '◎' },
      { id: 'effects', label: 'EFFECTS', icon: '✧' }
    ];

    this.rightItems = [
      { id: 'settings', label: 'SETTINGS', icon: '⚙' },
      { id: 'moods', label: 'MOODS', icon: '☼' },
      { id: 'stories', label: 'STORIES', icon: '☰' }
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
        top: 42%;
        transform: translateY(-50%);
        display: flex;
        flex-direction: column;
        gap: 2.5rem;
        pointer-events: none;
        padding: 2.5rem 0;
      }

      /* Bracket - vertical line with glow */
      .side-menu-column::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        width: 3px;
        background: linear-gradient(
          to bottom,
          transparent 0%,
          rgba(120, 180, 220, 0.4) 10%,
          rgba(120, 180, 220, 0.7) 50%,
          rgba(120, 180, 220, 0.4) 90%,
          transparent 100%
        );
        box-shadow:
          0 0 10px rgba(120, 180, 220, 0.6),
          0 0 20px rgba(120, 180, 220, 0.3);
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
        color: rgba(200, 220, 240, 0.9);
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
        color: rgba(255, 255, 255, 0.65);
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

      /* Mobile */
      @media (max-width: 768px) {
        .side-menu-column {
          gap: 1.5rem;
          top: 38%;
        }

        .side-menu-column.left {
          left: calc(var(--layout-center-x, 50%) - 160px);
        }

        .side-menu-column.left .side-menu-item {
          margin-left: 1rem;
        }

        .side-menu-column.right {
          right: calc(100% - var(--layout-center-x, 50%) - 160px);
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

    // Menu item clicks
    this.container.addEventListener('click', (e) => {
      const item = e.target.closest('.side-menu-item');
      if (item) {
        this._handleItemClick(item);
      }
    });

    // Menu item hovers
    this.container.addEventListener('mouseenter', (e) => {
      const item = e.target.closest('.side-menu-item');
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

    // Animate items out
    const items = this.container.querySelectorAll('.side-menu-item');
    items.forEach((item) => {
      item.classList.remove('visible', 'selected');
    });

    this.selectedItem = null;

    // Notify parent
    this.onClose();
  }

  /**
   * Clear selection
   */
  clearSelection() {
    this.container.querySelectorAll('.side-menu-item').forEach(el => {
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
