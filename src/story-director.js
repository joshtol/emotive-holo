/**
 * Story Director Module
 * Parses inline directives from story text and triggers mascot changes
 * synchronized with TTS playback
 *
 * Directive format: [TYPE:value] or [TYPE:value,modifier]
 * Examples:
 *   [FEEL:joy,bounce] - set emotion to joy with bounce gesture
 *   [MORPH:star] - morph to star shape
 *   [CHAIN:burst] - play burst gesture chain
 *   [PRESET:emerald] - change to emerald SSS preset (via setSSSPreset)
 *   [UNDERTONE:nervous] - add emotional undertone (via updateUndertone)
 *   [PHASE:full] - set moon phase (new, waxing-crescent, first-quarter, etc.)
 *   [SUNECLIPSE:annular] - set sun eclipse (off, annular, total)
 *   [MOONECLIPSE:total] - set moon eclipse/blood moon (off, partial, total)
 */

export class StoryDirector {
  // Valid values for validation - MUST match what the engine supports
  static VALID_GEOMETRIES = ['crystal', 'moon', 'sun', 'heart', 'star', 'rough'];
  static VALID_EMOTIONS = ['neutral', 'joy', 'calm', 'love', 'excited', 'euphoria', 'sadness', 'anger', 'fear', 'surprise', 'disgust', 'focused', 'suspicion', 'resting', 'glitch'];
  static VALID_PRESETS = ['quartz', 'emerald', 'ruby', 'sapphire', 'amethyst', 'citrine'];
  static VALID_UNDERTONES = ['nervous', 'confident', 'sarcastic', 'hesitant', 'calm', 'clear'];
  static VALID_CHAINS = ['rise', 'flow', 'burst', 'drift', 'chaos', 'morph', 'rhythm', 'spiral', 'routine', 'radiance', 'twinkle', 'stream'];

  // Celestial features
  static VALID_MOON_PHASES = ['new', 'waxing-crescent', 'first-quarter', 'waxing-gibbous', 'full', 'waning-gibbous', 'last-quarter', 'waning-crescent'];
  static VALID_SUN_ECLIPSE = ['off', 'annular', 'total'];
  static VALID_MOON_ECLIPSE = ['off', 'partial', 'total'];

  // Auto-correction mappings for common LLM mistakes
  static EMOTION_CORRECTIONS = {
    'wonder': 'surprise',
    'awe': 'euphoria',
    'curious': 'focused',
    'curiosity': 'focused',
    'excitement': 'excited',
    'compassion': 'love',
    'compassionate': 'love',
    'thoughtful': 'focused',
    'contemplative': 'calm',
    'anxious': 'fear',
    'happy': 'joy',
    'sad': 'sadness',
    'angry': 'anger',
    'scared': 'fear',
    'disgusted': 'disgust',
    'amazed': 'euphoria',
    'amazement': 'euphoria',
    'peaceful': 'calm',
    'content': 'calm',
    'serene': 'calm',
    'nervous': 'fear',  // nervous is an undertone, not emotion
    'confident': 'focused',  // confident is an undertone, not emotion
  };

  static UNDERTONE_CORRECTIONS = {
    'thoughtful': 'hesitant',
    'contemplative': 'calm',
    'curious': 'hesitant',
    'wondering': 'hesitant',
    'peaceful': 'calm',
    'anxious': 'nervous',
    'worried': 'nervous',
    'bold': 'confident',
    'unsure': 'hesitant',
  };

  static CHAIN_CORRECTIONS = {
    'discovery': 'radiance',
    'wonder': 'twinkle',
    'excitement': 'burst',
    'energy': 'chaos',
    'calm': 'drift',
    'peace': 'flow',
    'magic': 'radiance',
    'sparkle': 'twinkle',
    'glow': 'radiance',
    'dance': 'rhythm',
    'spin': 'spiral',
  };

  static GEOMETRY_CORRECTIONS = {
    'sphere': 'crystal',
    'diamond': 'crystal',
    'orb': 'crystal',
    'gem': 'crystal',
    'gemstone': 'crystal',
    'crescent': 'moon',
    'lunar': 'moon',
    'solar': 'sun',
    'love': 'heart',
    'starlight': 'star',
  };

