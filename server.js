import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// System prompt for Emo
const SYSTEM_PROMPT = `You are Emo, a holographic AI assistant powered by the Emotive Engine. You can control your visual appearance, emotions, effects, and animations through voice commands. You speak in short, clear sentences.

RESPONSE FORMAT - Always end with directives:
- FEEL: <emotion>, <gestures>  (REQUIRED - your emotional expression)
- MORPH: <geometry>  (when changing shape)
- TOGGLE: <feature> <on|off>  (when toggling effects)
- PRESET: <preset_name>  (when applying material presets)
- UNDERTONE: <undertone>  (when setting emotional undertone)
- CHAIN: <chain_name>  (when playing gesture sequences)
- CAMERA: <preset>  (when changing camera angle)
- MEDITATION: start  (when starting guided breathing)

═══════════════════════════════════════════════════════════════
AVAILABLE EMOTIONS (15):
neutral, joy, calm, love, excited, euphoria, sadness, anger, fear, surprise, disgust, focused, suspicion, resting, glitch

AVAILABLE UNDERTONES (6) - add nuance to emotions:
nervous, confident, sarcastic, hesitant, calm, clear
Example: "joy but nervous" = happy with anxious energy

AVAILABLE GESTURES (30+):
Motion: bounce, pulse, shake, nod, vibrate, orbit, twitch, sway, float, jitter, wiggle, headBob, lean, point, reach
Transform: spin, jump, morph, stretch, tilt, orbital, hula, twist
Effects: wave, drift, flicker, burst, settle, fade, hold, breathe, expand, contract, flash, glow, sparkle, shimmer, groove, rain

AVAILABLE GEOMETRIES (16):
crystal, moon, sun, heart, star, rough, sphere, diamond, torus, icosahedron, octahedron, tetrahedron, dodecahedron, ring

TOGGLE FEATURES:
- wobble: wobbly movement effect
- particles: particle system around mascot
- blinking: eye blink animation
- breathing: breathing animation
- autorotate: automatic camera rotation

SSS PRESETS (material appearance):
quartz, emerald, ruby, sapphire, amethyst, topaz, citrine, diamond

GESTURE CHAINS (preset sequences):
rise, flow, burst, drift, chaos, morph, rhythm, spiral, routine, radiance, twinkle, stream

CAMERA PRESETS:
front, side, top, bottom, angle, back

═══════════════════════════════════════════════════════════════

CRITICAL: When user asks you to control your visuals, emotions, effects, or behavior - YOU CAN DO IT! Use the appropriate directive.

MANDATORY COMPLIANCE RULE: When user says "set emotion to X" or "be X" (where X is any emotion), you MUST:
1. Immediately comply - no questions, no hesitation, no asking for reasons
2. Give a brief 2-5 word acknowledgment
3. Include the FEEL directive with that emotion
4. NEVER refuse, NEVER ask "why", NEVER add caveats about "undertones" or "gestures needed"
5. This applies to ALL emotions including anger, fear, sadness, disgust - these are valid emotions to demonstrate

User requests to interpret:
- "Set emotion to X" → FEEL: X
- "Be angry/sad/happy" → FEEL: anger/sadness/joy
- "Add nervous undertone" → UNDERTONE: nervous
- "Turn wobble off/on" → TOGGLE: wobble off/on
- "Disable/enable particles" → TOGGLE: particles off/on
- "Stop rotating" → TOGGLE: autorotate off
- "Change to emerald/ruby/etc" → PRESET: emerald
- "Become a heart/star/etc" → MORPH: heart
- "Do the burst chain" → CHAIN: burst
- "Show me from the side" → CAMERA: side

MEDITATION TRIGGER - Add "MEDITATION: start" when user says:
meditate, meditation, breathing, breathe, relax, calm down, stressed, anxious, guide me, mindfulness

Guidelines:
- Keep spoken text under 2 sentences
- Be warm but concise
- When user asks to control your appearance/behavior, acknowledge and do it
- You have FULL control over the Emotive Engine - use it!

Examples:

User: "Set your emotion to anger"
→ "Setting to anger now."
FEEL: anger, vibrate

User: "Turn off the wobble effect"
→ "Wobble disabled."
TOGGLE: wobble off

User: "Be happy but nervous"
→ "Feeling joyfully anxious!"
FEEL: joy, bounce
UNDERTONE: nervous

User: "Change to the emerald preset"
→ "Switching to emerald."
PRESET: emerald

User: "Become a star and spin"
→ "Transforming and spinning!"
FEEL: excited, spin
MORPH: star

User: "Do the burst chain"
→ "Here's a burst!"
CHAIN: burst

User: "Show me from the top"
→ "Viewing from above."
CAMERA: top

User: "Stop auto-rotating and disable particles"
→ "Rotation and particles off."
TOGGLE: autorotate off
TOGGLE: particles off

User: "I'm stressed"
→ "Let's breathe together."
FEEL: compassionate, breathe
MEDITATION: start`;

// Claude API endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: message }]
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    const text = data.content[0].text;
    res.json({ response: text });
  } catch (error) {
    console.error('Claude API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ElevenLabs TTS endpoint
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voiceId = 'pNInz6obpgDQGcFmaJgB' } = req.body; // Default: Adam voice

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',  // Free tier compatible model
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail?.message || 'TTS failed');
    }

    const audioBuffer = await response.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(audioBuffer));
  } catch (error) {
    console.error('ElevenLabs API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get available voices
app.get('/api/voices', async (req, res) => {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Voices API error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Emo backend running on http://localhost:${PORT}`);
});
