/**
 * Native TTS Module
 * Uses the browser's built-in Web Speech API for text-to-speech
 * Falls back gracefully when not available
 */

export class NativeTTS {
  constructor(mascot) {
    this.mascot = mascot;
    this.synth = window.speechSynthesis;
    this.isSpeaking = false;
    this.currentUtterance = null;

    // Progress tracking callback
    this.onProgress = null; // (progress: 0-1) => void

    // Chunk-based CC-style text display
    this.onChunkChange = null;
    this._chunks = [];
    this._currentChunkIndex = 0;
    this._wordsPerChunk = 12;

    // Voice selection
    this._preferredVoice = null;
    this._loadVoices();
  }

  /**
   * Load available voices (async on some browsers)
   */
  _loadVoices() {
    const setVoice = () => {
      const voices = this.synth?.getVoices() || [];
      // Prefer a natural-sounding English voice
      this._preferredVoice = voices.find(v =>
        v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Premium') || v.name.includes('Enhanced'))
      ) || voices.find(v => v.lang.startsWith('en')) || voices[0];

      if (this._preferredVoice) {
        console.log('Selected TTS voice:', this._preferredVoice.name);
      }
    };

    // Voices might be loaded asynchronously
    if (this.synth?.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = setVoice;
    }
    setVoice();
  }

  /**
   * Split text into chunks for CC-style display
   */
  _splitIntoChunks(text) {
    const words = text.split(/\s+/);
    const chunks = [];

    for (let i = 0; i < words.length; i += this._wordsPerChunk) {
      chunks.push(words.slice(i, i + this._wordsPerChunk).join(' '));
    }

    return chunks;
  }

  async speak(text) {
    if (!text.trim()) return;

    // Check if synthesis is available
    if (!this.synth) {
      console.warn('Speech synthesis not available');
      return;
    }

    // Cancel any ongoing speech
    this.stop();

    try {
      this.isSpeaking = true;

      // Split text into chunks for CC-style display
      this._chunks = this._splitIntoChunks(text);
      this._currentChunkIndex = 0;

      // Show first chunk immediately
      if (this.onChunkChange && this._chunks.length > 0) {
        this.onChunkChange(this._chunks[0], 0, this._chunks.length);
      }

      // Create utterance
      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance;

      // Set voice if available
      if (this._preferredVoice) {
        utterance.voice = this._preferredVoice;
      }

      // Configure speech parameters
      utterance.rate = 1.0;  // Speed (0.1 to 10)
      utterance.pitch = 1.0; // Pitch (0 to 2)
      utterance.volume = 1.0; // Volume (0 to 1)

      // Track word boundaries for chunk updates
      let wordCount = 0;
      const totalWords = text.split(/\s+/).length;

      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          wordCount++;
          const progress = wordCount / totalWords;

          // Update progress
          if (this.onProgress) {
            this.onProgress(progress);
          }

          // Update mascot intensity based on speaking (simple pulse effect)
          if (this.mascot && this.mascot.setIntensity) {
            // Gentle pulsing while speaking
            const intensity = 0.6 + Math.sin(wordCount * 0.5) * 0.2;
            this.mascot.setIntensity(intensity);
          }

          // Update chunk display
          const expectedChunkIndex = Math.floor(progress * this._chunks.length);
          if (expectedChunkIndex > this._currentChunkIndex && expectedChunkIndex < this._chunks.length) {
            this._currentChunkIndex = expectedChunkIndex;
            if (this.onChunkChange) {
              this.onChunkChange(
                this._chunks[this._currentChunkIndex],
                this._currentChunkIndex,
                this._chunks.length
              );
            }
          }
        }
      };

      // Return a promise that resolves when speech ends
      return new Promise((resolve, reject) => {
        utterance.onend = () => {
          console.log('TTS ended');
          this.isSpeaking = false;
          this.currentUtterance = null;

          if (this.onProgress) {
            this.onProgress(1);
          }

          // Reset mascot intensity
          if (this.mascot && this.mascot.resetIntensity) {
            this.mascot.resetIntensity();
          }

          resolve();
        };

        utterance.onerror = (event) => {
          console.error('TTS error:', event.error);
          this.isSpeaking = false;
          this.currentUtterance = null;

          // Reset mascot intensity
          if (this.mascot && this.mascot.resetIntensity) {
            this.mascot.resetIntensity();
          }

          // Don't reject - TTS is optional
          resolve();
        };

        // Start speaking
        console.log('TTS speaking:', text.substring(0, 50) + '...');
        this.synth.speak(utterance);
      });

    } catch (error) {
      console.error('TTS error:', error);
      this.isSpeaking = false;
    }
  }

  /**
   * Stop current speech
   */
  stop() {
    console.log('TTS stop called');
    this.isSpeaking = false;
    this.currentUtterance = null;

    if (this.synth) {
      this.synth.cancel();
    }

    // Reset mascot intensity
    if (this.mascot && this.mascot.resetIntensity) {
      this.mascot.resetIntensity();
    }
  }

  /**
   * Check if TTS is supported
   */
  isSupported() {
    return !!this.synth;
  }

  /**
   * Get available voices
   */
  getVoices() {
    return this.synth?.getVoices() || [];
  }

  /**
   * Set preferred voice by name
   */
  setVoice(voiceName) {
    const voices = this.getVoices();
    const voice = voices.find(v => v.name === voiceName);
    if (voice) {
      this._preferredVoice = voice;
      console.log('TTS voice set to:', voice.name);
    }
  }
}
