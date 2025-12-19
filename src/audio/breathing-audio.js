/**
 * BreathingAudio - Procedural audio cues for meditation breathing
 *
 * Uses Web Audio API to generate gentle, ethereal sounds:
 * - Phase chimes announce each breath phase with a chord
 * - Count plucks walk through the chord notes as a descending arpeggio
 * - Music box / kalimba character with triangle waves and soft shimmer
 * - Chord progressions cycle through relaxing voicings each round
 */

export class BreathingAudio {
  constructor() {
    this.audioContext = null;

    // Pool of relaxing chord progressions with full descending scales
    // Each progression has chime chord + descending scale for counts
    this.progressions = [
      {
        name: 'C major',
        inhale: [523.25, 659.25, 783.99, 987.77],   // Cmaj7 chord: C5-E5-G5-B5
        hold: [698.46, 880.00, 1046.50, 1318.51],   // Fmaj7 chord: F5-A5-C6-E6
        exhale: [493.88, 392.00, 329.63, 261.63],   // Cmaj7 chord desc: B4-G4-E4-C4
        // C major scale descending from B5: B5-A5-G5-F5-E5-D5-C5-B4-A4-G4
        scale: [987.77, 880.00, 783.99, 698.46, 659.25, 587.33, 523.25, 493.88, 440.00, 392.00]
      },
      {
        name: 'G major',
        inhale: [392.00, 493.88, 587.33, 739.99],   // Gmaj7: G4-B4-D5-F#5
        hold: [329.63, 493.88, 587.33, 783.99],     // Em7: E4-B4-D5-G5
        exhale: [739.99, 587.33, 493.88, 392.00],   // Gmaj7 desc
        // G major scale descending from F#5: F#5-E5-D5-C5-B4-A4-G4-F#4-E4-D4
        scale: [739.99, 659.25, 587.33, 523.25, 493.88, 440.00, 392.00, 369.99, 329.63, 293.66]
      },
      {
        name: 'D major',
        inhale: [293.66, 369.99, 440.00, 554.37],   // Dmaj7: D4-F#4-A4-C#5
        hold: [440.00, 554.37, 659.25, 830.61],     // Amaj7: A4-C#5-E5-G#5
        exhale: [554.37, 440.00, 369.99, 293.66],   // Dmaj7 desc
        // D major scale descending from C#5: C#5-B4-A4-G4-F#4-E4-D4-C#4-B3-A3
        scale: [554.37, 493.88, 440.00, 392.00, 369.99, 329.63, 293.66, 277.18, 246.94, 220.00]
      },
      {
        name: 'F major',
        inhale: [349.23, 440.00, 523.25, 659.25],   // Fmaj7: F4-A4-C5-E5
        hold: [293.66, 440.00, 523.25, 698.46],     // Dm7: D4-A4-C5-F5
        exhale: [659.25, 523.25, 440.00, 349.23],   // Fmaj7 desc
        // F major scale descending from E5: E5-D5-C5-Bb4-A4-G4-F4-E4-D4-C4
        scale: [659.25, 587.33, 523.25, 466.16, 440.00, 392.00, 349.23, 329.63, 293.66, 261.63]
      },
      {
        name: 'A major',
        inhale: [440.00, 554.37, 659.25, 830.61],   // Amaj7: A4-C#5-E5-G#5
        hold: [369.99, 554.37, 659.25, 880.00],     // F#m7: F#4-C#5-E5-A5
        exhale: [830.61, 659.25, 554.37, 440.00],   // Amaj7 desc
        // A major scale descending from G#5: G#5-F#5-E5-D5-C#5-B4-A4-G#4-F#4-E4
        scale: [830.61, 739.99, 659.25, 587.33, 554.37, 493.88, 440.00, 415.30, 369.99, 329.63]
      },
      {
        name: 'Eb major',
        inhale: [311.13, 392.00, 466.16, 587.33],   // Ebmaj7: Eb4-G4-Bb4-D5
        hold: [261.63, 392.00, 466.16, 622.25],     // Cm7: C4-G4-Bb4-Eb5
        exhale: [587.33, 466.16, 392.00, 311.13],   // Ebmaj7 desc
        // Eb major scale descending from D5: D5-C5-Bb4-Ab4-G4-F4-Eb4-D4-C4-Bb3
        scale: [587.33, 523.25, 466.16, 415.30, 392.00, 349.23, 311.13, 293.66, 261.63, 233.08]
      },
      {
        name: 'Bb major',
        inhale: [466.16, 587.33, 698.46, 880.00],   // Bbmaj7: Bb4-D5-F5-A5
        hold: [392.00, 587.33, 698.46, 932.33],     // Gm7: G4-D5-F5-Bb5
        exhale: [880.00, 698.46, 587.33, 466.16],   // Bbmaj7 desc
        // Bb major scale descending from A5: A5-G5-F5-Eb5-D5-C5-Bb4-A4-G4-F4
        scale: [880.00, 783.99, 698.46, 622.25, 587.33, 523.25, 466.16, 440.00, 392.00, 349.23]
      },
      {
        name: 'E major',
        inhale: [329.63, 415.30, 493.88, 622.25],   // Emaj7: E4-G#4-B4-D#5
        hold: [277.18, 415.30, 493.88, 659.25],     // C#m7: C#4-G#4-B4-E5
        exhale: [622.25, 493.88, 415.30, 329.63],   // Emaj7 desc
        // E major scale descending from D#5: D#5-C#5-B4-A4-G#4-F#4-E4-D#4-C#4-B3
        scale: [622.25, 554.37, 493.88, 440.00, 415.30, 369.99, 329.63, 311.13, 277.18, 246.94]
      }
    ];

    this.currentProgressionIndex = 0;
    this.currentPhase = null;
    this.currentChord = null;

    // Sustained pedal tone for hold phase
    this.pedalOscillators = [];
    this.pedalGain = null;
  }

