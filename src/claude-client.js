/**
 * Claude Client Module
 * Communicates with Claude Haiku via backend proxy
 */

export class ClaudeClient {
  constructor() {
    this.endpoint = '/api/chat';
  }

  async chat(message) {
    try {
      const response = await fetch(this.endpoint, {
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
    } catch (error) {
      console.error('Claude client error:', error);
      throw error;
    }
  }
}
