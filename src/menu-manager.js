/**
 * MenuManager - Centralized navigation state management
 *
 * Manages a navigation stack to support "back" behavior:
 * - When opening carousel from a menu/panel, remember where we came from
 * - When closing carousel, return to the previous menu/panel state
 * - Handle special cases like mood mode and music playing
 */

/**
 * @typedef {Object} NavState
 * @property {string} type - State type: 'idle', 'menu', 'panel', 'carousel', 'moodMode'
 * @property {string} [panelId] - Panel ID if type is 'panel'
 * @property {boolean} [moodMode] - Whether mood mode was active
 */

export class MenuManager {
  /**
   * @param {Object} options
   * @param {Function} options.onStateChange - Callback when state changes
   */
  constructor(options = {}) {
    /** @type {NavState[]} */
    this._stack = [{ type: 'idle' }];

    // Callback for state changes
    this.onStateChange = options.onStateChange || null;

    // Reference to app components (set via setComponents)
    this._app = null;
  }

  /**
   * Set references to app components
   * @param {Object} app - The EmoAssistant instance
   */
  setApp(app) {
    this._app = app;
  }

  /**
   * Get current navigation state
   * @returns {NavState}
   */
  current() {
    return this._stack[this._stack.length - 1];
  }

  /**
   * Get the previous navigation state (for back navigation)
   * @returns {NavState|null}
   */
  previous() {
    if (this._stack.length < 2) return null;
    return this._stack[this._stack.length - 2];
  }

  /**
   * Get stack depth
   * @returns {number}
   */
  depth() {
    return this._stack.length;
  }

  /**
   * Push a new state onto the navigation stack
   * @param {string} type - State type
   * @param {Object} [options] - Additional state options
   */
  push(type, options = {}) {
    const state = { type, ...options };

    // Don't push duplicate states
    const current = this.current();
    if (current.type === type && current.panelId === options.panelId) {
      console.log('MenuManager: Skipping duplicate state push:', type);
      return;
    }

    console.log('MenuManager: Pushing state:', type, options);
    this._stack.push(state);
    this._notifyChange();
  }

  /**
   * Pop the current state and return to previous
   * @returns {NavState|null} The state we're returning to, or null if at root
   */
  pop() {
    if (this._stack.length <= 1) {
      console.log('MenuManager: Cannot pop - at root state');
      return null;
    }

    const popped = this._stack.pop();
    const returning = this.current();
    console.log('MenuManager: Popped', popped.type, '- returning to:', returning.type);
    this._notifyChange();
    return returning;
  }

  /**
   * Reset stack to idle state
   */
  reset() {
    console.log('MenuManager: Resetting to idle');
    this._stack = [{ type: 'idle' }];
    this._notifyChange();
  }

  /**
   * Replace current state without changing stack depth
   * Useful for switching panels without growing the stack
   * @param {string} type - State type
   * @param {Object} [options] - Additional state options
   */
  replace(type, options = {}) {
    const state = { type, ...options };
    console.log('MenuManager: Replacing current state with:', type, options);
    this._stack[this._stack.length - 1] = state;
    this._notifyChange();
  }

  // ==================== HIGH-LEVEL NAVIGATION METHODS ====================

  /**
   * Navigate to carousel from current state
   * Preserves current state on stack for back navigation
   */
  openCarousel() {
    const current = this.current();
    const app = this._app;
    if (!app) return;

    console.log('MenuManager: Opening carousel from:', current.type);

    // Capture mood mode state before closing (isMoodMode is a property, not method)
    const wasMoodMode = app.sideMenu?.isMoodMode || false;

    // Capture which panel was active if any
    const activePanel = app._getActivePanel();
    const activePanelId = activePanel?.id || null;

    // Update current state with details before pushing carousel
    if (current.type === 'menu' || current.type === 'panel') {
      this._stack[this._stack.length - 1].moodMode = wasMoodMode;
      if (activePanelId) {
        this._stack[this._stack.length - 1].panelId = activePanelId;
      }
    }

    // Close current UI without resetting state
    if (current.type === 'menu' || current.type === 'moodMode' || wasMoodMode) {
      // Just hide the menu visually, don't trigger full close
      if (app.sideMenu?.hideVisually) {
        app.sideMenu.hideVisually();
      } else {
        app.sideMenu?.close?.();
      }
    }

    if (current.type === 'panel' || current.type === 'moodMode') {
      app._hideAllPanels();
    }

    // Push carousel state
    this.push('carousel');

    // Actually open the carousel
    app.openCarousel();
  }

  /**
   * Close carousel and return to previous state
   */
  closeCarousel() {
    const app = this._app;
    if (!app) return;

    // Pop carousel state
    const returning = this.pop();
    if (!returning) {
      // Fallback to idle
      app.closeCarousel();
      return;
    }

    console.log('MenuManager: Closing carousel, returning to:', returning.type, returning);

    // Hide carousel UI
    app.carousel?.hide();

    // Hide floating holographic title
    if (app.elements.carouselTitle) {
      app.elements.carouselTitle.classList.add('hidden');
    }

    // Restore previous state
    this._restoreState(returning);
  }