  /**
   * Get the current chord progression
   */
  get chords() {
    return this.progressions[this.currentProgressionIndex];
  }

  /**
   * Advance to the next chord progression (call after each breath cycle)
   */
  nextProgression() {
    this.currentProgressionIndex = (this.currentProgressionIndex + 1) % this.progressions.length;
  }

  /**
   * Initialize audio context (must be called after user interaction)
   */
  async init() {
    if (this.audioContext) return;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  /**
   * Start the breathing audio (resumes context if suspended)
   */
  start() {
    if (!this.audioContext) return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  /**
   * Stop the breathing audio
   */
  stop() {
    this._stopPedal();
  }

  /**
   * Set the breathing phase - plays the phase chime
   * @param {string} phase - 'inhale' | 'exhale' | 'hold'
   * @param {number} duration - Phase duration in seconds
   */
  setPhase(phase, duration) {
    if (!this.audioContext) return;

    // Stop any existing pedal tone
    this._stopPedal();

    this.currentPhase = phase;
    this.currentChord = this.chords[phase] || this.chords.hold;

    this._playPhaseChime(phase);

    // Start sustained pedal tone for hold phase
    if (phase === 'hold') {
      this._startPedal(duration);
    }
  }

  /**
   * Start a very soft, low sustained pedal tone
   * @param {number} duration - How long to sustain
   */
  _startPedal(duration) {
    if (!this.audioContext) return;

    const scale = this.chords.scale;
    if (!scale) return;

    const now = this.audioContext.currentTime;

    // Use root note dropped an octave for a deep, unobtrusive pad
    const rootFreq = scale[scale.length - 1] / 2;

    // Create master gain for pedal - very quiet
    this.pedalGain = this.audioContext.createGain();
    this.pedalGain.gain.setValueAtTime(0, now);
    this.pedalGain.gain.linearRampToValueAtTime(0.015, now + 1.0); // Very slow fade in
    this.pedalGain.gain.setValueAtTime(0.015, now + duration - 1.5);
    this.pedalGain.gain.linearRampToValueAtTime(0, now + duration); // Fade out
    this.pedalGain.connect(this.audioContext.destination);

    // Single soft sine wave - minimal and unobtrusive
    const osc = this.audioContext.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = rootFreq;

    osc.connect(this.pedalGain);
    osc.start(now);
    osc.stop(now + duration);

    this.pedalOscillators.push(osc);
  }

  /**
   * Stop the pedal tone
   */
  _stopPedal() {
    if (this.pedalGain) {
      try {
        const now = this.audioContext.currentTime;
        this.pedalGain.gain.cancelScheduledValues(now);
        this.pedalGain.gain.setValueAtTime(this.pedalGain.gain.value, now);
        this.pedalGain.gain.linearRampToValueAtTime(0, now + 0.3);
      } catch (e) { /* ignore */ }
    }
    this.pedalOscillators.forEach(osc => {
      try { osc.stop(); } catch (e) { /* already stopped */ }
    });
    this.pedalOscillators = [];
    this.pedalGain = null;
  }

  /**
   * Play a count sound - ascends on inhale, descends on exhale, oscillates on hold
   * @param {number} count - Current count number (counting down)
   * @param {number} total - Total count for this phase
   */
  playCount(count, total) {
    if (!this.audioContext) return;

    const scale = this.chords.scale;
    if (!scale) return;

    // count goes: total, total-1, ..., 2, 1
    const stepsFromStart = total - count; // 0, 1, 2, ... total-1

    let freq;
    if (this.currentPhase === 'inhale') {
      // Ascending: start from bottom of scale, go up
      const noteIndex = Math.min(stepsFromStart, scale.length - 1);
      freq = scale[scale.length - 1 - noteIndex];
    } else if (this.currentPhase === 'hold') {
      // Wobble/oscillate between root and second note
      const wobbleIndex = stepsFromStart % 2;
      freq = scale[scale.length - 1 - wobbleIndex];
    } else {
      // Descending: start from top of scale, go down
      const noteIndex = Math.min(stepsFromStart, scale.length - 1);
      freq = scale[noteIndex];
    }

    this._playPluck(freq);
  }

  /**
   * Play the phase transition chime - soft chord announcement
   * @param {string} phase - The phase we're entering
   */
  _playPhaseChime(phase) {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const chord = this.chords[phase] || this.chords.hold;

    // Play chord notes with slight stagger for arpeggio feel
    chord.forEach((freq, i) => {
      const stagger = i * 0.08; // 80ms between notes
      this._playChimeNote(freq, now + stagger, 0.08 - (i * 0.015)); // Softer for upper notes
    });
  }

  /**
   * Play a single chime note (for phase announcements)
   */
  _playChimeNote(freq, startTime, volume = 0.08) {
    const now = startTime;
    const duration = 1.2;

    // Triangle wave for soft bell-like tone
    const osc = this.audioContext.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    // Subtle vibrato for shimmer
    const vibrato = this.audioContext.createOscillator();
    vibrato.type = 'sine';
    vibrato.frequency.value = 4;
    const vibratoGain = this.audioContext.createGain();
    vibratoGain.gain.value = 2;
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);
    vibrato.start(now);
    vibrato.stop(now + duration);

    // Envelope
    const envelope = this.audioContext.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(volume, now + 0.03);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Soft harmonic
    const harmonic = this.audioContext.createOscillator();
    harmonic.type = 'sine';
    harmonic.frequency.value = freq * 2;
    const harmonicGain = this.audioContext.createGain();
    harmonicGain.gain.value = 0.2;
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
   * Play a count pluck - shorter, softer, music box character
   */
  _playPluck(freq) {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const duration = 0.6;
    const volume = 0.06;

    // Triangle wave
    const osc = this.audioContext.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    // Very subtle vibrato
    const vibrato = this.audioContext.createOscillator();
    vibrato.type = 'sine';
    vibrato.frequency.value = 6;
    const vibratoGain = this.audioContext.createGain();
    vibratoGain.gain.value = 1.5;
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);
    vibrato.start(now);
    vibrato.stop(now + duration);

    // Quick attack, gentle decay - music box feel
    const envelope = this.audioContext.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(volume, now + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Light harmonic for sparkle
    const harmonic = this.audioContext.createOscillator();
    harmonic.type = 'sine';
    harmonic.frequency.value = freq * 2;
    const harmonicGain = this.audioContext.createGain();
    harmonicGain.gain.value = 0.15;
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
   * Clean up audio resources
   */
  destroy() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export default BreathingAudio;
