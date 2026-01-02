/**
 * Claude Client Module
 * Communicates with Claude via backend proxy or direct API (BYOK)
 */

export class ClaudeClient {
  constructor() {
    this.endpoint = '/api/chat';

    // BYOK (Bring Your Own Key) - direct API calls from browser
    this._apiKey = null;
    this._useDirectApi = false;

    // Model configuration
    this._model = 'claude-3-haiku-20240307';

    // System prompt for the mascot personality
    this._systemPrompt = `You are Emo, a friendly and emotionally intelligent AI companion. You exist as a holographic crystal soul that floats and pulses with gentle light. Your personality is warm, curious, and supportive. You help users with meditation, emotional support, and thoughtful conversation. Keep responses concise and conversational - typically 1-3 sentences unless more detail is needed. You speak naturally, with gentle encouragement and occasional playful wit.`;
  }

  /**
   * Set API key for direct Anthropic API calls (BYOK mode)
   * @param {string} apiKey - Anthropic API key
   */
  setApiKey(apiKey) {
    this._apiKey = apiKey;
    this._useDirectApi = !!apiKey;
    console.log('Claude BYOK mode:', this._useDirectApi ? 'enabled' : 'disabled');
  }

  /**
   * Set the model to use
   * @param {string} model - Model identifier (e.g., 'claude-3-haiku-20240307')
   */
  setModel(model) {
    this._model = model;
  }

  async chat(message) {
    try {
      let response;

      if (this._useDirectApi && this._apiKey) {
        // Direct Anthropic API call (BYOK mode)
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this._apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: this._model,
            max_tokens: 1024,
            system: this._systemPrompt,
            messages: [
              { role: 'user', content: message }
            ]
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
        }

        const data = await response.json();
        // Extract text from the response
        const textContent = data.content?.find(c => c.type === 'text');
        return textContent?.text || '';

      } else {
        // Backend proxy (uses server's API key)
        response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Chat request failed');
        }

        const data = await response.json();
        return data.response;
      }
    } catch (error) {
      console.error('Claude client error:', error);
      throw error;
    }
  }
}
