/**
 * CarouselAudio - Procedural audio for 3D carousel disk interaction
 *
 * Extends the musical patterns from BreathingAudio:
 * - Same chord progressions for musical continuity
 * - Triangle wave + harmonic character (music box / kalimba)
 * - Rotation ticks, snap sounds, selection chimes
 */

export class CarouselAudio {
  constructor() {
    this.audioContext = null;

    // Reuse the same relaxing chord progressions from breathing audio
    this.progressions = [
      {
        name: 'C major',
        chord: [523.25, 659.25, 783.99, 987.77],   // Cmaj7: C5-E5-G5-B5
        scale: [987.77, 880.00, 783.99, 698.46, 659.25, 587.33, 523.25, 493.88, 440.00, 392.00]
      },
      {
        name: 'G major',
        chord: [392.00, 493.88, 587.33, 739.99],   // Gmaj7: G4-B4-D5-F#5
        scale: [739.99, 659.25, 587.33, 523.25, 493.88, 440.00, 392.00, 369.99, 329.63, 293.66]
      },
      {
        name: 'D major',
        chord: [293.66, 369.99, 440.00, 554.37],   // Dmaj7: D4-F#4-A4-C#5
        scale: [554.37, 493.88, 440.00, 392.00, 369.99, 329.63, 293.66, 277.18, 246.94, 220.00]
      },
      {
        name: 'F major',
        chord: [349.23, 440.00, 523.25, 659.25],   // Fmaj7: F4-A4-C5-E5
        scale: [659.25, 587.33, 523.25, 466.16, 440.00, 392.00, 349.23, 329.63, 293.66, 261.63]
      },
      {
        name: 'A major',
        chord: [440.00, 554.37, 659.25, 830.61],   // Amaj7: A4-C#5-E5-G#5
        scale: [830.61, 739.99, 659.25, 587.33, 554.37, 493.88, 440.00, 415.30, 369.99, 329.63]
      },
      {
        name: 'Eb major',
        chord: [311.13, 392.00, 466.16, 587.33],   // Ebmaj7: Eb4-G4-Bb4-D5
        scale: [587.33, 523.25, 466.16, 415.30, 392.00, 349.23, 311.13, 293.66, 261.63, 233.08]
      }
    ];

    this.currentProgressionIndex = 0;
    this.lastTickTime = 0;
    this.minTickInterval = 80; // Minimum ms between rotation ticks
  }

  /**
   * Get current chord progression
   */
  get chords() {
    return this.progressions[this.currentProgressionIndex];
  }

  /**
   * Sync with breathing audio's current progression for musical continuity
   */
  syncProgression(breathingAudio) {
    if (breathingAudio && typeof breathingAudio.currentProgressionIndex === 'number') {
      this.currentProgressionIndex = breathingAudio.currentProgressionIndex % this.progressions.length;
    }
  }

  /**
   * Advance to next progression
   */
  nextProgression() {
    this.currentProgressionIndex = (this.currentProgressionIndex + 1) % this.progressions.length;
  }

