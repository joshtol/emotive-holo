/**
 * Meditation Controller
 * Guided breathing exercises with mascot synchronization
 */

export class MeditationController {
  constructor(mascot, tts, elements) {
    this.mascot = mascot;
    this.tts = tts;
    this.elements = elements;

    this.isActive = false;
    this.currentPhase = null;
    this.cycleCount = 0;
    this.maxCycles = 5;
    this.timerInterval = null;

    this.onEnd = null;

    // Progress elements
    this.progressFill = null;
    this.progressLabel = null;
    this.hologramContainer = null;

    // Breathing pattern (in seconds)
    this.pattern = {
      inhale: 4,
      holdIn: 4,
      exhale: 6,
      holdOut: 2
    };

    // Phase configurations
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
        cue: null // Silent rest
      }
    };
  }

  async start() {
    this.isActive = true;
    this.cycleCount = 0;

    // Get progress elements
    this.progressFill = document.querySelector('#meditation-progress .progress-fill');
    this.progressLabel = document.querySelector('#meditation-progress .progress-label');
    this.hologramContainer = document.getElementById('hologram-container');

    // Show meditation overlay and add blur class to container
    this.elements.meditationOverlay.classList.remove('hidden');
    if (this.hologramContainer) {
      this.hologramContainer.classList.add('meditation-active');
    }

    // Initial progress
    this.updateProgress();

    // Initial guidance
    this.mascot.feel('serene, settle, breathe');

    // Wait a moment for the intro TTS to finish
    await this.delay(2000);

    // Start breathing cycles
    await this.runCycles();
  }

  async runCycles() {
    while (this.isActive && this.cycleCount < this.maxCycles) {
      this.cycleCount++;
      console.log(`Meditation cycle ${this.cycleCount}/${this.maxCycles}`);

      // Update progress at start of each cycle
      this.updateProgress();

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

  /**
   * Update the progress bar and label
   */
  updateProgress() {
    const progress = this.cycleCount / this.maxCycles;

    if (this.progressFill) {
      this.progressFill.style.width = `${progress * 100}%`;
    }

    if (this.progressLabel) {
      this.progressLabel.textContent = `Cycle ${this.cycleCount} of ${this.maxCycles}`;
    }
  }

  async runPhase(phaseName) {
    const phase = this.phases[phaseName];
    this.currentPhase = phaseName;

    // Update UI
    this.elements.meditationPhase.textContent = phase.name;

    // Apply mascot feel
    this.mascot.feel(phase.feel);

    // Speak cue (if any) - don't await, let it overlap with countdown
    if (phase.cue) {
      this.tts.speak(phase.cue).catch(() => {}); // Ignore TTS errors during meditation
    }

    // Countdown timer
    await this.countdown(phase.duration);
  }

  countdown(seconds) {
    return new Promise((resolve) => {
      let remaining = seconds;

      this.elements.meditationTimer.textContent = remaining;

      this.timerInterval = setInterval(() => {
        remaining--;

        if (remaining <= 0) {
          clearInterval(this.timerInterval);
          this.elements.meditationTimer.textContent = '';
          resolve();
        } else {
          this.elements.meditationTimer.textContent = remaining;
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

    this.mascot.feel('compassionate, gentle glow');
    await this.tts.speak(affirmation);
    await this.delay(1000);
  }

  async end() {
    this.isActive = false;

    // Clear timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    // Final message
    this.elements.meditationPhase.textContent = 'Complete';
    this.elements.meditationTimer.textContent = '';

    // Set progress to 100%
    if (this.progressFill) {
      this.progressFill.style.width = '100%';
    }
    if (this.progressLabel) {
      this.progressLabel.textContent = 'Complete';
    }

    this.mascot.feel('peaceful, shimmer, settle');
    await this.tts.speak("Well done. Take a moment before continuing.");

    await this.delay(2000);

    // Hide overlay and remove blur class
    this.elements.meditationOverlay.classList.add('hidden');
    if (this.hologramContainer) {
      this.hologramContainer.classList.remove('meditation-active');
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

    this.elements.meditationOverlay.classList.add('hidden');
    if (this.hologramContainer) {
      this.hologramContainer.classList.remove('meditation-active');
    }
    this.mascot.feel('understanding, settle');

    if (this.onEnd) {
      this.onEnd();
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
