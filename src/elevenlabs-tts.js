/**
 * ElevenLabs TTS Module
 * Text-to-speech with audio amplitude analysis for mascot pulse sync
 */

export class ElevenLabsTTS {
  constructor(mascot) {
    this.mascot = mascot;
    this.endpoint = '/api/tts';
    this.voiceId = '8IhxtPWIwDeFn0maVFPj'; // Custom Emo voice
    this.audioContext = null;
    this.analyser = null;
    this.animationFrame = null;
    this.isSpeaking = false;
    this.currentAudio = null; // Track current audio for cancellation

    // Progress tracking callback
    this.onProgress = null; // (progress: 0-1) => void

    // Word progress callback - reveals text progressively
    this.onWordProgress = null; // (visibleText: string, fullText: string) => void
    this._currentText = '';
    this._words = [];
  }

  async speak(text) {
    if (!text.trim()) return;

    try {
      this.isSpeaking = true;

      // Store text for progressive reveal
      this._currentText = text;
      this._words = text.split(/\s+/);

      // Fetch audio from ElevenLabs via backend
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          voiceId: this.voiceId
        })
      });

      if (!response.ok) {
        throw new Error('TTS request failed');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Play audio and sync to mascot
      await this.playWithAmplitudeSync(audioUrl);

      // Cleanup
      URL.revokeObjectURL(audioUrl);
      this.isSpeaking = false;

    } catch (error) {
      console.error('TTS error:', error);
      this.isSpeaking = false;
      // Don't throw - allow the UI to continue showing the text
      // TTS is optional enhancement, not critical path
    }
  }

  async playWithAmplitudeSync(audioUrl) {
    return new Promise((resolve, reject) => {
      // Create audio element
      const audio = new Audio(audioUrl);
      this.currentAudio = audio; // Track for cancellation

      // Setup Web Audio API for amplitude analysis
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      const source = this.audioContext.createMediaElementSource(audio);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;

      source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      // Animation loop for amplitude tracking
      const trackAmplitude = () => {
        if (!this.isSpeaking) return;

        this.analyser.getByteFrequencyData(dataArray);

        // Calculate average amplitude
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = average / 255; // 0-1 range

        // Map amplitude to mascot intensity (0.4 - 1.0 range)
        const intensity = 0.4 + (normalized * 0.6);

        // Update mascot - modulate bloom and emission warmth based on voice amplitude
        if (this.mascot && this.mascot.setIntensity) {
          this.mascot.setIntensity(intensity);
          // Debug: log every ~30 frames
          if (Math.random() < 0.03) {
            console.log(`[TTS] amplitude=${normalized.toFixed(2)} intensity=${intensity.toFixed(2)}`);
          }
        }

        this.animationFrame = requestAnimationFrame(trackAmplitude);
      };

      // Progress tracking with word reveal
      const trackProgress = () => {
        if (!this.isSpeaking || !audio.duration) return;
        const progress = audio.currentTime / audio.duration;
        if (this.onProgress) {
          this.onProgress(progress);
        }

        // Progressive word reveal with sliding window
        if (this.onWordProgress && this._words.length > 0) {
          // Calculate current word index based on progress
          // Add slight lead time so words appear just before they're spoken
          const adjustedProgress = Math.min(1, progress * 1.1 + 0.05);
          const currentWordIndex = Math.floor(adjustedProgress * this._words.length);

          // Show a sliding window of ~5-6 words for single-line display
          const windowSize = 6;
          const leadWords = 2;  // Show 2 words ahead of current
          const startIndex = Math.max(0, currentWordIndex - (windowSize - leadWords));
          const endIndex = Math.min(this._words.length, startIndex + windowSize);

          const visibleWords = this._words.slice(startIndex, endIndex);
          const visibleText = visibleWords.join(' ');
          this.onWordProgress(visibleText, this._currentText, currentWordIndex);
        }
      };

      // Event handlers
      audio.onplay = () => {
        console.log('TTS playing');
        trackAmplitude();
      };

      audio.ontimeupdate = trackProgress;

      audio.onended = () => {
        console.log('TTS ended');
        this.currentAudio = null;
        this.stopAmplitudeTracking();
        if (this.onProgress) {
          this.onProgress(1); // Complete
        }
        resolve();
      };

      audio.onerror = (error) => {
        console.error('Audio playback error:', error);
        this.currentAudio = null;
        this.stopAmplitudeTracking();
        reject(error);
      };

      // Start playback
      audio.play().catch(reject);
    });
  }

  stopAmplitudeTracking() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // Reset mascot intensity to baseline (restores bloom and glow color)
    if (this.mascot && this.mascot.resetIntensity) {
      this.mascot.resetIntensity();
    }
  }

  /**
   * Stop current audio playback (for cancel button)
   */
  stop() {
    console.log('TTS stop called');
    this.isSpeaking = false;

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }

    this.stopAmplitudeTracking();
  }

  setVoice(voiceId) {
    this.voiceId = voiceId;
  }

  // Fetch available voices
  async getVoices() {
    try {
      const response = await fetch('/api/voices');
      const data = await response.json();
      return data.voices || [];
    } catch (error) {
      console.error('Failed to fetch voices:', error);
      return [];
    }
  }
}
