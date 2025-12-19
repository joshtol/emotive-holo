/**
 * TTSMeter - Synchronizes text display with Web Speech API playback
 * Uses boundary events to track speech progress in real-time
 */
class TTSMeter {
  constructor() {
    this._utterance = null;
    this._text = '';
    this._chunks = [];       // Parsed sentence/phrase chunks
    this._currentChunkIdx = 0;
    this._onChunkChange = null;
    this._onComplete = null;
    this._speaking = false;
  }

  /**
   * Speak text with synchronized chunk callbacks
   * @param {string} text - Full text to speak
   * @param {Function} onChunkChange - Called with { chunk, index, charIndex }
   * @param {Function} onComplete - Called when speech ends
   * @param {Object} options - Optional voice settings { rate, pitch, voice }
   */
  speak(text, onChunkChange, onComplete, options = {}) {
    this.stop();

    this._text = text;
    this._chunks = this._parseChunks(text);
    this._currentChunkIdx = 0;
    this._onChunkChange = onChunkChange;
    this._onComplete = onComplete;
    this._speaking = true;

    this._utterance = new SpeechSynthesisUtterance(text);

    // Apply optional voice settings
    if (options.rate) this._utterance.rate = options.rate;
    if (options.pitch) this._utterance.pitch = options.pitch;
    if (options.voice) this._utterance.voice = options.voice;

    this._utterance.onboundary = (e) => {
      if (e.name === 'sentence' || e.name === 'word') {
        const chunkIdx = this._findChunkForChar(e.charIndex);
        if (chunkIdx !== this._currentChunkIdx) {
          this._currentChunkIdx = chunkIdx;
          this._onChunkChange?.({
            chunk: this._chunks[chunkIdx],
            index: chunkIdx,
            charIndex: e.charIndex,
            total: this._chunks.length
          });
        }
      }
    };

    this._utterance.onstart = () => {
      this._speaking = true;
      this._onChunkChange?.({
        chunk: this._chunks[0],
        index: 0,
        charIndex: 0,
        total: this._chunks.length
      });
    };

    this._utterance.onend = () => {
      this._speaking = false;
      this._onComplete?.();
    };

    this._utterance.onerror = (e) => {
      console.warn('TTSMeter speech error:', e.error);
      this._speaking = false;
      this._onComplete?.();
    };

    speechSynthesis.speak(this._utterance);
  }

  /**
   * Stop current speech
   */
  stop() {
    speechSynthesis.cancel();
    this._utterance = null;
    this._speaking = false;
  }

  /**
   * Pause speech
   */
  pause() {
    speechSynthesis.pause();
  }

  /**
   * Resume speech
   */
  resume() {
    speechSynthesis.resume();
  }

  /**
   * Parse text into display chunks (sentences/phrases)
   * Splits on sentence endings and major punctuation
   */
  _parseChunks(text) {
    // Split on sentence boundaries (.!?) and clause boundaries (,;:)
    // Keep the punctuation with the preceding text
    const parts = text.split(/(?<=[.!?])\s+|(?<=[,;:])\s+/);
    let charOffset = 0;

    return parts.map(part => {
      const trimmed = part.trim();
      const chunk = {
        text: trimmed,
        start: charOffset,
        end: charOffset + part.length
      };
      // Account for the space that was split on
      charOffset += part.length + 1;
      return chunk;
    }).filter(c => c.text.length > 0);
  }

  /**
   * Find which chunk contains a character index
   */
  _findChunkForChar(charIndex) {
    for (let i = this._chunks.length - 1; i >= 0; i--) {
      if (charIndex >= this._chunks[i].start) return i;
    }
    return 0;
  }

  /**
   * Get available voices
   * Note: voices may load async, call after voiceschanged event
   */
  getVoices() {
    return speechSynthesis.getVoices();
  }

  /**
   * Wait for voices to be loaded
   */
  waitForVoices() {
    return new Promise(resolve => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        resolve(voices);
      } else {
        speechSynthesis.onvoiceschanged = () => {
          resolve(speechSynthesis.getVoices());
        };
      }
    });
  }

  get chunks() { return this._chunks; }
  get currentChunk() { return this._chunks[this._currentChunkIdx]; }
  get currentIndex() { return this._currentChunkIdx; }
  get isSpeaking() { return this._speaking; }
  get text() { return this._text; }
}

export default TTSMeter;
