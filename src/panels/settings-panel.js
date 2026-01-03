/**
 * SettingsPanel - User Settings Panel
 *
 * Allows users to configure:
 * - ElevenLabs API key (BYOK - Bring Your Own Key)
 * - TTS provider selection (Browser vs ElevenLabs)
 * - Claude API key (BYOK for LLM)
 * - Claude model selection
 *
 * API keys are stored in localStorage and never sent to our servers.
 * API calls are made directly from the browser.
 */

import { MenuPanel } from './menu-panel.js';

// Brand teal color (Eye Tea Green)
const ACCENT_COLOR = '#84CFC5';

// localStorage keys
const STORAGE_KEYS = {
  elevenLabsApiKey: 'emo_elevenlabs_api_key',
  claudeApiKey: 'emo_claude_api_key',
  claudeModel: 'emo_claude_model',
  ttsProvider: 'emo_tts_provider'  // 'browser' or 'elevenlabs'
};

// Available Claude models
const CLAUDE_MODELS = [
  { id: 'claude-3-haiku-20240307', name: 'Haiku', desc: 'Fast & affordable' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Sonnet 3.5', desc: 'Best balance' },
  { id: 'claude-sonnet-4-20250514', name: 'Sonnet 4', desc: 'Latest Sonnet' },
  { id: 'claude-opus-4-5-20251101', name: 'Opus 4.5', desc: 'Most capable' }
];

export class SettingsPanel extends MenuPanel {
  constructor(options = {}) {
    super({
      id: 'settings',
      title: 'Settings',
      ...options
    });

    // Load saved settings
    this._elevenLabsKey = localStorage.getItem(STORAGE_KEYS.elevenLabsApiKey) || '';
    this._claudeKey = localStorage.getItem(STORAGE_KEYS.claudeApiKey) || '';
    this._claudeModel = localStorage.getItem(STORAGE_KEYS.claudeModel) || 'claude-3-haiku-20240307';
    this._ttsProvider = localStorage.getItem(STORAGE_KEYS.ttsProvider) || 'browser';

    // API key validation status
    this._claudeKeyValid = null; // null = not tested, true = valid, false = invalid
    this._elevenLabsKeyValid = null;

    // Callback when settings change
    this.onSettingsChange = options.onSettingsChange || (() => {});

    // Hit regions
    this._rowRegions = [];
    this._bracketRegions = [];

    // Modal state
    this._modal = null;
  }

  /**
   * Called when panel is shown
   */
  _onShow() {
    // Reload from storage in case it changed
    this._elevenLabsKey = localStorage.getItem(STORAGE_KEYS.elevenLabsApiKey) || '';
    this._claudeKey = localStorage.getItem(STORAGE_KEYS.claudeApiKey) || '';
    this._claudeModel = localStorage.getItem(STORAGE_KEYS.claudeModel) || 'claude-3-haiku-20240307';
    this._ttsProvider = localStorage.getItem(STORAGE_KEYS.ttsProvider) || 'browser';
  }

  /**
   * Called when panel is hidden
   */
  _onHide() {
    this._closeModal();
  }

  /**
   * Render the settings panel
   */
  render(ctx, w, h, holoPhone) {
    // Background - gradient for consistency with other panels
    const bgGradient = ctx.createLinearGradient(0, 0, 0, h);
    bgGradient.addColorStop(0, 'rgba(20, 25, 30, 0.98)');
    bgGradient.addColorStop(1, 'rgba(10, 12, 15, 0.99)');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, w, h);

    // Draw brackets
    if (holoPhone && holoPhone.drawPanelBrackets) {
      this._bracketRegions = holoPhone.drawPanelBrackets(ctx, w, h);
    }

    // Content area - standardized +16px inset from brackets
    const bracketWidth = 80;
    const bracketInset = 4;
    const contentX = bracketWidth + bracketInset + 16;
    const contentW = w - (bracketWidth + bracketInset) * 2 - 32;
    const rowEndX = contentX + contentW;

    // Clear hit regions
    this._rowRegions = [];

    // Compact layout when ElevenLabs is selected (3 rows), relaxed when Browser (2 rows)
    const isCompact = this._ttsProvider === 'elevenlabs';

    // === ROW 1: Claude API Key ===
    // Shifted down to add breathing room at top
    const row1Y = isCompact ? 22 : 32;
    this._drawApiKeyRow(ctx, contentX, row1Y, rowEndX, contentW, 'claude', 'Claude', this._claudeKey, isCompact);

    // Separator - standardized opacity (0.08 for subtle separation)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const sep1Y = row1Y + (isCompact ? 48 : 54);
    ctx.moveTo(contentX, sep1Y);
    ctx.lineTo(rowEndX, sep1Y);
    ctx.stroke();

    // === ROW 2: TTS Provider Toggle ===
    const row2Y = sep1Y + (isCompact ? 16 : 22);
    this._drawProviderRow(ctx, contentX, row2Y, rowEndX, isCompact);

    // === ROW 3: ElevenLabs API Key (only show if ElevenLabs selected) ===
    if (isCompact) {
      // Separator
      const sep2Y = row2Y + 32;
      ctx.beginPath();
      ctx.moveTo(contentX, sep2Y);
      ctx.lineTo(rowEndX, sep2Y);
      ctx.stroke();

      const row3Y = sep2Y + 14;
      this._drawApiKeyRow(ctx, contentX, row3Y, rowEndX, contentW, 'elevenlabs', 'ElevenLabs', this._elevenLabsKey, isCompact);
    }

    // === Privacy note at bottom ===
    ctx.font = '600 11px Poppins, sans-serif';
    ctx.fillStyle = 'rgba(132, 207, 197, 0.8)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Keys stored locally only', w / 2, h - 4);
  }

  /**
   * Draw TTS provider selection row
   */
  _drawProviderRow(ctx, startX, centerY, endX, isCompact = false) {
    const labelPadding = 4;

    // Label - large and bright white
    ctx.font = isCompact ? '700 18px Poppins, sans-serif' : '700 20px Poppins, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Voice', startX + labelPadding, centerY);

    // Toggle pills: Browser | ElevenLabs
    const pillHeight = isCompact ? 28 : 32;
    const pillGap = 6;
    const browserWidth = isCompact ? 75 : 85;
    const elevenWidth = isCompact ? 100 : 110;
    const pillStartX = endX - browserWidth - pillGap - elevenWidth - 4;

    // Browser pill
    const isBrowser = this._ttsProvider === 'browser';
    ctx.beginPath();
    ctx.roundRect(pillStartX, centerY - pillHeight / 2, browserWidth, pillHeight, pillHeight / 2);
    ctx.fillStyle = isBrowser ? ACCENT_COLOR : 'rgba(60, 60, 60, 0.9)';
    ctx.fill();
    ctx.strokeStyle = isBrowser ? ACCENT_COLOR : 'rgba(132, 207, 197, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = isCompact ? '500 14px Poppins, sans-serif' : '500 15px Poppins, sans-serif';
    ctx.fillStyle = isBrowser ? 'rgba(0, 0, 0, 1)' : '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText('Browser', pillStartX + browserWidth / 2, centerY + 1);

    this._rowRegions.push({
      name: 'provider-browser',
      x: pillStartX,
      y: centerY - pillHeight / 2,
      w: browserWidth,
      h: pillHeight
    });

    // ElevenLabs pill
    const elevenX = pillStartX + browserWidth + pillGap;
    const isEleven = this._ttsProvider === 'elevenlabs';
    ctx.beginPath();
    ctx.roundRect(elevenX, centerY - pillHeight / 2, elevenWidth, pillHeight, pillHeight / 2);
    ctx.fillStyle = isEleven ? ACCENT_COLOR : 'rgba(60, 60, 60, 0.9)';
    ctx.fill();
    ctx.strokeStyle = isEleven ? ACCENT_COLOR : 'rgba(132, 207, 197, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = isCompact ? '500 14px Poppins, sans-serif' : '500 15px Poppins, sans-serif';
    ctx.fillStyle = isEleven ? 'rgba(0, 0, 0, 1)' : '#FFFFFF';
    ctx.fillText('ElevenLabs', elevenX + elevenWidth / 2, centerY + 1);

    this._rowRegions.push({
      name: 'provider-elevenlabs',
      x: elevenX,
      y: centerY - pillHeight / 2,
      w: elevenWidth,
      h: pillHeight
    });
  }

  /**
   * Draw API key input row (reusable for both Claude and ElevenLabs)
   */
  _drawApiKeyRow(ctx, startX, centerY, endX, contentW, fieldId, label, currentValue, isCompact = false) {
    const labelPadding = 4;

    // Label - large and bright white
    ctx.font = isCompact ? '700 16px Poppins, sans-serif' : '700 18px Poppins, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, startX + labelPadding, centerY);

    // Input field background
    const inputX = startX + labelPadding;
    const inputY = centerY + (isCompact ? 14 : 18);
    const inputW = contentW - labelPadding * 2;
    const inputH = isCompact ? 30 : 34;

    ctx.beginPath();
    ctx.roundRect(inputX, inputY, inputW, inputH, 8);
    ctx.fillStyle = 'rgba(40, 40, 40, 0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(132, 207, 197, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Input text (masked or placeholder)
    ctx.font = isCompact ? '600 14px Poppins, sans-serif' : '600 16px Poppins, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    let displayText;
    if (currentValue) {
      displayText = '••••••••' + currentValue.slice(-4);
    } else {
      displayText = 'Tap to enter key';
    }

    ctx.fillStyle = currentValue
      ? '#FFFFFF'
      : 'rgba(255, 255, 255, 0.65)';
    ctx.fillText(displayText, inputX + 12, inputY + inputH / 2);

    // Status indicator on right side - filled circle for empty, checkmark for set
    const statusX = inputX + inputW - 26;
    const statusY = inputY + inputH / 2;
    if (currentValue) {
      // Green checkmark
      ctx.fillStyle = ACCENT_COLOR;
      ctx.font = isCompact ? '700 16px Poppins, sans-serif' : '700 18px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✓', statusX, statusY);
    } else {
      // Orange filled circle indicator
      ctx.beginPath();
      ctx.arc(statusX, statusY, isCompact ? 6 : 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 140, 60, 1)';
      ctx.fill();
    }

    this._rowRegions.push({
      name: `api-key-${fieldId}`,
      x: inputX,
      y: inputY,
      w: inputW,
      h: inputH,
      extra: { fieldId }
    });
  }


  /**
   * Get hit regions
   */
  getHitRegions() {
    return [...this._bracketRegions, ...this._rowRegions];
  }

  /**
   * Handle touch on settings
   */
  _handleCustomTouch(regionName, extra) {
    if (regionName === 'provider-browser') {
      this._ttsProvider = 'browser';
      localStorage.setItem(STORAGE_KEYS.ttsProvider, 'browser');
      this._notifySettingsChange();
      this.updatePhoneDisplay();
      return;
    }

    if (regionName === 'provider-elevenlabs') {
      this._ttsProvider = 'elevenlabs';
      localStorage.setItem(STORAGE_KEYS.ttsProvider, 'elevenlabs');
      this._notifySettingsChange();
      this.updatePhoneDisplay();
      return;
    }

    if (regionName.startsWith('api-key-')) {
      const fieldId = extra?.fieldId;
      if (fieldId) {
        this._showApiKeyModal(fieldId);
      }
      return;
    }
  }

  /**
   * Notify settings change with all current values
   */
  _notifySettingsChange() {
    this.onSettingsChange({
      ttsProvider: this._ttsProvider,
      elevenLabsApiKey: this._elevenLabsKey,
      claudeApiKey: this._claudeKey,
      claudeModel: this._claudeModel
    });
  }

  /**
   * Show modal for API key entry
   */
  _showApiKeyModal(fieldId) {
    const isClaude = fieldId === 'claude';
    const currentKey = isClaude ? this._claudeKey : this._elevenLabsKey;
    const title = isClaude ? 'Claude API Key' : 'ElevenLabs API Key';
    const placeholder = isClaude ? 'sk-ant-...' : 'xi-...';
    const helpUrl = isClaude
      ? 'https://console.anthropic.com/settings/keys'
      : 'https://elevenlabs.io/app/settings/api-keys';

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'settings-modal-overlay';
    overlay.innerHTML = `
      <div class="settings-modal">
        <div class="settings-modal-header">
          <h2>${title}</h2>
          <button class="settings-modal-close">&times;</button>
        </div>
        <div class="settings-modal-body">
          <div class="settings-modal-field">
            <label>API Key</label>
            <div class="settings-modal-input-wrap">
              <input
                type="password"
                class="settings-modal-input"
                placeholder="${placeholder}"
                value="${currentKey}"
                autocomplete="off"
                spellcheck="false"
              />
              <button class="settings-modal-toggle-vis" title="Show/Hide">👁</button>
            </div>
            <div class="settings-modal-status"></div>
          </div>
          ${isClaude && currentKey ? `
          <div class="settings-modal-field">
            <label>Model</label>
            <div class="settings-modal-models">
              ${CLAUDE_MODELS.map(m => `
                <button class="settings-modal-model ${m.id === this._claudeModel ? 'selected' : ''}" data-model="${m.id}">
                  <span class="model-name">${m.name}</span>
                  <span class="model-desc">${m.desc}</span>
                </button>
              `).join('')}
            </div>
          </div>
          ` : ''}
          <a href="${helpUrl}" target="_blank" class="settings-modal-help">
            Get your API key →
          </a>
        </div>
        <div class="settings-modal-footer">
          <button class="settings-modal-btn secondary" data-action="cancel">Cancel</button>
          <button class="settings-modal-btn primary" data-action="save">Save</button>
        </div>
      </div>
    `;

    // Add styles if not already present
    if (!document.getElementById('settings-modal-styles')) {
      const style = document.createElement('style');
      style.id = 'settings-modal-styles';
      style.textContent = `
        .settings-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 20px;
          animation: modalFadeIn 0.2s ease-out;
        }

        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .settings-modal {
          background: linear-gradient(165deg, rgba(25, 30, 35, 0.98) 0%, rgba(15, 18, 22, 0.99) 100%);
          border: 2px solid rgba(132, 207, 197, 0.4);
          border-radius: 16px;
          width: 100%;
          max-width: 400px;
          box-shadow:
            0 0 40px rgba(132, 207, 197, 0.15),
            0 20px 60px rgba(0, 0, 0, 0.5);
          animation: modalSlideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes modalSlideIn {
          from { transform: translateY(20px) scale(0.95); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }

        .settings-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(132, 207, 197, 0.2);
        }

        .settings-modal-header h2 {
          font-family: 'Poppins', sans-serif;
          font-size: 1.1rem;
          font-weight: 600;
          color: #FFFFFF;
          margin: 0;
        }

        .settings-modal-close {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0;
          line-height: 1;
          transition: color 0.15s ease;
        }

        .settings-modal-close:hover {
          color: #FFFFFF;
        }

        .settings-modal-body {
          padding: 20px;
        }

        .settings-modal-field {
          margin-bottom: 16px;
        }

        .settings-modal-field label {
          display: block;
          font-family: 'Poppins', sans-serif;
          font-size: 0.85rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 8px;
        }

        .settings-modal-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .settings-modal-input {
          width: 100%;
          padding: 12px 44px 12px 14px;
          background: rgba(0, 0, 0, 0.4);
          border: 2px solid rgba(132, 207, 197, 0.4);
          border-radius: 8px;
          color: #FFFFFF;
          font-family: 'SF Mono', 'Consolas', monospace;
          font-size: 0.9rem;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .settings-modal-input:focus {
          border-color: ${ACCENT_COLOR};
          box-shadow: 0 0 0 3px rgba(132, 207, 197, 0.15);
        }

        .settings-modal-input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }

        .settings-modal-toggle-vis {
          position: absolute;
          right: 8px;
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          padding: 4px 8px;
          font-size: 1rem;
          transition: color 0.15s ease;
        }

        .settings-modal-toggle-vis:hover {
          color: #FFFFFF;
        }

        .settings-modal-status {
          margin-top: 8px;
          font-family: 'Poppins', sans-serif;
          font-size: 0.8rem;
          min-height: 20px;
        }

        .settings-modal-status.validating {
          color: rgba(132, 207, 197, 0.8);
        }

        .settings-modal-status.valid {
          color: ${ACCENT_COLOR};
        }

        .settings-modal-status.invalid {
          color: #FF6B6B;
        }

        .settings-modal-models {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .settings-modal-model {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          padding: 10px 12px;
          background: rgba(0, 0, 0, 0.3);
          border: 2px solid rgba(132, 207, 197, 0.3);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .settings-modal-model:hover {
          border-color: rgba(132, 207, 197, 0.6);
          background: rgba(132, 207, 197, 0.1);
        }

        .settings-modal-model.selected {
          border-color: ${ACCENT_COLOR};
          background: rgba(132, 207, 197, 0.2);
        }

        .settings-modal-model .model-name {
          font-family: 'Poppins', sans-serif;
          font-size: 0.9rem;
          font-weight: 600;
          color: #FFFFFF;
        }

        .settings-modal-model .model-desc {
          font-family: 'Poppins', sans-serif;
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.5);
          margin-top: 2px;
        }

        .settings-modal-help {
          display: inline-block;
          font-family: 'Poppins', sans-serif;
          font-size: 0.8rem;
          color: ${ACCENT_COLOR};
          text-decoration: none;
          transition: opacity 0.15s ease;
        }

        .settings-modal-help:hover {
          opacity: 0.8;
        }

        .settings-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 16px 20px;
          border-top: 1px solid rgba(132, 207, 197, 0.2);
        }

        .settings-modal-btn {
          font-family: 'Poppins', sans-serif;
          font-size: 0.9rem;
          font-weight: 500;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .settings-modal-btn.secondary {
          background: transparent;
          border: 2px solid rgba(255, 255, 255, 0.3);
          color: rgba(255, 255, 255, 0.8);
        }

        .settings-modal-btn.secondary:hover {
          border-color: rgba(255, 255, 255, 0.5);
          color: #FFFFFF;
        }

        .settings-modal-btn.primary {
          background: ${ACCENT_COLOR};
          border: 2px solid ${ACCENT_COLOR};
          color: #000000;
        }

        .settings-modal-btn.primary:hover {
          background: #9DDDD4;
          border-color: #9DDDD4;
        }

        .settings-modal-btn.primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(overlay);
    this._modal = overlay;

    // Get elements
    const input = overlay.querySelector('.settings-modal-input');
    const toggleVis = overlay.querySelector('.settings-modal-toggle-vis');
    const status = overlay.querySelector('.settings-modal-status');
    const saveBtn = overlay.querySelector('[data-action="save"]');
    const cancelBtn = overlay.querySelector('[data-action="cancel"]');
    const closeBtn = overlay.querySelector('.settings-modal-close');
    const modelBtns = overlay.querySelectorAll('.settings-modal-model');

    // Focus input
    setTimeout(() => input.focus(), 100);

    // Toggle password visibility
    toggleVis.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      toggleVis.textContent = input.type === 'password' ? '👁' : '🙈';
    });

    // Model selection
    let selectedModel = this._claudeModel;
    modelBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modelBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedModel = btn.dataset.model;
      });
    });

    // Validate on input change (debounced)
    let validateTimeout;
    input.addEventListener('input', () => {
      clearTimeout(validateTimeout);
      const value = input.value.trim();
      if (value) {
        status.textContent = 'Will validate on save...';
        status.className = 'settings-modal-status';
      } else {
        status.textContent = '';
      }
    });

    // Save action
    const handleSave = async () => {
      const value = input.value.trim();

      if (value) {
        // Validate the key
        status.textContent = 'Validating...';
        status.className = 'settings-modal-status validating';
        saveBtn.disabled = true;

        const isValid = isClaude
          ? await this._validateClaudeKey(value)
          : await this._validateElevenLabsKey(value);

        if (isValid) {
          status.textContent = '✓ Key validated successfully';
          status.className = 'settings-modal-status valid';

          // Save the key
          if (isClaude) {
            this._claudeKey = value;
            this._claudeModel = selectedModel;
            localStorage.setItem(STORAGE_KEYS.claudeApiKey, value);
            localStorage.setItem(STORAGE_KEYS.claudeModel, selectedModel);
          } else {
            this._elevenLabsKey = value;
            localStorage.setItem(STORAGE_KEYS.elevenLabsApiKey, value);
          }

          this._notifySettingsChange();
          this.updatePhoneDisplay();

          // Close after brief delay to show success
          setTimeout(() => this._closeModal(), 500);
        } else {
          status.textContent = '✗ Invalid API key';
          status.className = 'settings-modal-status invalid';
          saveBtn.disabled = false;
        }
      } else {
        // Clear the key
        if (isClaude) {
          this._claudeKey = '';
          localStorage.removeItem(STORAGE_KEYS.claudeApiKey);
        } else {
          this._elevenLabsKey = '';
          localStorage.removeItem(STORAGE_KEYS.elevenLabsApiKey);
        }

        this._notifySettingsChange();
        this.updatePhoneDisplay();
        this._closeModal();
      }
    };

    // Event listeners
    saveBtn.addEventListener('click', handleSave);
    cancelBtn.addEventListener('click', () => this._closeModal());
    closeBtn.addEventListener('click', () => this._closeModal());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._closeModal();
    });

    // Enter to save
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSave();
      if (e.key === 'Escape') this._closeModal();
    });
  }

  /**
   * Close the modal
   */
  _closeModal() {
    if (this._modal) {
      this._modal.remove();
      this._modal = null;
    }
  }

  /**
   * Validate Claude API key
   */
  async _validateClaudeKey(apiKey) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });

      return response.ok;
    } catch (error) {
      console.error('Claude key validation error:', error);
      return false;
    }
  }

  /**
   * Validate ElevenLabs API key
   */
  async _validateElevenLabsKey(apiKey) {
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/user', {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey
        }
      });

      return response.ok;
    } catch (error) {
      console.error('ElevenLabs key validation error:', error);
      return false;
    }
  }

  /**
   * Get current settings
   */
  getSettings() {
    return {
      ttsProvider: this._ttsProvider,
      elevenLabsApiKey: this._elevenLabsKey,
      claudeApiKey: this._claudeKey,
      claudeModel: this._claudeModel
    };
  }

  /**
   * Get panel state
   */
  getState() {
    return {
      id: this.id,
      ttsProvider: this._ttsProvider,
      hasElevenLabsKey: !!this._elevenLabsKey,
      hasClaudeKey: !!this._claudeKey,
      claudeModel: this._claudeModel
    };
  }
}

export { STORAGE_KEYS, CLAUDE_MODELS };
export default SettingsPanel;
