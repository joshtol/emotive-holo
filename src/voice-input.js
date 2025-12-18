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
      console.error('Speech recognition error:', event.error, event);
      this.isListening = false;

      // Don't report "no-speech" or "aborted" as errors - these are normal
      if (event.error === 'no-speech') {
        console.log('No speech detected, treating as empty result');
        if (this.onResult) this.onResult('');
      } else if (event.error === 'aborted') {
        console.log('Recognition aborted (user stopped)');
        // Don't call any callbacks - this is expected when user releases hold
      } else {
        // Real errors: not-allowed, service-not-allowed, network, etc.
        console.error('Real speech error, reporting:', event.error);
        if (this.onError) {
          this.onError(event.error);
        }
      }
    };

    recognition.onstart = () => {
      console.log('Recognition actually started (onstart fired)');
    };

    recognition.onaudiostart = () => {
      console.log('Audio capture started');
    };

    recognition.onsoundstart = () => {
      console.log('Sound detected');
    };

    recognition.onspeechstart = () => {
      console.log('Speech detected');
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
    console.log('VoiceInput.start() called, SpeechRecognition available:', !!this.SpeechRecognition);

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
      if (!this.recognition) {
        console.error('Failed to create recognition instance');
        if (this.onError) this.onError('not-supported');
        return;
      }
      this.isListening = true;
      console.log('Calling recognition.start()...');
      this.recognition.start();
      console.log('Listening started successfully');
    } catch (error) {
      console.error('Failed to start recognition:', error);
      this.isListening = false;
      this.recognition = null;
      if (this.onError) this.onError(error.message || 'start-failed');
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
