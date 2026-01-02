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

// Music track options with BPM for rhythm sync
const TRACKS = [
  {
    id: 'electric-glow-f',
    label: 'Electric Glow (F)',
    desc: 'Female vocal',
    file: './assets/music/electric-glow-f.wav',
    bpm: 120,
    duration: '3:24'
  },
  {
    id: 'electric-glow-m',
    label: 'Electric Glow (M)',
    desc: 'Male vocal',
    file: './assets/music/electric-glow-m.wav',
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
    this._currentTime = 0;
    this._duration = 0;

    // Reference to mascot for rhythm sync
    this.mascot = options.mascot || null;

    // Hit regions (set during render)
    this._trackRegions = [];
    this._bracketRegions = [];

    // Time update interval
    this._timeUpdateInterval = null;

    // Floating music controls elements (set on show)
    this._musicControls = null;
    this._trackNameEl = null;
    this._playBtn = null;
    this._prevBtn = null;
    this._nextBtn = null;
    this._timeEl = null;
  }

  /**
   * Called when panel is shown
   */
  _onShow() {
    // Don't reset selection - keep previous choice

    // Set up floating music controls
    this._setupFloatingControls();

    // Update floating controls with current track info
    this._updateFloatingControls();

    // Start time update if playing
    if (this._isPlaying) {
      this._startTimeUpdate();
    }
  }

  /**
   * Set up floating music controls in the holo title area
   */
  _setupFloatingControls() {
    if (!this.titleElement) return;

    // Add music-mode class to switch to music controls
    this.titleElement.classList.add('music-mode');

    // Get control elements
    this._musicControls = this.titleElement.querySelector('.music-controls');
    this._trackNameEl = this.titleElement.querySelector('.music-track-name');
    this._playBtn = this.titleElement.querySelector('.music-play');
    this._prevBtn = this.titleElement.querySelector('.music-prev');
    this._nextBtn = this.titleElement.querySelector('.music-next');
    this._timeEl = this.titleElement.querySelector('.music-time');

    if (this._musicControls) {
      this._musicControls.classList.remove('hidden');
    }

    // Bind button events
    if (this._playBtn) {
      this._playBtn.onclick = () => this._togglePlayback();
    }
    if (this._prevBtn) {
      this._prevBtn.onclick = () => this._selectPrevTrack();
    }
    if (this._nextBtn) {
      this._nextBtn.onclick = () => this._selectNextTrack();
    }
  }

  /**
   * Clean up floating music controls
   * Only hides controls if music is not playing
   */
  _cleanupFloatingControls() {
    if (!this.titleElement) return;

    // If music is playing, keep the controls visible
    if (this._isPlaying) {
      // Just unbind click events since panel is closing
      // But keep the controls visible and functional
      return;
    }

    // Remove music-mode class
    this.titleElement.classList.remove('music-mode');

    // Hide music controls
    if (this._musicControls) {
      this._musicControls.classList.add('hidden');
    }

    // Unbind events
    if (this._playBtn) this._playBtn.onclick = null;
    if (this._prevBtn) this._prevBtn.onclick = null;
    if (this._nextBtn) this._nextBtn.onclick = null;
  }

  /**
   * Update the floating music controls
   */
  _updateFloatingControls() {
    const track = TRACKS[this.selectedIndex];

    // Update track name
    if (this._trackNameEl) {
      this._trackNameEl.textContent = track.label;
    }

    // Update play button state
    if (this._playBtn) {
      this._playBtn.textContent = this._isPlaying ? '⏸' : '▶';
      this._playBtn.classList.toggle('playing', this._isPlaying);
    }

    // Update time display
    if (this._timeEl) {
      if (this._isPlaying) {
        const timeStr = `${this._formatTime(this._currentTime)} / ${track.duration}`;
        this._timeEl.textContent = timeStr;
      } else {
        this._timeEl.textContent = `0:00 / ${track.duration}`;
      }
    }
  }

  /**
   * Select previous track
   */
  _selectPrevTrack() {
    this.selectedIndex = (this.selectedIndex - 1 + TRACKS.length) % TRACKS.length;
    this._updateFloatingControls();

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
    this._updateFloatingControls();

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

    // Clean up floating controls (keeps them visible if playing)
    this._cleanupFloatingControls();
  }

  /**
   * Override hide to keep floating title visible when music is playing
   */
  hide() {
    this.isVisible = false;

    // Only hide title and lower mascot if music is not playing
    if (!this._isPlaying) {
      this._hideTitle();
    }

    this._onHide();
  }

  /**
   * Update the floating holo title with track info
   */
  _updateHoloTitle() {
    // Use floating controls instead of subtitle
    this._updateFloatingControls();
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

    // Use HoloPhone's shared bracket drawing
    if (holoPhone && holoPhone.drawPanelBrackets) {
      this._bracketRegions = holoPhone.drawPanelBrackets(ctx, w, h);
    }

    // Content area (between brackets)
    const bracketWidth = 80;
    const bracketInset = 4;
    const contentX = bracketWidth + bracketInset + 12;
    const contentW = w - (bracketWidth + bracketInset) * 2 - 24;

    // Clear hit regions
    this._trackRegions = [];

    // === TRACK ROWS ===
    // Center tracks vertically in the available space
    const totalTrackHeight = TRACKS.length * 56;
    const rowStartY = (h - totalTrackHeight) / 2;
    const rowHeight = 56;

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

    // Track name
    const textX = radioX + radioRadius + 12;
    ctx.font = '500 16px Poppins, sans-serif';
    ctx.fillStyle = isSelected ? ACCENT_COLOR : 'rgba(255, 255, 255, 0.9)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(track.label, textX, rowCenterY - 8);

    // Description and duration
    ctx.font = '400 12px Poppins, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(`${track.desc} • ${track.duration}`, textX, rowCenterY + 10);

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

  /**
   * Get hit regions including brackets
   */
  getHitRegions() {
    return [...this._bracketRegions, ...this._trackRegions];
  }

  /**
   * Handle custom touch regions
   */
  _handleCustomTouch(regionName, extra, event) {
    // Handle track selection
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
    }
  }

  /**
   * Toggle playback
   */
  _togglePlayback() {
    if (this._isPlaying) {
      this._stopPlayback();
    } else {
      this._playTrack(TRACKS[this.selectedIndex]);
    }
  }

  /**
   * Play a track
   */
  async _playTrack(track) {
    // Stop any current playback
    this._stopPlayback();

    // Create new audio element
    this._audio = new Audio(track.file);
    this._audio.loop = true;
    // Enable CORS for audio analysis
    this._audio.crossOrigin = 'anonymous';

    this._audio.onplay = () => {
      console.log(`Playing: ${track.label} at ${track.bpm} BPM`);
      this._isPlaying = true;
      this._startTimeUpdate();
      this._updateHoloTitle();
      this.updatePhoneDisplay();
    };

    this._audio.onerror = (e) => {
      console.error('Audio playback error:', e);
      this._isPlaying = false;
      this._stopTimeUpdate();
      this._disconnectMascotAudio();
      this._updateHoloTitle();
      this.updatePhoneDisplay();
    };

    this._audio.onended = () => {
      // Shouldn't trigger with loop=true, but just in case
      this._isPlaying = false;
      this._stopTimeUpdate();
      this._disconnectMascotAudio();
      this._updateHoloTitle();
      this.updatePhoneDisplay();
    };

    try {
      await this._audio.play();

      // Connect audio to mascot for rhythm sync and groove
      if (this.mascot) {
        try {
          // Connect audio element for audio-reactive animations
          await this.mascot.connectAudio(this._audio);
          console.log('Audio connected to mascot');

          // Set BPM and enable groove
          if (this.mascot.setRhythmBPM) {
            this.mascot.setRhythmBPM(track.bpm);
          }
          if (this.mascot.enableGroove) {
            this.mascot.enableGroove();
            console.log('Groove enabled');
          }
          if (this.mascot.startRhythm) {
            this.mascot.startRhythm(track.bpm);
            console.log('Rhythm started at', track.bpm, 'BPM');
          }
        } catch (e) {
          console.warn('Failed to connect mascot audio:', e);
        }
      }
    } catch (e) {
      console.error('Failed to play audio:', e);
      this._isPlaying = false;
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
    }
  }

  /**
   * Stop playback
   */
  _stopPlayback() {
    // Disconnect mascot audio first
    this._disconnectMascotAudio();

    // Stop time update
    this._stopTimeUpdate();

    if (this._audio) {
      this._audio.pause();
      this._audio.currentTime = 0;
      this._audio = null;
    }
    this._isPlaying = false;
    this._currentTime = 0;
    this._updateHoloTitle();

    // Hide floating controls when music stops (if panel is not visible)
    if (!this.isVisible) {
      this._forceHideFloatingControls();
    }

    this.updatePhoneDisplay();
  }

  /**
   * Force hide floating controls (used when music stops while panel is closed)
   */
  _forceHideFloatingControls() {
    if (!this.titleElement) return;

    // Remove music-mode class
    this.titleElement.classList.remove('music-mode');

    // Hide music controls
    if (this._musicControls) {
      this._musicControls.classList.add('hidden');
    }

    // Hide the title element entirely
    this._hideTitle();

    // Unbind events
    if (this._playBtn) this._playBtn.onclick = null;
    if (this._prevBtn) this._prevBtn.onclick = null;
    if (this._nextBtn) this._nextBtn.onclick = null;
  }

  /**
   * Handle confirm - start playing selected track and close panel
   */
  _handleConfirm() {
    // Start playing the selected track if not already playing
    if (!this._isPlaying) {
      this._playTrack(TRACKS[this.selectedIndex]);
    }

    // Notify parent
    if (this.onConfirm) {
      this.onConfirm({
        trackId: TRACKS[this.selectedIndex].id,
        trackName: TRACKS[this.selectedIndex].label,
        isPlaying: true
      });
    }

    // Hide panel
    this.hide();
  }

  /**
   * Handle cancel - close panel (music keeps playing)
   */
  _handleCancel() {
    this.hide();
    if (this.onClose) {
      this.onClose();
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
}

// Export tracks for use elsewhere
export { TRACKS };
export default MusicPanel;
