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

    // Character position callback for StoryDirector
    this.onCharPosition = null; // (charIndex: number) => void

    // Chunk-based CC-style text display
    this.onChunkChange = null;
    this._chunks = [];
    this._currentChunkIndex = 0;
    this._wordsPerChunk = 12;

    // Voice selection
    this._preferredVoice = null;
    this._loadVoices();

    // Stop TTS when page is closed/refreshed to prevent it continuing
    window.addEventListener('beforeunload', () => {
      this.stop();
    });
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
   * Limits each chunk to ~2-3 lines (maxChars) for readability
   * Breaks at word boundaries, preferring natural pauses
   * Tracks word indices for progress-based sync
   */
  _splitIntoChunks(text) {
    const maxChars = 80;  // ~2-3 lines on phone screen
    const words = text.split(/\s+/);
    const chunks = [];
    let currentChunk = '';
    let chunkStartWord = 0;
    let wordIdx = 0;

    for (const word of words) {
      const testChunk = currentChunk + (currentChunk ? ' ' : '') + word;

      // Check if adding this word exceeds limit
      if (testChunk.length > maxChars && currentChunk) {
        // Save current chunk with word range
        chunks.push({
          text: currentChunk,
          startWord: chunkStartWord,
          endWord: wordIdx - 1
        });
        chunkStartWord = wordIdx;
        currentChunk = word;
      } else {
        currentChunk = testChunk;
      }

      // Also break at natural pauses if chunk is getting long
      if (currentChunk.length > maxChars * 0.6 && /[.!?,;:]$/.test(word)) {
        chunks.push({
          text: currentChunk,
          startWord: chunkStartWord,
          endWord: wordIdx
        });
        chunkStartWord = wordIdx + 1;
        currentChunk = '';
      }

      wordIdx++;
    }

    // Don't forget the last chunk
    if (currentChunk) {
      chunks.push({
        text: currentChunk,
        startWord: chunkStartWord,
        endWord: wordIdx - 1
      });
    }

    return chunks;
  }

  /**
   * Find which chunk contains a word index
   */
  _findChunkForWord(wordIndex) {
    for (let i = this._chunks.length - 1; i >= 0; i--) {
      if (wordIndex >= this._chunks[i].startWord) return i;
    }
    return 0;
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

      // Split text into chunks for CC-style display (sentence/clause boundaries)
      this._chunks = this._splitIntoChunks(text);
      this._currentChunkIndex = 0;

      // Show first chunk immediately
      if (this.onChunkChange && this._chunks.length > 0) {
        this.onChunkChange(this._chunks[0].text, 0, this._chunks.length);
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
      let boundaryFired = false;

      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          boundaryFired = true;
          wordCount++;
          const progress = wordCount / totalWords;

          // Update progress
          if (this.onProgress) {
            this.onProgress(progress);
          }

          // Report character position for StoryDirector
          if (this.onCharPosition && event.charIndex !== undefined) {
            this.onCharPosition(event.charIndex);
          }

          // Update mascot intensity based on speaking (simple pulse effect)
          if (this.mascot && this.mascot.setIntensity) {
            // Gentle pulsing while speaking
            const intensity = 0.6 + Math.sin(wordCount * 0.5) * 0.2;
            this.mascot.setIntensity(intensity);
          }

          // Update chunk display using word count for reliable sync
          // wordCount is 1-indexed (incremented before this), so use wordCount-1 for 0-indexed lookup
          const chunkIdx = this._findChunkForWord(wordCount - 1);
          if (chunkIdx !== this._currentChunkIndex && chunkIdx < this._chunks.length) {
            this._currentChunkIndex = chunkIdx;
            if (this.onChunkChange) {
              this.onChunkChange(
                this._chunks[chunkIdx].text,
                chunkIdx,
                this._chunks.length
              );
            }
          }
        }
      };

      // Fallback: adaptive timing that learns from actual speech rate
      // Only used if boundary events don't fire
      const speechStartTime = Date.now();
      const numChunks = this._chunks.length;
      const totalChars = text.length;

      // Pre-calculate character offsets for each chunk
      let charOffset = 0;
      const chunkOffsets = this._chunks.map(c => {
        const offset = charOffset;
        charOffset += c.text.length;
        return offset;
      });

      // Start fallback after a short delay to see if boundary events fire
      const fallbackStartTimeout = setTimeout(() => {
        if (boundaryFired) return; // Boundary events working, skip fallback

        console.log('Using adaptive chunk timing (no boundary events)');

        // Initial estimate: 17 chars/sec (faster to keep up with speech)
        let charsPerMs = 17 / 1000 * utterance.rate;

        const checkAndAdvance = () => {
          if (!this.isSpeaking || boundaryFired) return;

          const elapsed = Date.now() - speechStartTime;
          const estimatedCharPos = elapsed * charsPerMs;

          // Report estimated character position for StoryDirector
          if (this.onCharPosition) {
            console.log(`[TTS] Reporting char position: ${Math.floor(estimatedCharPos)}`);
            this.onCharPosition(Math.floor(estimatedCharPos));
          }

          // Find which chunk we should be on based on character position
          let targetIdx = 0;
          for (let i = 0; i < numChunks; i++) {
            if (estimatedCharPos >= chunkOffsets[i]) {
              targetIdx = i;
            }
          }

          // Don't advance past second-to-last chunk - let onend show last chunk
          targetIdx = Math.min(targetIdx, numChunks - 2);

          // Update chunk if changed
          if (targetIdx > this._currentChunkIndex) {
            // Recalibrate: we expected to be at chunkOffsets[targetIdx] chars
            // Actual elapsed time tells us real rate
            const expectedChars = chunkOffsets[targetIdx];
            const actualCharsPerMs = expectedChars / elapsed;

            // Blend with current estimate (smooth adaptation)
            charsPerMs = charsPerMs * 0.5 + actualCharsPerMs * 0.5;

            console.log(`Advancing to chunk ${targetIdx}, rate: ${(charsPerMs * 1000).toFixed(1)} chars/sec`);

            this._currentChunkIndex = targetIdx;

            if (this.onChunkChange) {
              this.onChunkChange(
                this._chunks[targetIdx].text,
                targetIdx,
                numChunks
              );
            }
          }

          // Update progress
          if (this.onProgress) {
            const progress = Math.min(estimatedCharPos / totalChars, 0.95);
            this.onProgress(progress);
          }

          // Continue polling
          this._fallbackChunkTimeout = setTimeout(checkAndAdvance, 200);
        };

        // Start polling
        checkAndAdvance();

      }, 300); // Wait 300ms to see if boundary events fire

      // Store for cleanup
      this._fallbackStartTimeout = fallbackStartTimeout;

      // Return a promise that resolves when speech ends
      return new Promise((resolve, reject) => {
        utterance.onend = () => {
          console.log('TTS ended');
          this.isSpeaking = false;
          this.currentUtterance = null;

          // Clear fallback timers
          if (this._fallbackStartTimeout) {
            clearTimeout(this._fallbackStartTimeout);
          }
          if (this._fallbackChunkTimeout) {
            clearTimeout(this._fallbackChunkTimeout);
          }

          // Show the last chunk when speech ends (ensures final text is displayed)
          if (this._chunks && this._chunks.length > 0) {
            const lastIdx = this._chunks.length - 1;
            if (this._currentChunkIndex !== lastIdx && this.onChunkChange) {
              this.onChunkChange(
                this._chunks[lastIdx].text,
                lastIdx,
                this._chunks.length
              );
            }
          }

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

    // Clear fallback timers
    if (this._fallbackStartTimeout) {
      clearTimeout(this._fallbackStartTimeout);
      this._fallbackStartTimeout = null;
    }
    if (this._fallbackChunkTimeout) {
      clearTimeout(this._fallbackChunkTimeout);
      this._fallbackChunkTimeout = null;
    }

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
