/**
 * MusicPanel - Background Music Selection Panel
 *
 * Features:
 * - Track selection with radio-style selection
 * - Vertical mixer-style volume fader
 * - Play/pause button
 * - Track duration displayed in holo title subtitle
 * - Standard bracket navigation (X to close, checkmark to confirm)
 *
 * Uses HoloPhone's shared drawing methods for consistent carousel styling.
 * Extends MenuPanel for common lifecycle and rendering utilities.
 */

import { MenuPanel } from './menu-panel.js';

// Brand teal color (Eye Tea Green)
const ACCENT_COLOR = '#84CFC5';

// Detect base path for assets (handles GitHub Pages /emotive-holo/ prefix)
const BASE_PATH = window.location.pathname.includes('/emotive-holo/') ? '/emotive-holo' : '.';

// Music track options with BPM for rhythm sync
const TRACKS = [
  {
    id: 'electric-glow-f',
    label: 'Electric Glow (F)',
    desc: 'Female vocal',
    file: `${BASE_PATH}/assets/music/electric-glow-f.wav`,
    bpm: 120,
    duration: '3:24'
  },
  {
    id: 'electric-glow-m',
    label: 'Electric Glow (M)',
    desc: 'Male vocal',
    file: `${BASE_PATH}/assets/music/electric-glow-m.wav`,
    bpm: 120,
    duration: '3:18'
  }
];

export class MusicPanel extends MenuPanel {
  constructor(options = {}) {
    super({
      id: 'music',
      title: 'Music',
      ...options
    });

    // Currently selected track index
    this.selectedIndex = 0;

    // Audio playback state
    this._audio = null;
    this._isPlaying = false;
    this._isStartingPlayback = false; // True while audio.play() is pending
    this._isPausedForMode = false; // True when paused for meditation/story (show controls but paused)
    this._currentTime = 0;
    this._duration = 0;

    // Playback mode - when true, shows playback view instead of track selection
    this._playbackMode = false;

    // Audio analyser for visualizer
    this._audioContext = null;
    this._analyser = null;
    this._audioSource = null;
    this._frequencyData = null;

    // Reference to mascot for rhythm sync
    this.mascot = options.mascot || null;

    // Reference to HoloPhone for music display
    this.holoPhone = options.holoPhone || null;

    // Hit regions (set during render)
    this._trackRegions = [];

    // Scrubber drag state
    this._scrubberDragging = false;
    this._bracketRegions = [];
    this._controlRegions = [];

    // Time update interval
    this._timeUpdateInterval = null;
  }

  /**
   * Override show to NOT raise mascot or show floating title - music panel has its own controls
   */
  show() {
    this.isVisible = true;

    // Don't call _showTitle() - we want to HIDE floating controls when music panel is visible
    // The panel itself has play/pause controls, so floating holo controls are redundant
    // _syncMusicUIState will hide them if they were visible

    this._onShow();
    this.updatePhoneDisplay();
  }

  /**
   * Called when panel is shown
   */
  _onShow() {
    // Don't reset selection - keep previous choice

    // Sync music UI state - will hide floating controls since panel is visible
    this._syncMusicUIState();

    if (this._isPlaying) {
      this._startTimeUpdate();
    }
  }

  /**
   * Sync music UI state - updates HoloPhone display only
   * Music controls only exist within the music panel itself (no floating holo controls)
   */
  _syncMusicUIState() {
    const shouldShowControls = this._isPlaying || this._isStartingPlayback || this._isPausedForMode;
    const track = TRACKS[this.selectedIndex];

    // Update HoloPhone to show music state
    if (shouldShowControls && this.holoPhone) {
      this.holoPhone.setMusicData({
        trackName: track.label,
        isPlaying: this._isPlaying,
        currentTime: this._currentTime,
        duration: track.duration
      });
    } else if (this.holoPhone) {
      this.holoPhone.setMusicData(null);
    }
  }

  /**
   * Select previous track
   */
  _selectPrevTrack() {
    this.selectedIndex = (this.selectedIndex - 1 + TRACKS.length) % TRACKS.length;

    // If currently playing, switch to new track
    if (this._isPlaying) {
      this._playTrack(TRACKS[this.selectedIndex]);
    }

    this.updatePhoneDisplay();
  }

  /**
   * Select next track
   */
  _selectNextTrack() {
    this.selectedIndex = (this.selectedIndex + 1) % TRACKS.length;

    // If currently playing, switch to new track
    if (this._isPlaying) {
      this._playTrack(TRACKS[this.selectedIndex]);
    }

    this.updatePhoneDisplay();
  }

  /**
   * Called when panel is hidden
   */
  _onHide() {
    // Stop time update interval (but keep music playing)
    this._stopTimeUpdate();
  }

  /**
   * Override hide - just set visibility flag
   */
  hide() {
    this.isVisible = false;
    this._syncMusicUIState();
    this._onHide();
  }

  /**
   * Update the HoloPhone time display
   * Called periodically by the time update interval
   */
  _updateHoloTitle() {
    // Update HoloPhone time display
    if (this.holoPhone && this._isPlaying) {
      const track = TRACKS[this.selectedIndex];
      this.holoPhone.updateMusicData({
        currentTime: this._currentTime,
        isPlaying: this._isPlaying
      });
    }
  }

  /**
   * Format seconds to MM:SS
   */
  _formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Start updating time display
   */
  _startTimeUpdate() {
    this._stopTimeUpdate();
    this._timeUpdateInterval = setInterval(() => {
      if (this._audio && this._isPlaying) {
        this._currentTime = this._audio.currentTime;
        this._updateHoloTitle();
      }
    }, 500);
  }

  /**
   * Stop updating time display
   */
  _stopTimeUpdate() {
    if (this._timeUpdateInterval) {
      clearInterval(this._timeUpdateInterval);
      this._timeUpdateInterval = null;
    }
  }

  /**
   * Render the music panel content
   * Shows track selection or playback view depending on mode
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   * @param {HoloPhone} holoPhone - HoloPhone instance for shared drawing
   */
  render(ctx, w, h, holoPhone) {
    // Background - dark panel style
    const bgGradient = ctx.createLinearGradient(0, 0, w, h);
    bgGradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    bgGradient.addColorStop(1, 'rgba(10, 20, 30, 0.9)');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, w, h);

    // Clear hit regions
    this._trackRegions = [];
    this._controlRegions = [];

    // Content area (between brackets)
    const bracketWidth = 80;
    const bracketInset = 4;
    const contentX = bracketWidth + bracketInset + 12;
    const contentW = w - (bracketWidth + bracketInset) * 2 - 24;

