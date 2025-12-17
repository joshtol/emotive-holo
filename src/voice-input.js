/**
 * Voice Input Module
 * Uses Web Speech API for speech recognition
 */

export class VoiceInput {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.onResult = null;
    this.onError = null;
    this.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!this.SpeechRecognition) {
      console.error('Speech recognition not supported in this browser');
    }
  }

  _createRecognition() {
    if (!this.SpeechRecognition) return null;

    const recognition = new this.SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      console.log('Recognized:', transcript);
      this.isListening = false;

      if (this.onResult) {
        this.onResult(transcript);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      this.isListening = false;

      // Don't report "no-speech" or "aborted" as errors
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        if (this.onError) {
          this.onError(event.error);
        }
      } else if (event.error === 'no-speech' && this.onResult) {
        // Treat no-speech as empty result
        this.onResult('');
      }
    };

    recognition.onend = () => {
      console.log('Recognition ended');
      this.isListening = false;
      // Clear reference so next start creates fresh instance
      this.recognition = null;
    };

    return recognition;
  }

  start() {
    if (!this.SpeechRecognition) {
      console.error('Speech recognition not available');
      if (this.onError) this.onError('not-supported');
      return;
    }

    if (this.isListening) {
      console.log('Already listening, ignoring start()');
      return;
    }

    try {
      // Create fresh recognition instance each time (fixes mobile issues)
      this.recognition = this._createRecognition();
      this.isListening = true;
      this.recognition.start();
      console.log('Listening started');
    } catch (error) {
      console.error('Failed to start recognition:', error);
      this.isListening = false;
      this.recognition = null;
      if (this.onError) this.onError(error.message);
    }
  }

  stop() {
    if (!this.recognition || !this.isListening) {
      console.log('Not listening, ignoring stop()');
      return;
    }

    try {
      this.recognition.stop();
      console.log('Listening stopped');
    } catch (error) {
      console.error('Failed to stop recognition:', error);
      this.isListening = false;
      this.recognition = null;
    }
  }

  isSupported() {
    return !!this.SpeechRecognition;
  }
}
