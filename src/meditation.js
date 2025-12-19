/**
 * Meditation Controller
 * Guided breathing exercises with mascot synchronization
 */

export class MeditationController {
  constructor(mascot, tts, elements, holoPhone3D = null) {
    this.mascot = mascot;
    this.tts = tts;
    this.elements = elements;
    this.holoPhone3D = holoPhone3D;

    this.isActive = false;
    this.currentPhase = null;
    this.cycleCount = 0;
    this.maxCycles = 5;
    this.timerInterval = null;

    this.onEnd = null;

    // Container reference for blur effect
    this.hologramContainer = null;

    // Breathing patterns (in seconds)
    this.patterns = {
      default: { inhale: 4, holdIn: 4, exhale: 6, holdOut: 2 },
      box: { inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 }  // 4-4-4-4 box breathing
    };
    this.pattern = { ...this.patterns.default };
    this.patternName = 'default';

    // Phase configurations (durations set dynamically)
    this._initPhases();
  }

  /**
   * Initialize phase configurations from current pattern
   */
  _initPhases() {
    this.phases = {
      inhale: {
        name: 'Breathe In',
        duration: this.pattern.inhale,
        feel: 'serene, breathe',
        cue: 'Breathe in'
      },
      holdIn: {
        name: 'Hold',
        duration: this.pattern.holdIn,
        feel: 'peaceful, glow',
        cue: 'Hold'
      },
      exhale: {
        name: 'Breathe Out',
        duration: this.pattern.exhale,
        feel: 'calm, settle',
        cue: 'Release'
      },
      holdOut: {
        name: 'Rest',
        duration: this.pattern.holdOut,
        feel: 'resting, gentle sway',
        cue: this.patternName === 'box' ? 'Hold' : null // Say "Hold" for box breathing
      }
    };
  }

  /**
   * Set breathing pattern
   * @param {string} name - 'default' or 'box'
   */
  setPattern(name) {
    if (this.patterns[name]) {
      this.pattern = { ...this.patterns[name] };
      this.patternName = name;
      this._initPhases();
      console.log(`Meditation pattern set to: ${name}`, this.pattern);
    }
  }

  async start() {
    this.isActive = true;
    this.cycleCount = 0;

    // Get hologram container for blur effect
    this.hologramContainer = document.getElementById('hologram-container');

    // Add blur class to container (blurs background, not mascot)
    if (this.hologramContainer) {
      this.hologramContainer.classList.add('meditation-active');
    }

    // Set up holoPhone for meditation - all UI goes on the phone now
    if (this.holoPhone3D) {
      this.holoPhone3D.setState('meditation');
      this.holoPhone3D.setText('Breathe with me...');
      this.holoPhone3D.setMeditationData({
        phase: 'Breathe with me...',
        timer: '',
        cycle: 0,
        maxCycles: this.maxCycles
      });
    }

    // Initial guidance
    this.mascot.feel('calm, settle, breathe');

    // Wait a moment for the intro TTS to finish
    await this.delay(2000);

    // Start breathing cycles
    await this.runCycles();
  }

  async runCycles() {
    while (this.isActive && this.cycleCount < this.maxCycles) {
      this.cycleCount++;
      console.log(`Meditation cycle ${this.cycleCount}/${this.maxCycles}`);

      // Run through all phases
      await this.runPhase('inhale');
      if (!this.isActive) break;

      await this.runPhase('holdIn');
      if (!this.isActive) break;

      await this.runPhase('exhale');
      if (!this.isActive) break;

      await this.runPhase('holdOut');
      if (!this.isActive) break;

      // Every 2 cycles, add an affirmation
      if (this.cycleCount % 2 === 0 && this.cycleCount < this.maxCycles) {
        await this.speakAffirmation();
      }
    }

    // End meditation
    if (this.isActive) {
      await this.end();
    }
  }