    if (this._playbackMode) {
      // Playback mode: custom brackets with controls on right
      this._bracketRegions = this._drawPlaybackBrackets(ctx, w, h, holoPhone);
      this._renderPlaybackView(ctx, contentX, contentW, h);
    } else {
      // Track selection mode: use same bracket style as other panels
      this._bracketRegions = this._drawSelectionBrackets(ctx, w, h, holoPhone);
      this._renderTrackSelection(ctx, contentX, contentW, h);
    }
  }

  /**
   * Render track selection view
   */
  _renderTrackSelection(ctx, contentX, contentW, h) {
    // === TRACK ROWS ===
    // Center tracks vertically - larger row height for better readability
    const rowHeight = 80;
    const totalTrackHeight = TRACKS.length * rowHeight;
    const rowStartY = (h - totalTrackHeight) / 2;

    TRACKS.forEach((track, index) => {
      const rowY = rowStartY + index * rowHeight;
      const isSelected = index === this.selectedIndex;

      this._drawTrackRow(ctx, contentX, rowY, contentW, rowHeight, track, isSelected, index);

      // Add subtle separator line (except after last row)
      if (index < TRACKS.length - 1) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(contentX, rowY + rowHeight);
        ctx.lineTo(contentX + contentW, rowY + rowHeight);
        ctx.stroke();
      }
    });
  }

  /**
   * Draw a track row with label, description, and radio selection
   */
  _drawTrackRow(ctx, x, y, w, h, track, isSelected, index) {
    const rowCenterY = y + h / 2;
    const radioRadius = 10;
    const radioPadding = 8;
    const radioX = x + radioPadding + radioRadius;

    // Radio button
    this._drawRadioCircle(ctx, radioX, rowCenterY, radioRadius, isSelected);

    // Track name - larger, bolder
    const textX = radioX + radioRadius + 12;
    ctx.font = '600 22px Poppins, sans-serif';
    ctx.fillStyle = isSelected ? ACCENT_COLOR : 'rgba(255, 255, 255, 0.9)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(track.label, textX, rowCenterY - 14);

    // Description and duration - larger with better contrast
    ctx.font = '500 18px Poppins, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillText(`${track.desc} • ${track.duration}`, textX, rowCenterY + 18);

    // Hit region for entire row
    this._trackRegions.push({
      name: `track-${index}`,
      x: x,
      y: y,
      w: w,
      h: h,
      extra: { index, trackId: track.id }
    });
  }

  /**
   * Draw radio selection indicator
   */
  _drawRadioCircle(ctx, x, y, radius, selected) {
    // Outer circle
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (selected) {
      // Inner filled circle
      ctx.beginPath();
      ctx.arc(x, y, radius - 4, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT_COLOR;
      ctx.fill();
    }
  }

  // ==================== SELECTION MODE BRACKETS ====================

  /**
   * Draw brackets for track selection mode - matches HoloPhone panel styling
   * Left: X button (cancel) - magenta
   * Right: Checkmark (confirm) - green
   */
  _drawSelectionBrackets(ctx, w, h, holoPhone) {
    // Use HoloPhone's drawPanelBrackets if available - ensures consistency
    if (holoPhone && holoPhone.drawPanelBrackets) {
      return holoPhone.drawPanelBrackets(ctx, w, h);
    }

    // Fallback: match HoloPhone style exactly
    const bracketWidth = 80;
    const bracketLineWidth = 4;
    const bracketInset = 4;
    const cornerRadius = 28;
    const edgeInset = 4;

    // Check for pressed buttons
    const pressProgress = holoPhone?._pressedButton
      ? Math.min((performance.now() - holoPhone._pressStart) / holoPhone._pressDuration, 1)
      : 0;
    const flashIntensity = pressProgress < 0.3
      ? pressProgress / 0.3
      : 1 - (pressProgress - 0.3) / 0.7;

    const cancelPressed = holoPhone?._pressedButton === 'cancel';
    const confirmPressed = holoPhone?._pressedButton === 'confirm';

    const cancelColor = cancelPressed ? `rgba(221, 74, 154, ${0.9 + flashIntensity * 0.1})` : 'rgba(221, 74, 154, 0.8)';
    const confirmColor = confirmPressed ? `rgba(92, 212, 158, ${0.9 + flashIntensity * 0.1})` : 'rgba(74, 184, 136, 0.8)';

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // LEFT BRACKET - Cancel
    ctx.strokeStyle = cancelColor;
    ctx.lineWidth = cancelPressed ? bracketLineWidth + 2 : bracketLineWidth;
    if (cancelPressed) {
      ctx.shadowColor = '#DD4A9A';
      ctx.shadowBlur = 15 * flashIntensity;
    }
    ctx.beginPath();
    ctx.moveTo(bracketInset + bracketWidth, edgeInset);
    ctx.lineTo(bracketInset + cornerRadius, edgeInset);
    ctx.quadraticCurveTo(bracketInset + edgeInset, edgeInset, bracketInset + edgeInset, edgeInset + cornerRadius);
    ctx.lineTo(bracketInset + edgeInset, h - edgeInset - cornerRadius);
    ctx.quadraticCurveTo(bracketInset + edgeInset, h - edgeInset, bracketInset + cornerRadius, h - edgeInset);
    ctx.lineTo(bracketInset + bracketWidth, h - edgeInset);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Cancel X icon
    const cancelCenterX = bracketInset + bracketWidth / 2 + 4;
    ctx.fillStyle = cancelPressed ? '#E85DB0' : '#DD4A9A';
    ctx.shadowColor = '#DD4A9A';
    ctx.shadowBlur = cancelPressed ? 15 * flashIntensity : 0;
    ctx.font = '700 28px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', cancelCenterX, h / 2);
    ctx.shadowBlur = 0;

    // RIGHT BRACKET - Confirm
    const rightX = w - bracketInset - bracketWidth;
    ctx.strokeStyle = confirmColor;
    ctx.lineWidth = confirmPressed ? bracketLineWidth + 2 : bracketLineWidth;
    if (confirmPressed) {
      ctx.shadowColor = '#5CD49E';
      ctx.shadowBlur = 15 * flashIntensity;
    }
    ctx.beginPath();
    ctx.moveTo(rightX, edgeInset);
    ctx.lineTo(rightX + bracketWidth - cornerRadius, edgeInset);
    ctx.quadraticCurveTo(rightX + bracketWidth - edgeInset, edgeInset, rightX + bracketWidth - edgeInset, edgeInset + cornerRadius);
    ctx.lineTo(rightX + bracketWidth - edgeInset, h - edgeInset - cornerRadius);
    ctx.quadraticCurveTo(rightX + bracketWidth - edgeInset, h - edgeInset, rightX + bracketWidth - cornerRadius, h - edgeInset);
    ctx.lineTo(rightX, h - edgeInset);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Confirm checkmark icon
    const confirmCenterX = rightX + bracketWidth / 2 - 4;
    ctx.fillStyle = confirmPressed ? '#5CD49E' : '#4AB888';
    ctx.shadowColor = '#5CD49E';
    ctx.shadowBlur = confirmPressed ? 15 * flashIntensity : 0;
    ctx.font = '700 28px Poppins, sans-serif';
    ctx.fillText('✓', confirmCenterX, h / 2);
    ctx.shadowBlur = 0;

    // Return hit regions
    return [
      { name: 'cancel', x: 0, y: 0, w: bracketWidth + bracketInset, h: h },
      { name: 'confirm', x: w - bracketWidth - bracketInset, y: 0, w: bracketWidth + bracketInset, h: h }
    ];
  }

  // ==================== PLAYBACK MODE ====================

  /**
   * Draw custom brackets for playback mode
   * Left: X button (stop and exit) - matches HoloPhone style
   * Right: Playback controls (prev, play/pause, next) - matches HoloPhone style
   */
  _drawPlaybackBrackets(ctx, w, h, holoPhone) {
    const bracketWidth = 80;
    const bracketLineWidth = 4;
    const bracketInset = 4;
    const cornerRadius = 28;
    const edgeInset = 4;

    // Check for pressed buttons
    const pressProgress = holoPhone?._pressedButton
      ? Math.min((performance.now() - holoPhone._pressStart) / holoPhone._pressDuration, 1)
      : 0;
    const flashIntensity = pressProgress < 0.3
      ? pressProgress / 0.3
      : 1 - (pressProgress - 0.3) / 0.7;

    const cancelPressed = holoPhone?._pressedButton === 'cancel';

    const centerY = h / 2;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // LEFT BRACKET - Cancel/Stop - matches HoloPhone style
    const cancelColor = cancelPressed ? `rgba(221, 74, 154, ${0.9 + flashIntensity * 0.1})` : 'rgba(221, 74, 154, 0.8)';
    ctx.strokeStyle = cancelColor;
    ctx.lineWidth = cancelPressed ? bracketLineWidth + 2 : bracketLineWidth;

    if (cancelPressed) {
      ctx.shadowColor = '#DD4A9A';
      ctx.shadowBlur = 15 * flashIntensity;
    }

    ctx.beginPath();
    ctx.moveTo(bracketInset + bracketWidth, edgeInset);
    ctx.lineTo(bracketInset + cornerRadius, edgeInset);
    ctx.quadraticCurveTo(bracketInset + edgeInset, edgeInset, bracketInset + edgeInset, edgeInset + cornerRadius);
    ctx.lineTo(bracketInset + edgeInset, h - edgeInset - cornerRadius);
    ctx.quadraticCurveTo(bracketInset + edgeInset, h - edgeInset, bracketInset + cornerRadius, h - edgeInset);
    ctx.lineTo(bracketInset + bracketWidth, h - edgeInset);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // X icon in left bracket
    const cancelCenterX = bracketInset + bracketWidth / 2 + 4;
    ctx.fillStyle = cancelPressed ? '#E85DB0' : '#DD4A9A';
    ctx.shadowColor = '#DD4A9A';
    ctx.shadowBlur = cancelPressed ? 15 * flashIntensity : 0;
    ctx.font = '700 28px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', cancelCenterX, centerY);
    ctx.shadowBlur = 0;

    // RIGHT BRACKET - Playback controls - matches HoloPhone style
    const confirmColor = 'rgba(74, 184, 136, 0.8)';
    const rightX = w - bracketInset - bracketWidth;
    ctx.strokeStyle = confirmColor;
    ctx.lineWidth = bracketLineWidth;

    ctx.beginPath();
    ctx.moveTo(rightX, edgeInset);
    ctx.lineTo(rightX + bracketWidth - cornerRadius, edgeInset);
    ctx.quadraticCurveTo(rightX + bracketWidth - edgeInset, edgeInset, rightX + bracketWidth - edgeInset, edgeInset + cornerRadius);
    ctx.lineTo(rightX + bracketWidth - edgeInset, h - edgeInset - cornerRadius);
    ctx.quadraticCurveTo(rightX + bracketWidth - edgeInset, h - edgeInset, rightX + bracketWidth - cornerRadius, h - edgeInset);
    ctx.lineTo(rightX, h - edgeInset);
    ctx.stroke();

    // Draw playback controls in right bracket (vertically stacked)
    const rightCenterX = rightX + bracketWidth / 2 - 4;
    const controlSpacing = 58; // More space between controls
    const playPauseSize = 18;
    const skipSize = 9; // Smaller, more delicate skip icons

    // Previous track (top) - smaller skip icon
    const prevY = centerY - controlSpacing;
    this._drawPrevIcon(ctx, rightCenterX, prevY, skipSize);
    this._controlRegions.push({
      name: 'prev-track',
      x: rightX,
      y: prevY - 25,
      w: bracketWidth,
      h: 50
    });

    // Play/Pause (middle) - larger with ring indicator
    if (this._isPlaying) {
      this._drawPauseIcon(ctx, rightCenterX, centerY, playPauseSize);
    } else {
      this._drawPlayIcon(ctx, rightCenterX, centerY, playPauseSize);
    }
    this._controlRegions.push({
      name: 'play-pause',
      x: rightX,
      y: centerY - 25,
      w: bracketWidth,
      h: 50
    });

    // Next track (bottom) - smaller skip icon
    const nextY = centerY + controlSpacing;
    this._drawNextIcon(ctx, rightCenterX, nextY, skipSize);
    this._controlRegions.push({
      name: 'next-track',
      x: rightX,
      y: nextY - 25,
      w: bracketWidth,
      h: 50
    });

    // Return hit regions for cancel button only (controls are separate)
    return [
      {
        name: 'cancel',
        x: 0,
        y: 0,
        w: bracketWidth + bracketInset,
        h: h
      }
    ];
  }

  /**
   * Draw previous track icon - minimalist double chevron
   */
  _drawPrevIcon(ctx, x, y, size) {
    // Simple, clean double chevron - no background circle
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const chevronW = size * 0.65;
    const chevronH = size * 0.9;
    const gap = size * 0.45;

    // Calculate total width and center offset
    const totalWidth = gap + chevronW * 2;
    const centerOffset = totalWidth / 2 - chevronW;

    // Left chevron (pointing left) - tip at center-offset
    ctx.beginPath();
    ctx.moveTo(x - centerOffset, y - chevronH);
    ctx.lineTo(x - centerOffset - chevronW, y);
    ctx.lineTo(x - centerOffset, y + chevronH);
    ctx.stroke();

    // Right chevron (pointing left) - tip at center+offset
    ctx.beginPath();
    ctx.moveTo(x + centerOffset + chevronW, y - chevronH);
    ctx.lineTo(x + centerOffset, y);
    ctx.lineTo(x + centerOffset + chevronW, y + chevronH);
    ctx.stroke();
  }

  /**
   * Draw next track icon - clean double chevron pointing right
   */
  _drawNextIcon(ctx, x, y, size) {
    // Simple, clean double chevron - no background circle
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const chevronW = size * 0.65;
    const chevronH = size * 0.9;
    const gap = size * 0.45;

    // Calculate total width and center offset
    const totalWidth = gap + chevronW * 2;
    const centerOffset = totalWidth / 2 - chevronW;

    // Left chevron (pointing right) - tip at center-offset
    ctx.beginPath();
    ctx.moveTo(x - centerOffset - chevronW, y - chevronH);
    ctx.lineTo(x - centerOffset, y);
    ctx.lineTo(x - centerOffset - chevronW, y + chevronH);
    ctx.stroke();

    // Right chevron (pointing right) - tip at center+offset
    ctx.beginPath();
    ctx.moveTo(x + centerOffset, y - chevronH);
    ctx.lineTo(x + centerOffset + chevronW, y);
    ctx.lineTo(x + centerOffset, y + chevronH);
    ctx.stroke();
  }

  /**
   * Draw play icon - minimalist with ring
   */
  _drawPlayIcon(ctx, x, y, size) {
    // Subtle outer glow
    ctx.beginPath();
    ctx.arc(x, y, size + 12, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(132, 207, 197, 0.15)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Outer ring - more visible
    ctx.beginPath();
    ctx.arc(x, y, size + 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Play triangle - stroke style
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x - size * 0.6, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x - size * 0.6, y + size);
    ctx.closePath();
    ctx.stroke();
  }

  /**
   * Draw pause icon - minimalist with ring and subtle breathing pulse
   */
  _drawPauseIcon(ctx, x, y, size) {
    const time = performance.now() / 1000;
    // Subtle breathing effect - very gentle pulse
    const breathe = 0.5 + Math.sin(time * 2) * 0.08;

    // Subtle outer glow with breathing
    ctx.beginPath();
    ctx.arc(x, y, size + 12, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(132, 207, 197, ${0.15 + breathe * 0.1})`;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Outer ring with accent glow and breathing
    ctx.beginPath();
    ctx.arc(x, y, size + 8, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(132, 207, 197, ${0.5 + breathe * 0.1})`;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Pause bars - stroke style
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    const barGap = 6;

    ctx.beginPath();
    ctx.moveTo(x - barGap, y - size);
    ctx.lineTo(x - barGap, y + size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + barGap, y - size);
    ctx.lineTo(x + barGap, y + size);
    ctx.stroke();
  }

  /**
   * Render playback view with visualizer and scrubber
   */
  _renderPlaybackView(ctx, contentX, contentW, h) {
    const track = TRACKS[this.selectedIndex];

    // Track title at top - larger
    ctx.font = '600 24px Poppins, sans-serif';
    ctx.fillStyle = ACCENT_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(track.label, contentX + contentW / 2, 6);

    // Subtitle - larger with better contrast
    ctx.font = '500 17px Poppins, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText(track.desc, contentX + contentW / 2, 36);

    // Visualizer area - with padding from title and scrubber
    const vizY = 68; // More space below subtitle
    const vizH = h - 118; // More breathing room above scrubber
    this._drawCubicVisualizer(ctx, contentX - 10, vizY, contentW + 20, vizH);

    // Scrubber at bottom
    const scrubberY = h - 66;
    this._drawScrubber(ctx, contentX, scrubberY, contentW);
  }

  /**
   * Draw flowing wave visualizer
   * Horizontal audio waveform with organic motion
   */
  _drawCubicVisualizer(ctx, x, y, w, h) {
    // Lazy connect to mascot's analyzer
    if (!this._analyser && this.mascot?._analyzerNode) {
      this._analyser = this.mascot._analyzerNode;
      this._frequencyData = new Uint8Array(this._analyser.frequencyBinCount);
      this._usingMascotAnalyser = true;
      console.log('Lazy connected to mascot audio analyser');
    }

    // Reduced bar count for cleaner look
    const numBars = 18;
    if (!this._smoothedWave) {
      this._smoothedWave = new Float32Array(numBars).fill(0.15);
      this._peakHold = new Float32Array(numBars).fill(0);
      this._peakDecay = new Float32Array(numBars).fill(0);
    }

    // Get frequency data
    let frequencies = null;
    if (this._analyser && this._frequencyData) {
      this._analyser.getByteFrequencyData(this._frequencyData);
      frequencies = this._frequencyData;
    }

    // Time for animation
    const time = performance.now() / 1000;

    // Center point
    const centerY = y + h / 2;
    const centerGap = 8; // Tighter gap between bars and reflections

    // Bar dimensions - wider bars with more spacing
    const totalBarSpace = w - 30;
    const barWidth = totalBarSpace / numBars;
    const barGap = 6; // More gap between bars
    const actualBarWidth = barWidth - barGap;
    const maxBarHeight = h * 0.8;
    const cornerRadius = actualBarWidth / 2; // Fully rounded (pill shape)

    // Process frequency data into smoothed values
    for (let i = 0; i < numBars; i++) {
      let intensity;
      if (frequencies && frequencies.length > 0) {
        const binCount = frequencies.length;
        const usableBins = Math.floor(binCount * 0.6);
        const freqIndex = Math.floor(i * usableBins / numBars);
        const rawValue = frequencies[freqIndex] / 255;

        const boosted = Math.pow(rawValue, 0.55);
        intensity = 0.08 + boosted * 0.92;
      } else {
        intensity = 0.15 + Math.sin(time * 2 + i * 0.3) * 0.1;
      }

      // Smooth the values
      const smoothing = 0.3;
      this._smoothedWave[i] = this._smoothedWave[i] * (1 - smoothing) + intensity * smoothing;

      // Peak hold with decay - slower decay for more visible peaks
      if (this._smoothedWave[i] > this._peakHold[i]) {
        this._peakHold[i] = this._smoothedWave[i];
        this._peakDecay[i] = 0;
      } else {
        this._peakDecay[i] += 0.008; // Slower decay rate
        this._peakHold[i] = Math.max(this._smoothedWave[i], this._peakHold[i] - this._peakDecay[i] * 0.03);
      }
    }

    // Draw subtle outer glow for entire waveform area
    const avgIntensity = this._smoothedWave.reduce((a, b) => a + b, 0) / numBars;
    if (avgIntensity > 0.25) {
      const outerGlowAlpha = (avgIntensity - 0.25) * 0.15;
      const outerGlow = ctx.createRadialGradient(
        x + w / 2, centerY, 0,
        x + w / 2, centerY, Math.max(w, h) * 0.6
      );
      outerGlow.addColorStop(0, `rgba(132, 207, 197, ${outerGlowAlpha})`);
      outerGlow.addColorStop(0.5, `rgba(132, 207, 197, ${outerGlowAlpha * 0.3})`);
      outerGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = outerGlow;
      ctx.fillRect(x, y, w, h);
    }

    // Vanishing point for water reflection perspective (center bottom of reflection area)
    const vanishingX = x + w / 2;
    const reflectionDepth = (h / 2) - centerGap; // How far reflections extend down

    // Draw bars with water reflection effect
    for (let i = 0; i < numBars; i++) {
      const intensity = this._smoothedWave[i];
      const barX = x + 15 + i * barWidth + barGap / 2;
      const barCenterX = barX + actualBarWidth / 2;
      const topBarHeight = maxBarHeight * intensity * 0.5;

      // Edge fade vignette - first/last 2 bars fade to lower opacity
      let edgeFade = 1.0;
      if (i === 0 || i === numBars - 1) {
        edgeFade = 0.55;
      } else if (i === 1 || i === numBars - 2) {
        edgeFade = 0.75;
      }

      // Color gradient based on position and intensity
      const hue = 170 + (i / numBars) * 20;
      const sat = 60 + intensity * 30;
      const light = 45 + intensity * 30;
      const alpha = (0.6 + intensity * 0.35) * edgeFade;

      // Draw glow behind bars on high intensity
      if (intensity > 0.35) {
        const glowAlpha = (intensity - 0.35) * 0.35;
        const glow = ctx.createRadialGradient(
          barCenterX, centerY, 0,
          barCenterX, centerY, topBarHeight * 1.3
        );
        glow.addColorStop(0, `hsla(${hue}, ${sat}%, ${light + 15}%, ${glowAlpha})`);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(barCenterX, centerY, topBarHeight * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Bar color
      ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;

      // Top bar (grows upward) - pill shaped
      if (topBarHeight > cornerRadius) {
        ctx.beginPath();
        ctx.roundRect(
          barX,
          centerY - centerGap / 2 - topBarHeight,
          actualBarWidth,
          topBarHeight,
          cornerRadius
        );
        ctx.fill();
      }

      // ======= WATER REFLECTION (bottom bars with perspective) =======
      // Calculate perspective convergence toward vanishing point
      const distFromCenter = barCenterX - vanishingX;
      const perspectiveStrength = 0.85; // Stronger perspective for more dramatic effect

      // Reflection bar height - shorter than main bar (40-50% with variation)
      const heightVariation = 0.40 + (Math.sin(i * 0.7 + time * 0.5) * 0.05 + 0.05);
      const reflectionHeight = topBarHeight * heightVariation;

      // Cooler hue shift for water reflection (-10 hue for blue tint)
      const reflectionHue = hue - 10;
      // Reduce saturation slightly for softer water look
      const reflectionSat = sat * 0.85;

      // Draw reflection as trapezoid converging toward vanishing point
      if (reflectionHeight > 4) {
        const reflectionTop = centerY + centerGap / 2;
        const reflectionBottom = reflectionTop + reflectionHeight;

        // Horizontal distortion - subtle waviness for water effect
        const waveOffset = Math.sin(time * 2.5 + i * 0.5) * 1.5;

        // Top edge of reflection (at centerline) - same width as top bar
        const topLeftX = barX + waveOffset;
        const topRightX = barX + actualBarWidth + waveOffset;

        // Bottom edge converges toward vanishing point AND widens slightly (water dispersion)
        const convergeFactor = (reflectionHeight / reflectionDepth) * perspectiveStrength;
        const widthExpansion = actualBarWidth * 0.12; // 12% wider at bottom
        const bottomWaveOffset = Math.sin(time * 2.5 + i * 0.5 + 1) * 2; // Different phase at bottom
        const bottomLeftX = barX + distFromCenter * convergeFactor - widthExpansion / 2 + bottomWaveOffset;
        const bottomRightX = topRightX + distFromCenter * convergeFactor + widthExpansion / 2 + bottomWaveOffset;

        // Create gradient that fades out toward bottom - more aggressive fade at end
        const reflectionGradient = ctx.createLinearGradient(
          0, reflectionTop, 0, reflectionBottom
        );
        // Strong at top, aggressive fade in bottom 30%
        const reflectionAlpha = alpha * 0.85;
        reflectionGradient.addColorStop(0, `hsla(${reflectionHue}, ${reflectionSat}%, ${light}%, ${reflectionAlpha})`);
        reflectionGradient.addColorStop(0.5, `hsla(${reflectionHue}, ${reflectionSat}%, ${light}%, ${reflectionAlpha * 0.6})`);
        reflectionGradient.addColorStop(0.7, `hsla(${reflectionHue}, ${reflectionSat}%, ${light}%, ${reflectionAlpha * 0.3})`);
        reflectionGradient.addColorStop(1, `hsla(${reflectionHue}, ${reflectionSat}%, ${light}%, 0)`);

        ctx.fillStyle = reflectionGradient;

        // Draw trapezoid (perspective reflection)
        ctx.beginPath();
        // Start at top-left, rounded corner
        ctx.moveTo(topLeftX + cornerRadius, reflectionTop);
        ctx.lineTo(topRightX - cornerRadius, reflectionTop);
        ctx.quadraticCurveTo(topRightX, reflectionTop, topRightX, reflectionTop + cornerRadius);
        // Right edge converging toward center
        ctx.lineTo(bottomRightX, reflectionBottom);
        // Bottom edge (narrower due to perspective)
        ctx.lineTo(bottomLeftX, reflectionBottom);
        // Left edge converging toward center
        ctx.lineTo(topLeftX, reflectionTop + cornerRadius);
        ctx.quadraticCurveTo(topLeftX, reflectionTop, topLeftX + cornerRadius, reflectionTop);
        ctx.closePath();
        ctx.fill();
      }

      // Peak hold indicator (top bar only) - brighter and more visible
      const peakHeight = maxBarHeight * this._peakHold[i] * 0.5;
      const peakAlpha = Math.max(0, 1 - this._peakDecay[i] * 1.2) * 0.9 * edgeFade;
      if (peakHeight > topBarHeight + 3 && peakAlpha > 0.08) {
        ctx.fillStyle = `hsla(${hue}, 90%, 80%, ${peakAlpha})`;
        ctx.beginPath();
        ctx.roundRect(
          barX,
          centerY - centerGap / 2 - peakHeight - 4,
          actualBarWidth,
          4,
          2
        );
        ctx.fill();
      }
    }

    // ======= WATER SURFACE EFFECTS =======
    // Prominent water line glow at the center (where bars meet reflections)
    const waterLineY = centerY + centerGap / 2 - 1;

    // Outer soft glow (wider, dimmer)
    const outerWaterGlow = ctx.createLinearGradient(x + 20, 0, x + w - 20, 0);
    const outerGlowStrength = 0.12 + avgIntensity * 0.08;
    outerWaterGlow.addColorStop(0, 'transparent');
    outerWaterGlow.addColorStop(0.1, `rgba(132, 207, 197, ${outerGlowStrength * 0.3})`);
    outerWaterGlow.addColorStop(0.5, `rgba(160, 220, 210, ${outerGlowStrength * 0.5})`);
    outerWaterGlow.addColorStop(0.9, `rgba(132, 207, 197, ${outerGlowStrength * 0.3})`);
    outerWaterGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = outerWaterGlow;
    ctx.fillRect(x + 10, waterLineY - 6, w - 20, 12);

    // Inner bright line (crisp water surface)
    const waterLineGlow = ctx.createLinearGradient(x + 30, 0, x + w - 30, 0);
    const glowStrength = 0.25 + avgIntensity * 0.15;
    waterLineGlow.addColorStop(0, 'transparent');
    waterLineGlow.addColorStop(0.12, `rgba(180, 230, 220, ${glowStrength * 0.6})`);
    waterLineGlow.addColorStop(0.5, `rgba(200, 245, 235, ${glowStrength})`);
    waterLineGlow.addColorStop(0.88, `rgba(180, 230, 220, ${glowStrength * 0.6})`);
    waterLineGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = waterLineGlow;
    ctx.fillRect(x + 15, waterLineY - 1, w - 30, 3);

    // Subtle horizontal ripple lines across reflection area
    const rippleAlpha = 0.04 + avgIntensity * 0.03;
    ctx.strokeStyle = `rgba(180, 220, 230, ${rippleAlpha})`;
    ctx.lineWidth = 1;
    for (let r = 0; r < 2; r++) {
      const rippleY = centerY + centerGap / 2 + 20 + r * 25 + Math.sin(time * 1.5 + r) * 3;
      ctx.beginPath();
      ctx.moveTo(x + 40, rippleY);
      // Wavy line with slight undulation
      for (let rx = x + 40; rx < x + w - 40; rx += 20) {
        const wave = Math.sin(rx * 0.03 + time * 2 + r) * 2;
        ctx.lineTo(rx + 20, rippleY + wave);
      }
      ctx.stroke();
    }
  }

  /**
   * Draw seek/scrubber bar - minimalist cyber lux design
   */
  _drawScrubber(ctx, x, y, w) {
    const track = TRACKS[this.selectedIndex];
    const trackHeight = 6; // Slim, elegant track
    const isDragging = this._scrubberDragging;

    // Parse duration to seconds
    const durationParts = track.duration.split(':');
    const totalSeconds = parseInt(durationParts[0]) * 60 + parseInt(durationParts[1]);
    const progress = this._audio ? this._audio.currentTime / totalSeconds : 0;

    // Animation
    const time = performance.now() / 1000;

    // === MINIMALIST TRACK ===
    // Subtle outer glow line
    ctx.strokeStyle = 'rgba(132, 207, 197, 0.15)';
    ctx.lineWidth = trackHeight + 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + trackHeight / 2);
    ctx.lineTo(x + w, y + trackHeight / 2);
    ctx.stroke();

    // Track background - subtle dark line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = trackHeight;
    ctx.beginPath();
    ctx.moveTo(x, y + trackHeight / 2);
    ctx.lineTo(x + w, y + trackHeight / 2);
    ctx.stroke();

    // Progress fill - clean gradient line with subtle glow
    const progressWidth = w * Math.min(progress, 1);
    if (progressWidth > 2) {
      // Subtle glow behind progress
      ctx.strokeStyle = 'rgba(132, 207, 197, 0.25)';
      ctx.lineWidth = trackHeight + 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y + trackHeight / 2);
      ctx.lineTo(x + progressWidth, y + trackHeight / 2);
      ctx.stroke();

      // Main progress line
      const progressGradient = ctx.createLinearGradient(x, 0, x + progressWidth, 0);
      progressGradient.addColorStop(0, 'rgba(132, 207, 197, 0.6)');
      progressGradient.addColorStop(0.5, ACCENT_COLOR);
      progressGradient.addColorStop(1, 'rgba(160, 230, 220, 0.9)');
      ctx.strokeStyle = progressGradient;
      ctx.lineWidth = trackHeight;
      ctx.beginPath();
      ctx.moveTo(x, y + trackHeight / 2);
      ctx.lineTo(x + progressWidth, y + trackHeight / 2);
      ctx.stroke();
    }

    // Handle position - ensure minimum distance from left edge so knob doesn't overlap
    const minHandleOffset = 18; // Slightly larger than handle radius to look clean at 0%
    const handleX = x + Math.max(minHandleOffset, progressWidth);
    const handleY = y + trackHeight / 2;

    // === MINIMALIST KNOB - Floating ring with center dot ===
    const baseRadius = 16;
    const radius = isDragging ? baseRadius * 1.1 : baseRadius;

    // Subtle outer glow when dragging
    if (isDragging) {
      const glowIntensity = 0.3 + Math.sin(time * 6) * 0.1;
      const outerGlow = ctx.createRadialGradient(handleX, handleY, radius, handleX, handleY, radius * 2.5);
      outerGlow.addColorStop(0, `rgba(132, 207, 197, ${glowIntensity})`);
      outerGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(handleX, handleY, radius * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Minimal drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.arc(handleX + 1, handleY + 2, radius - 2, 0, Math.PI * 2);
    ctx.fill();

    // Outer ring - doubled stroke
    ctx.beginPath();
    ctx.arc(handleX, handleY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = isDragging ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = isDragging ? 5 : 4;
    ctx.stroke();

    // Inner fill - subtle gradient
    const innerGradient = ctx.createRadialGradient(
      handleX - radius * 0.3, handleY - radius * 0.3, 0,
      handleX, handleY, radius - 2
    );
    innerGradient.addColorStop(0, 'rgba(60, 80, 85, 0.95)');
    innerGradient.addColorStop(0.5, 'rgba(40, 55, 60, 0.9)');
    innerGradient.addColorStop(1, 'rgba(30, 45, 50, 0.85)');
    ctx.beginPath();
    ctx.arc(handleX, handleY, radius - 2, 0, Math.PI * 2);
    ctx.fillStyle = innerGradient;
    ctx.fill();

    // Center accent dot - the key visual element
    const dotRadius = isDragging ? 5 : 4;

    // Dot glow
    const dotGlow = ctx.createRadialGradient(handleX, handleY, 0, handleX, handleY, dotRadius * 2.5);
    dotGlow.addColorStop(0, `rgba(132, 207, 197, ${isDragging ? 0.8 : 0.5})`);
    dotGlow.addColorStop(0.5, `rgba(132, 207, 197, ${isDragging ? 0.3 : 0.15})`);
    dotGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = dotGlow;
    ctx.beginPath();
    ctx.arc(handleX, handleY, dotRadius * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // The dot itself - bright accent
    ctx.beginPath();
    ctx.arc(handleX, handleY, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT_COLOR;
    ctx.fill();

    // Dot highlight
    ctx.beginPath();
    ctx.arc(handleX - dotRadius * 0.3, handleY - dotRadius * 0.3, dotRadius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fill();

    // Time labels - bold, larger typography, positioned closer to scrubber
    ctx.font = '600 19px Poppins, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(this._formatTime(this._currentTime), x, y + trackHeight + 20);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.fillText(track.duration, x + w, y + trackHeight + 20);

    // Store scrubber geometry for drag detection
    this._scrubberGeometry = {
      trackX: x,
      trackY: y,
      trackWidth: w,
      trackHeight: trackHeight,
      handleX: handleX,
      handleY: handleY,
      handleRadius: baseRadius
    };

    // Add scrubber hit region - generous touch target
    this._controlRegions.push({
      name: 'scrubber',
      x: x - 15,
      y: y - 25,
      w: w + 30,
      h: 70,
      extra: { startX: x, width: w, handleRadius: baseRadius }
    });
  }

  /**
   * Setup audio analyser for visualizer
   * IMPORTANT: We don't create our own MediaElementSource - that would conflict
   * with the mascot's AudioAnalyzer. Instead, we try to share the mascot's analyzer
   * or create a simple fallback.
   */
  _setupAudioAnalyser() {
    if (!this._audio) return;

    // Try to use mascot's audio analyzer if available
    // The mascot's connectAudio() creates _analyzerNode (not audioAnalyzer.analyser)
    if (this.mascot?._analyzerNode) {
      this._analyser = this.mascot._analyzerNode;
      this._frequencyData = new Uint8Array(this._analyser.frequencyBinCount);
      this._usingMascotAnalyser = true;
      console.log('Using mascot audio analyser for visualizer');
      return;
    }

    // Fallback: create our own analyzer only if mascot doesn't have one
    // This means mascot won't be connected, so no conflict
    try {
      if (!this._audioContext) {
        this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      this._analyser = this._audioContext.createAnalyser();
      this._analyser.fftSize = 64;
      this._frequencyData = new Uint8Array(this._analyser.frequencyBinCount);

      // Only create MediaElementSource if mascot isn't connected
      if (!this.mascot) {
        this._audioSource = this._audioContext.createMediaElementSource(this._audio);
        this._audioSource.connect(this._analyser);
        this._analyser.connect(this._audioContext.destination);
        console.log('Created standalone audio analyser for visualizer');
      } else {
        // Mascot exists but analyzer not ready yet - we'll retry later
        console.log('Mascot exists but analyzer not ready - visualizer will use fallback animation');
      }
    } catch (e) {
      console.warn('Failed to setup audio analyser:', e);
    }
  }

  /**
   * Cleanup audio analyser
   */
  _cleanupAudioAnalyser() {
    // Don't disconnect if we're using mascot's analyser - it manages its own lifecycle
    if (this._usingMascotAnalyser) {
      this._analyser = null;
      this._frequencyData = null;
      this._usingMascotAnalyser = false;
      return;
    }

    if (this._audioSource) {
      try {
        this._audioSource.disconnect();
      } catch (e) { /* ignore */ }
      this._audioSource = null;
    }
    this._analyser = null;
    this._frequencyData = null;
    // Don't close audio context - it can be reused
  }

  /**
   * Get hit regions including brackets, tracks, and controls
   */
  getHitRegions() {
    return [...this._bracketRegions, ...this._controlRegions, ...this._trackRegions];
  }

  /**
   * Handle custom touch regions
   * @param {string} regionName - Name of the hit region
   * @param {Object} extra - Extra data from the hit region
   * @param {Object} canvasCoords - Canvas coordinates { x, y } of the touch
   */
  _handleCustomTouch(regionName, extra, canvasCoords) {
    // Handle track selection (only in track selection mode)
    if (regionName.startsWith('track-')) {
      const index = extra?.index;
      if (index !== undefined && index !== this.selectedIndex) {
        this.selectedIndex = index;
        console.log(`Selected track: ${TRACKS[index].label}`);

        // Update title with new track info
        this._updateHoloTitle();

        // If currently playing, switch to new track
        if (this._isPlaying) {
          this._playTrack(TRACKS[index]);
        }

        this.updatePhoneDisplay();
      }
      return;
    }

    // Handle playback controls (in playback mode)
    if (regionName === 'play-pause') {
      this._togglePlayback();
      return;
    }

    if (regionName === 'prev-track') {
      this._selectPrevTrack();
      return;
    }

    if (regionName === 'next-track') {
      this._selectNextTrack();
      return;
    }

    if (regionName === 'scrubber') {
      // Start scrubber drag - the actual seeking happens in drag move
      if (extra && canvasCoords) {
        this._startScrubberDrag(canvasCoords, extra);
      }
      return;
    }
  }

  /**
   * Start dragging the scrubber knob
   * @param {Object} canvasCoords - Canvas coordinates { x, y }
   * @param {Object} extra - Extra data with startX and width
   */
  _startScrubberDrag(canvasCoords, extra) {
    this._scrubberDragging = true;
    this._scrubberDragExtra = extra;

    // Immediately seek to touch position
    const relativeX = canvasCoords.x - extra.startX;
    const progress = Math.max(0, Math.min(1, relativeX / extra.width));
    this._seekTo(progress);

    console.log('Scrubber drag started');
  }

  /**
   * Handle scrubber drag move
   * Called from HoloPhone during drag operations
   * @param {Object} canvasCoords - Canvas coordinates { x, y }
   */
  handleScrubberDrag(canvasCoords) {
    if (!this._scrubberDragging || !this._scrubberDragExtra) return;

    const extra = this._scrubberDragExtra;
    const relativeX = canvasCoords.x - extra.startX;
    const progress = Math.max(0, Math.min(1, relativeX / extra.width));
    this._seekTo(progress);
  }

  /**
   * End scrubber drag
   */
  endScrubberDrag() {
    if (this._scrubberDragging) {
      this._scrubberDragging = false;
      this._scrubberDragExtra = null;
      console.log('Scrubber drag ended');
    }
  }

  /**
   * Check if scrubber is currently being dragged
   * @returns {boolean}
   */
  isScrubberDragging() {
    return this._scrubberDragging;
  }

  /**
   * Seek to a position in the track
   * @param {number} progress - Position 0-1
   */
  _seekTo(progress) {
    if (!this._audio) return;

    const track = TRACKS[this.selectedIndex];
    const durationParts = track.duration.split(':');
    const totalSeconds = parseInt(durationParts[0]) * 60 + parseInt(durationParts[1]);

    this._audio.currentTime = progress * totalSeconds;
    this._currentTime = this._audio.currentTime;
    this.updatePhoneDisplay();
  }

  /**
   * Toggle playback (pause/resume, not stop)
   */
  _togglePlayback() {
    if (this._isPlaying) {
      this._pausePlayback();
    } else if (this._audio) {
      // Resume from paused state
      this._resumePlayback();
    } else {
      // Start fresh
      this._playTrack(TRACKS[this.selectedIndex]);
    }
  }

  /**
   * Pause playback (keeps position for resume)
   */
  _pausePlayback() {
    if (this._audio && this._isPlaying) {
      this._audio.pause();
      this._isPlaying = false;
      this._stopTimeUpdate();
      this._syncMusicUIState();
      this.updatePhoneDisplay();
    }
  }

  /**
   * Resume playback from paused position
   */
  async _resumePlayback() {
    if (this._audio && !this._isPlaying) {
      try {
        // Clear paused-for-mode when user manually resumes
        this._isPausedForMode = false;
        await this._audio.play();
        // onplay callback will set _isPlaying = true and start time update
      } catch (e) {
        console.error('Failed to resume audio:', e);
      }
    }
  }

  /**
   * Play a track
   */
  async _playTrack(track) {
    // Stop any current playback (but don't hide controls - we're switching tracks)
    this._stopPlayback(false);

    // Mark that we're starting playback
    this._isStartingPlayback = true;

    // Create new audio element
    this._audio = new Audio(track.file);
    this._audio.loop = true;
    // Enable CORS for audio analysis
    this._audio.crossOrigin = 'anonymous';

    this._audio.onplay = () => {
      console.log(`Playing: ${track.label} (BPM will be auto-detected)`);
      this._isPlaying = true;
      this._isStartingPlayback = false;
      this._startTimeUpdate();
      // Sync UI - ensure controls visible and mascot raised
      this._syncMusicUIState();
      this.updatePhoneDisplay();
    };

    this._audio.onerror = (e) => {
      console.error('Audio playback error:', e);
      this._isPlaying = false;
      this._isStartingPlayback = false;
      this._stopTimeUpdate();
      this._disconnectMascotAudio();
      // Sync UI - hide controls and lower mascot
      this._syncMusicUIState();
      this.updatePhoneDisplay();
    };

    this._audio.onended = () => {
      // Shouldn't trigger with loop=true, but just in case
      this._isPlaying = false;
      this._isStartingPlayback = false;
      this._stopTimeUpdate();
      this._disconnectMascotAudio();
      // Sync UI - hide controls and lower mascot
      this._syncMusicUIState();
      this.updatePhoneDisplay();
    };

    try {
      await this._audio.play();

      // Connect audio to mascot FIRST for rhythm sync and groove
      // This creates the MediaElementSource that we'll share for the visualizer
      // The mascot's connectAudio() automatically:
      // 1. Starts BPM detection from audio analysis
      // 2. Updates rhythm engine with detected BPM
      // 3. Enables groove animations synced to detected tempo
      if (this.mascot) {
        try {
          // Connect audio element for audio-reactive animations
          // This starts automatic BPM detection - no need to hardcode BPM!
          await this.mascot.connectAudio(this._audio);
          console.log('Audio connected to mascot - BPM will be auto-detected');

          // Enable groove (will sync to auto-detected BPM)
          if (this.mascot.enableGroove) {
            this.mascot.enableGroove();
            console.log('Groove enabled - waiting for BPM detection');
          }

          // Start rhythm with default pattern - BPM will be auto-updated by detection
          if (this.mascot.startRhythm) {
            // Don't pass BPM - let the auto-detection set it
            this.mascot.startRhythm();
            console.log('Rhythm started - BPM will be detected from audio');
          }
        } catch (e) {
          console.warn('Failed to connect mascot audio:', e);
        }
      }

      // Setup audio analyser for visualizer AFTER mascot is connected
      // This allows us to share the mascot's AudioAnalyzer
      if (this._playbackMode) {
        this._setupAudioAnalyser();
      }
    } catch (e) {
      console.error('Failed to play audio:', e);
      this._isPlaying = false;
      this._isStartingPlayback = false;
      this._updateHoloTitle();
      this.updatePhoneDisplay();
    }
  }

  /**
   * Disconnect mascot from audio and disable groove
   */
  _disconnectMascotAudio() {
    if (this.mascot) {
      if (this.mascot.disableGroove) {
        this.mascot.disableGroove();
        console.log('Groove disabled');
      }
      if (this.mascot.stopRhythm) {
        this.mascot.stopRhythm();
        console.log('Rhythm stopped');
      }
      if (this.mascot.disconnectAudio) {
        this.mascot.disconnectAudio();
        console.log('Audio disconnected from mascot');
      }
      // Reset audio source node so a new one can be created for new tracks
      // This works around the engine not cleaning up _audioSourceNode in disconnectAudio()
      if (this.mascot._audioSourceNode) {
        try {
          this.mascot._audioSourceNode.disconnect();
        } catch (e) { /* ignore */ }
        this.mascot._audioSourceNode = null;
        console.log('Audio source node reset for track switching');
      }
    }
  }

  /**
   * Stop playback
   * @param {boolean} hideControls - Whether to hide floating controls (default true)
   */
  _stopPlayback(hideControls = true) {
    // Disconnect mascot audio first
    this._disconnectMascotAudio();

    // Cleanup audio analyser (need to recreate when switching tracks)
    this._cleanupAudioAnalyser();

    // Stop time update
    this._stopTimeUpdate();

    if (this._audio) {
      this._audio.pause();
      this._audio.currentTime = 0;
      this._audio = null;
    }
    this._isPlaying = false;
    this._isStartingPlayback = false;
    this._isPausedForMode = false;  // Clear paused-for-mode when fully stopping
    this._currentTime = 0;

    // When hideControls is true, music is stopping completely (not just switching tracks)
    // Sync UI state to hide controls and lower mascot
    if (hideControls) {
      this._syncMusicUIState();
    }

    this.updatePhoneDisplay();
  }

  /**
   * Handle confirm - in track selection mode, start playing and enter playback mode
   * In playback mode, this shouldn't be called (no confirm button)
   */
  _handleConfirm() {
    // If already in playback mode, ignore (shouldn't happen)
    if (this._playbackMode) {
      return;
    }

    // Enter playback mode - transform panel view
    this._playbackMode = true;

    // Start playing the selected track
    // This will connect to mascot and setup audio analyser after playback starts
    this._playTrack(TRACKS[this.selectedIndex]);

    // Notify parent (but don't close panel)
    if (this.onConfirm) {
      this.onConfirm({
        trackId: TRACKS[this.selectedIndex].id,
        trackName: TRACKS[this.selectedIndex].label,
        isPlaying: true,
        playbackMode: true
      });
    }

    this.updatePhoneDisplay();
  }

  /**
   * Handle cancel - in playback mode, stop music and exit to idle
   * In track selection mode, just close panel
   */
  _handleCancel() {
    if (this._playbackMode) {
      // Exit playback mode: stop music, cleanup, and exit to idle
      this._stopPlayback();
      this._cleanupAudioAnalyser();
      this._playbackMode = false;

      this.hide();

      // Notify that we want to return to idle (mascot lowered, no menu)
      if (this.onClose) {
        this.onClose({ exitToIdle: true });
      }
    } else {
      // Track selection mode: just close panel without stopping music
      this.hide();
      if (this.onClose) {
        this.onClose();
      }
    }
  }

  /**
   * Get current panel state
   */
  getState() {
    return {
      id: this.id,
      selectedIndex: this.selectedIndex,
      selectedTrack: TRACKS[this.selectedIndex],
      isPlaying: this._isPlaying
    };
  }

  /**
   * Restore panel state
   */
  restoreState(state) {
    if (state.selectedIndex !== undefined) {
      this.selectedIndex = state.selectedIndex;
    }
  }

  /**
   * Public method to stop music (for external control)
   */
  stopMusic() {
    this._stopPlayback();
  }

  /**
   * Check if music is playing
   */
  isPlaying() {
    return this._isPlaying;
  }

  /**
   * Pause music for meditation/story mode
   * Sets a flag so controls remain visible when returning
   */
  pauseForMode() {
    if (this._isPlaying) {
      this._isPausedForMode = true;
      this._pausePlayback();
    }
  }

  /**
   * Clear the paused-for-mode flag (when user manually stops or resumes)
   */
  _clearPausedForMode() {
    this._isPausedForMode = false;
  }
}

// Export tracks for use elsewhere
export { TRACKS };
export default MusicPanel;