  /**
   * Open a panel from menu
   * @param {string} panelId - Panel identifier
   */
  openPanel(panelId) {
    const app = this._app;
    if (!app) return;

    // If we're in menu state, replace with panel (same level)
    // If we're in idle, push panel
    const current = this.current();

    if (current.type === 'menu' || current.type === 'moodMode') {
      this.replace('panel', { panelId, moodMode: current.moodMode || current.type === 'moodMode' });
    } else {
      this.push('panel', { panelId });
    }

    app._hideAllPanels();
    app.setState('panel');

    // Show the panel
    const panel = this._getPanelById(panelId);
    if (panel) {
      panel.show();
    }
  }

  /**
   * Close current panel
   */
  closePanel() {
    const app = this._app;
    if (!app) return;

    const current = this.current();

    // If we were in mood mode, return to mood mode menu
    if (current.moodMode) {
      app._hideAllPanels();
      app.sideMenu?.setMoodMode?.(true);
      this.replace('moodMode');
      app.setState('menu');
      return;
    }

    // Otherwise go back to idle
    this.reset();
    app._hideAllPanels();
    app.sideMenu?.close();
    app.setState('idle');
    app.resetScreen();
  }

  /**
   * Open menu
   */
  openMenu() {
    const app = this._app;
    if (!app) return;

    this.push('menu');
    app.setState('menu');
    app.sideMenu?.open();
  }

  /**
   * Close menu completely
   */
  closeMenu() {
    const app = this._app;
    if (!app) return;

    this.reset();
    app.sideMenu?.close();
    app.setState('idle');
    app.resetScreen();
  }

  /**
   * Enter mood mode
   */
  enterMoodMode() {
    const app = this._app;
    if (!app) return;

    // Replace current menu state with mood mode
    this.replace('moodMode');
    app.sideMenu?.setMoodMode?.(true);
  }

  /**
   * Exit mood mode
   */
  exitMoodMode() {
    const app = this._app;
    if (!app) return;

    // Go back to regular menu
    this.replace('menu');
    app.sideMenu?.setMoodMode?.(false);
  }

  // ==================== INTERNAL HELPERS ====================

  /**
   * Restore a navigation state
   * @param {NavState} state
   */
  _restoreState(state) {
    const app = this._app;
    if (!app) return;

    console.log('MenuManager: Restoring state:', state);

    switch (state.type) {
      case 'idle':
        app.setState('idle');
        app.resetScreen();
        app.sideMenu?.hideHamburger?.();
        // Sync music UI state - updates HoloPhone display
        app.musicPanel?._syncMusicUIState?.();
        break;

      case 'menu':
        app.setState('menu');
        // Use showVisually to restore without triggering onOpen callback
        if (app.sideMenu?.showVisually) {
          app.sideMenu.showVisually();
        } else {
          app.sideMenu?.open?.();
        }
        if (state.moodMode) {
          // Mood mode is already preserved, just need to show mood panel
          app._hideAllPanels();
          app.moodPanel?.show();
          app.setState('panel');
        }
        // Sync music UI state - updates HoloPhone display
        app.musicPanel?._syncMusicUIState?.();
        break;

      case 'moodMode':
        app.setState('menu');
        // Use showVisually to restore without triggering onOpen callback
        if (app.sideMenu?.showVisually) {
          app.sideMenu.showVisually();
        } else {
          app.sideMenu?.open?.();
        }
        // Also show mood panel
        app._hideAllPanels();
        app.moodPanel?.show();
        app.setState('panel');
        // Sync music UI state - updates HoloPhone display
        app.musicPanel?._syncMusicUIState?.();
        break;

      case 'panel':
        app.setState('panel');
        // Restore the side menu visually if it was visible
        if (app.sideMenu?.isOpen) {
          if (app.sideMenu?.showVisually) {
            app.sideMenu.showVisually();
          }
        }
        // Show the panel
        const panel = this._getPanelById(state.panelId);
        if (panel) {
          panel.show();
        }
        // Sync music UI state (unless this IS the music panel, which handles itself)
        if (state.panelId !== 'music') {
          app.musicPanel?._syncMusicUIState?.();
        }
        break;

      default:
        console.warn('MenuManager: Unknown state type:', state.type);
        app.setState('idle');
        app.resetScreen();
    }
  }

  /**
   * Get panel instance by ID
   * @param {string} panelId
   * @returns {Object|null}
   */
  _getPanelById(panelId) {
    const app = this._app;
    if (!app) return null;

    switch (panelId) {
      case 'effects': return app.effectsPanel;
      case 'meditate': return app.meditatePanel;
      case 'stories': return app.storiesPanel;
      case 'settings': return app.settingsPanel;
      case 'music': return app.musicPanel;
      case 'mood': return app.moodPanel;
      default: return null;
    }
  }

  /**
   * Notify of state change
   */
  _notifyChange() {
    if (this.onStateChange) {
      this.onStateChange(this.current(), this._stack);
    }
  }

  /**
   * Debug: Get full stack for inspection
   * @returns {NavState[]}
   */
  getStack() {
    return [...this._stack];
  }
}

export default MenuManager;