  async runPhase(phaseName) {
    const phase = this.phases[phaseName];
    this.currentPhase = phaseName;

    // Update holoPhone with phase name, timer, and cycle progress
    if (this.holoPhone3D) {
      this.holoPhone3D.setMeditationData({
        phase: phase.name,
        timer: phase.duration,
        cycle: this.cycleCount,
        maxCycles: this.maxCycles
      });
    }

    // Apply mascot feel
    this.mascot.feel(phase.feel);

    // Speak cue (if any) - don't await, let it overlap with countdown
    if (phase.cue) {
      this.tts.speak(phase.cue).catch(() => {}); // Ignore TTS errors during meditation
    }

    // Countdown timer
    await this.countdown(phase.duration, phase.name);
  }

  countdown(seconds, phaseName) {
    return new Promise((resolve) => {
      let remaining = seconds;

      // Update holophone with initial timer value
      if (this.holoPhone3D) {
        this.holoPhone3D.setMeditationData({
          phase: phaseName,
          timer: remaining,
          cycle: this.cycleCount,
          maxCycles: this.maxCycles
        });
      }

      this.timerInterval = setInterval(() => {
        remaining--;

        if (remaining <= 0) {
          clearInterval(this.timerInterval);
          // Clear timer display
          if (this.holoPhone3D) {
            this.holoPhone3D.setMeditationData({
              phase: phaseName,
              timer: '',
              cycle: this.cycleCount,
              maxCycles: this.maxCycles
            });
          }
          resolve();
        } else {
          // Update holophone with countdown
          if (this.holoPhone3D) {
            this.holoPhone3D.setMeditationData({
              phase: phaseName,
              timer: remaining,
              cycle: this.cycleCount,
              maxCycles: this.maxCycles
            });
          }
        }
      }, 1000);
    });
  }

  async speakAffirmation() {
    const affirmations = [
      "You're doing wonderfully.",
      "Let go of any tension.",
      "Feel the calm spreading through you.",
      "Each breath brings more peace.",
      "You are safe and relaxed."
    ];

    const affirmation = affirmations[Math.floor(Math.random() * affirmations.length)];

    // Update holoPhone with affirmation (no timer during affirmation)
    if (this.holoPhone3D) {
      this.holoPhone3D.setText(affirmation);
      this.holoPhone3D.setMeditationData({
        phase: affirmation,
        timer: '',
        cycle: this.cycleCount,
        maxCycles: this.maxCycles
      });
    }

    this.mascot.feel('love, gentle glow');
    await this.tts.speak(affirmation);
    await this.delay(1000);
  }

  async end() {
    this.isActive = false;

    // Clear timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    // Update holoPhone with completion state
    if (this.holoPhone3D) {
      this.holoPhone3D.setText('Well done.');
      this.holoPhone3D.setMeditationData({
        phase: 'Complete',
        timer: '',
        cycle: this.maxCycles,
        maxCycles: this.maxCycles
      });
    }

    this.mascot.feel('calm, shimmer, settle');
    await this.tts.speak("Well done. Take a moment before continuing.");

    await this.delay(2000);

    // Remove blur class from container
    if (this.hologramContainer) {
      this.hologramContainer.classList.remove('meditation-active');
    }

    // Reset holoPhone to idle state
    if (this.holoPhone3D) {
      this.holoPhone3D.setState('idle');
      this.holoPhone3D.setText('Hold to speak');
      this.holoPhone3D.setMeditationData(null);
      this.holoPhone3D.setProgress(0);
    }

    // Reset mascot
    this.mascot.feel('calm, gentle breathing');

    // Callback
    if (this.onEnd) {
      this.onEnd();
    }
  }

  stop() {
    this.isActive = false;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    // Remove blur class from container
    if (this.hologramContainer) {
      this.hologramContainer.classList.remove('meditation-active');
    }

    // Reset holoPhone to idle state
    if (this.holoPhone3D) {
      this.holoPhone3D.setState('idle');
      this.holoPhone3D.setText('Hold to speak');
      this.holoPhone3D.setMeditationData(null);
      this.holoPhone3D.setProgress(0);
    }

    this.mascot.feel('calm, settle');

    if (this.onEnd) {
      this.onEnd();
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