  /**
   * Initialize audio context (call after user interaction)
   */
  async init() {
    if (this.audioContext) return;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  /**
   * Resume audio context if suspended
   */
  resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  /**
   * Play rotation tick - pitch based on angle, volume based on velocity
   * @param {number} slotIndex - Which slot (0, 1, 2) we're nearest to
   * @param {number} velocity - Angular velocity (affects volume)
   */
  playRotationTick(slotIndex, velocity = 1) {
    if (!this.audioContext) return;

    // Throttle ticks to avoid audio overload
    const now = performance.now();
    if (now - this.lastTickTime < this.minTickInterval) return;
    this.lastTickTime = now;

    // Map slot index to scale position
    const scale = this.chords.scale;
    const noteIndex = (slotIndex * 3) % scale.length; // Spread across scale
    const freq = scale[noteIndex];

    // Volume scales with velocity (clamped)
    const volume = Math.min(0.04, 0.02 + Math.abs(velocity) * 0.01);

    this._playPluck(freq, volume, 0.3);
  }

  /**
   * Play snap-to-slot sound - satisfying resolution
   * @param {number} slotIndex - Which slot we snapped to
   */
  playSnapToSlot(slotIndex) {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const chord = this.chords.chord;

    // Play root and fifth for a clean resolution
    const root = chord[0];
    const fifth = chord[2];

    this._playChimeNote(fifth, now, 0.06, 0.4);
    this._playChimeNote(root, now + 0.05, 0.08, 0.6);
  }

  /**
   * Play selection confirmation - full chord bloom
   * @param {number} slotIndex - Which slot was selected
   */
  playSelectionChime(slotIndex) {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const chord = this.chords.chord;

    // Arpeggiate the full chord upward
    chord.forEach((freq, i) => {
      const stagger = i * 0.06;
      const volume = 0.07 - (i * 0.01);
      this._playChimeNote(freq, now + stagger, volume, 1.0);
    });

    // Advance progression for variety on next interaction
    this.nextProgression();
  }

  /**
   * Play cancel/back sound - descending minor feel
   */
  playBackSound() {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const scale = this.chords.scale;

    // Descending minor third interval
    this._playPluck(scale[2], 0.05, 0.4);
    setTimeout(() => {
      this._playPluck(scale[5], 0.04, 0.3);
    }, 80);
  }

  /**
   * Play hover/highlight shimmer - subtle sustained tone
   * @param {number} slotIndex - Which slot is highlighted
   */
  playHoverStart(slotIndex) {
    if (!this.audioContext) return;

    const chord = this.chords.chord;
    const freq = chord[slotIndex % chord.length];

    // Very quiet, short shimmer
    this._playChimeNote(freq, this.audioContext.currentTime, 0.03, 0.5);
  }

  /**
   * Play disk open sound - ascending arpeggio
   */
  playOpenSound() {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const chord = this.chords.chord;

    // Quick ascending arpeggio (first 3 notes)
    for (let i = 0; i < 3; i++) {
      this._playChimeNote(chord[i], now + i * 0.08, 0.05, 0.5);
    }
  }

  /**
   * Play disk close sound - descending arpeggio
   */
  playCloseSound() {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const chord = this.chords.chord;

    // Quick descending arpeggio
    for (let i = 2; i >= 0; i--) {
      this._playChimeNote(chord[i], now + (2 - i) * 0.08, 0.04, 0.4);
    }
  }

  /**
   * Play a chime note (for selections and transitions)
   */
  _playChimeNote(freq, startTime, volume = 0.06, duration = 0.8) {
    if (!this.audioContext) return;

    const now = startTime;

    // Triangle wave for soft bell-like tone
    const osc = this.audioContext.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    // Subtle vibrato for shimmer
    const vibrato = this.audioContext.createOscillator();
    vibrato.type = 'sine';
    vibrato.frequency.value = 5;
    const vibratoGain = this.audioContext.createGain();
    vibratoGain.gain.value = 2;
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);
    vibrato.start(now);
    vibrato.stop(now + duration);

    // Envelope - quick attack, gentle decay
    const envelope = this.audioContext.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(volume, now + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Soft harmonic for sparkle
    const harmonic = this.audioContext.createOscillator();
    harmonic.type = 'sine';
    harmonic.frequency.value = freq * 2;
    const harmonicGain = this.audioContext.createGain();
    harmonicGain.gain.value = 0.18;
    harmonic.connect(harmonicGain);
    harmonicGain.connect(envelope);
    harmonic.start(now);
    harmonic.stop(now + duration);

    osc.connect(envelope);
    envelope.connect(this.audioContext.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Play a pluck sound (for rotation ticks)
   */
  _playPluck(freq, volume = 0.04, duration = 0.3) {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;

    // Triangle wave
    const osc = this.audioContext.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    // Very subtle vibrato
    const vibrato = this.audioContext.createOscillator();
    vibrato.type = 'sine';
    vibrato.frequency.value = 6;
    const vibratoGain = this.audioContext.createGain();
    vibratoGain.gain.value = 1.2;
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);
    vibrato.start(now);
    vibrato.stop(now + duration);

    // Quick attack, short decay - plucky feel
    const envelope = this.audioContext.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(volume, now + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Light harmonic
    const harmonic = this.audioContext.createOscillator();
    harmonic.type = 'sine';
    harmonic.frequency.value = freq * 2;
    const harmonicGain = this.audioContext.createGain();
    harmonicGain.gain.value = 0.12;
    harmonic.connect(harmonicGain);
    harmonicGain.connect(envelope);
    harmonic.start(now);
    harmonic.stop(now + duration);

    osc.connect(envelope);
    envelope.connect(this.audioContext.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export default CarouselAudio;