  // Celestial corrections
  static MOON_PHASE_CORRECTIONS = {
    'crescent': 'waxing-crescent',
    'half': 'first-quarter',
    'gibbous': 'waxing-gibbous',
    'quarter': 'first-quarter',
  };

  static SUN_ECLIPSE_CORRECTIONS = {
    'eclipse': 'total',
    'ring': 'annular',
    'solar-eclipse': 'total',
    'none': 'off',
    'normal': 'off',
  };

  static MOON_ECLIPSE_CORRECTIONS = {
    'blood': 'total',
    'blood-moon': 'total',
    'bloodmoon': 'total',
    'lunar-eclipse': 'total',
    'eclipse': 'total',
    'none': 'off',
    'normal': 'off',
  };

  constructor(mascot) {
    this.mascot = mascot;

    // Parsed directives with their character positions
    this._directives = [];  // { charIndex, type, value, modifier? }[]

    // Clean text (directives stripped)
    this._cleanText = '';

    // Tracking playback
    this._lastTriggeredIndex = -1;

    // Directive regex - matches [TYPE:value] or [TYPE:value,modifier]
    this._directivePattern = /\[([A-Z]+):([^\],]+)(?:,([^\]]+))?\]/g;
  }

  /**
   * Parse text and extract inline directives
   * Returns clean text with directives stripped
   * @param {string} rawText - Text with inline directives
   * @returns {string} Clean text for TTS
   */
  parse(rawText) {
    this._directives = [];
    this._lastTriggeredIndex = -1;

    // Track character offset as we strip directives
    let cleanText = '';
    let lastIndex = 0;
    let match;

    // Reset regex
    this._directivePattern.lastIndex = 0;

    while ((match = this._directivePattern.exec(rawText)) !== null) {
      const [fullMatch, type, value, modifier] = match;
      const matchStart = match.index;

      // Add text before this directive to clean text
      cleanText += rawText.slice(lastIndex, matchStart);

      // Record directive with its position in clean text
      this._directives.push({
        charIndex: cleanText.length,  // Position in clean text
        type: type.toUpperCase(),
        value: value.trim(),
        modifier: modifier?.trim() || null
      });

      lastIndex = matchStart + fullMatch.length;
    }

    // Add remaining text
    cleanText += rawText.slice(lastIndex);

    this._cleanText = cleanText;

    if (this._directives.length > 0) {
      console.log(`[StoryDirector] Parsed ${this._directives.length} directives:`,
        this._directives.map(d => `${d.type}:${d.value}${d.modifier ? ',' + d.modifier : ''} @${d.charIndex}`));
    }

    return cleanText;
  }

  /**
   * Get the clean text (directives stripped)
   */
  getCleanText() {
    return this._cleanText;
  }

  /**
   * Check if there are any directives to process
   */
  hasDirectives() {
    return this._directives.length > 0;
  }

  /**
   * Update playback position and trigger any directives we've passed
   * Call this as TTS progresses through the text
   * @param {number} charPosition - Current character position in clean text
   */
  updateProgress(charPosition) {
    if (!this.mascot || this._directives.length === 0) return;

    // Find directives that should trigger at or before current position
    for (let i = this._lastTriggeredIndex + 1; i < this._directives.length; i++) {
      const directive = this._directives[i];

      if (directive.charIndex <= charPosition) {
        this._triggerDirective(directive);
        this._lastTriggeredIndex = i;
      } else {
        // Directives are sorted by position, so we can stop here
        break;
      }
    }
  }

  /**
   * Auto-correct a value using the correction map, or return original if valid/unknown
   * @param {string} value - The value to correct
   * @param {string[]} validList - List of valid values
   * @param {Object} corrections - Map of invalid → valid corrections
   * @returns {{ corrected: string, wasFixed: boolean }}
   */
  _autoCorrect(value, validList, corrections) {
    const lower = value.toLowerCase();

    // Already valid
    if (validList.includes(lower)) {
      return { corrected: lower, wasFixed: false };
    }

    // Check corrections map
    if (corrections[lower]) {
      return { corrected: corrections[lower], wasFixed: true };
    }

    // Unknown - return as-is (will fail validation)
    return { corrected: lower, wasFixed: false };
  }

  /**
   * Trigger a directive on the mascot
   * @param {object} directive - { type, value, modifier? }
   */
  _triggerDirective(directive) {
    const { type, value, modifier } = directive;

    console.log(`[StoryDirector] Triggering: ${type}:${value}${modifier ? ',' + modifier : ''}`);

    switch (type) {
      case 'FEEL': {
        // value = emotion, modifier = gesture
        // Auto-correct emotion
        const { corrected: emotion, wasFixed } = this._autoCorrect(
          value,
          StoryDirector.VALID_EMOTIONS,
          StoryDirector.EMOTION_CORRECTIONS
        );

        if (wasFixed) {
          console.log(`[StoryDirector] Auto-corrected emotion "${value}" → "${emotion}"`);
        }

        // Validate emotion
        if (!StoryDirector.VALID_EMOTIONS.includes(emotion)) {
          console.warn(`[StoryDirector] Invalid emotion "${value}" (no correction available) - valid: ${StoryDirector.VALID_EMOTIONS.join(', ')}`);
          return;
        }

        if (this.mascot.feel) {
          const feelStr = modifier ? `${emotion}, ${modifier}` : emotion;
          this.mascot.feel(feelStr);
        }
        break;
      }

      case 'MORPH': {
        // Auto-correct geometry
        const { corrected: geometry, wasFixed } = this._autoCorrect(
          value,
          StoryDirector.VALID_GEOMETRIES,
          StoryDirector.GEOMETRY_CORRECTIONS
        );

        if (wasFixed) {
          console.log(`[StoryDirector] Auto-corrected geometry "${value}" → "${geometry}"`);
        }

        if (!StoryDirector.VALID_GEOMETRIES.includes(geometry)) {
          console.warn(`[StoryDirector] Invalid geometry "${value}" (no correction available) - valid: ${StoryDirector.VALID_GEOMETRIES.join(', ')}`);
          return;
        }

        if (this.mascot.morphTo) {
          this.mascot.morphTo(geometry);
        }
        break;
      }

      case 'CHAIN': {
        // Auto-correct chain
        const { corrected: chain, wasFixed } = this._autoCorrect(
          value,
          StoryDirector.VALID_CHAINS,
          StoryDirector.CHAIN_CORRECTIONS
        );

        if (wasFixed) {
          console.log(`[StoryDirector] Auto-corrected chain "${value}" → "${chain}"`);
        }

        if (!StoryDirector.VALID_CHAINS.includes(chain)) {
          console.warn(`[StoryDirector] Invalid chain "${value}" (no correction available) - valid: ${StoryDirector.VALID_CHAINS.join(', ')}`);
          return;
        }

        if (this.mascot.playChain) {
          this.mascot.playChain(chain);
        }
        break;
      }

      case 'PRESET': {
        // No corrections for presets - they're simple gem names
        const preset = value.toLowerCase();
        if (!StoryDirector.VALID_PRESETS.includes(preset)) {
          console.warn(`[StoryDirector] Invalid preset "${value}" - valid: ${StoryDirector.VALID_PRESETS.join(', ')}`);
          return;
        }
        if (this.mascot.setSSSPreset) {
          this.mascot.setSSSPreset(preset);
        }
        break;
      }

      case 'TOGGLE':
        // value = feature, modifier = on/off
        if (this.mascot.toggle) {
          const isOn = modifier?.toLowerCase() !== 'off';
          this.mascot.toggle(value, isOn);
        }
        break;

      case 'UNDERTONE': {
        // Auto-correct undertone
        const { corrected: undertone, wasFixed } = this._autoCorrect(
          value,
          StoryDirector.VALID_UNDERTONES,
          StoryDirector.UNDERTONE_CORRECTIONS
        );

        if (wasFixed) {
          console.log(`[StoryDirector] Auto-corrected undertone "${value}" → "${undertone}"`);
        }

        if (!StoryDirector.VALID_UNDERTONES.includes(undertone)) {
          console.warn(`[StoryDirector] Invalid undertone "${value}" (no correction available) - valid: ${StoryDirector.VALID_UNDERTONES.join(', ')}`);
          return;
        }

        if (this.mascot.updateUndertone) {
          this.mascot.updateUndertone(undertone);
        }
        break;
      }

      case 'PHASE': {
        // Moon phase - auto-correct
        const { corrected: phase, wasFixed } = this._autoCorrect(
          value,
          StoryDirector.VALID_MOON_PHASES,
          StoryDirector.MOON_PHASE_CORRECTIONS
        );

        if (wasFixed) {
          console.log(`[StoryDirector] Auto-corrected moon phase "${value}" → "${phase}"`);
        }

        if (!StoryDirector.VALID_MOON_PHASES.includes(phase)) {
          console.warn(`[StoryDirector] Invalid moon phase "${value}" (no correction available) - valid: ${StoryDirector.VALID_MOON_PHASES.join(', ')}`);
          return;
        }

        // Use core3D API to set moon phase
        if (this.mascot.core3D?.setMoonPhase) {
          this.mascot.core3D.setMoonPhase(phase);
        }
        break;
      }

      case 'SUNECLIPSE': {
        // Solar eclipse - auto-correct
        const { corrected: eclipseType, wasFixed } = this._autoCorrect(
          value,
          StoryDirector.VALID_SUN_ECLIPSE,
          StoryDirector.SUN_ECLIPSE_CORRECTIONS
        );

        if (wasFixed) {
          console.log(`[StoryDirector] Auto-corrected sun eclipse "${value}" → "${eclipseType}"`);
        }

        if (!StoryDirector.VALID_SUN_ECLIPSE.includes(eclipseType)) {
          console.warn(`[StoryDirector] Invalid sun eclipse "${value}" (no correction available) - valid: ${StoryDirector.VALID_SUN_ECLIPSE.join(', ')}`);
          return;
        }

        // Use core3D API to set sun shadow/eclipse
        if (this.mascot.core3D?.setSunShadow) {
          this.mascot.core3D.setSunShadow(eclipseType);
        }
        break;
      }

      case 'MOONECLIPSE': {
        // Lunar eclipse (blood moon) - auto-correct
        const { corrected: eclipseType, wasFixed } = this._autoCorrect(
          value,
          StoryDirector.VALID_MOON_ECLIPSE,
          StoryDirector.MOON_ECLIPSE_CORRECTIONS
        );

        if (wasFixed) {
          console.log(`[StoryDirector] Auto-corrected moon eclipse "${value}" → "${eclipseType}"`);
        }

        if (!StoryDirector.VALID_MOON_ECLIPSE.includes(eclipseType)) {
          console.warn(`[StoryDirector] Invalid moon eclipse "${value}" (no correction available) - valid: ${StoryDirector.VALID_MOON_ECLIPSE.join(', ')}`);
          return;
        }

        // Use core3D API to set moon eclipse
        if (this.mascot.core3D?.setMoonEclipse) {
          this.mascot.core3D.setMoonEclipse(eclipseType);
        }
        break;
      }

      default:
        console.warn(`[StoryDirector] Unknown directive type: ${type}`);
    }
  }

  /**
   * Force trigger all remaining directives (e.g., when speech ends early)
   */
  triggerRemaining() {
    for (let i = this._lastTriggeredIndex + 1; i < this._directives.length; i++) {
      this._triggerDirective(this._directives[i]);
      this._lastTriggeredIndex = i;
    }
  }

  /**
   * Reset state for new story
   */
  reset() {
    this._directives = [];
    this._cleanText = '';
    this._lastTriggeredIndex = -1;
  }

  /**
   * Get progress through directives (0-1)
   */
  getDirectiveProgress() {
    if (this._directives.length === 0) return 1;
    return (this._lastTriggeredIndex + 1) / this._directives.length;
  }
}

export default StoryDirector;
