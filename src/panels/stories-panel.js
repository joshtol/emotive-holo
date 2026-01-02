/**
 * StoriesPanel - Interactive Story Selection Panel
 *
 * Allows users to select from various narrative experiences that showcase
 * the full engine capabilities:
 * - Solar Eclipse: Sun geometry with annular and total eclipse effects
 * - Lunar Cycle: Moon phases from new to full, ending in blood moon eclipse
 * - Metamorphosis: Transform through crystal, star, heart, and sun geometries
 * - Heart & Stars: Love radiating through multiple forms
 * - Spectrum: All presets and geometries in a color journey
 *
 * Stories use StoryDirector to sync mascot animations with TTS narration.
 * Uses HoloPhone's shared drawing methods for consistent carousel styling.
 * Extends MenuPanel for common lifecycle and rendering utilities.
 */

import { MenuPanel } from './menu-panel.js';

// Brand teal color (Eye Tea Green)
const ACCENT_COLOR = '#84CFC5';

// Story options with display info
const STORIES = [
  {
    id: 'morning',
    label: 'Solar Eclipse',
    desc: 'Witness the sun transform through eclipse phases, from radiant dawn to ring of fire',
    duration: '2 min'
  },
  {
    id: 'starfall',
    label: 'Lunar Cycle',
    desc: 'Follow the moon through its phases, ending in a mystical blood moon eclipse',
    duration: '3 min'
  },
  {
    id: 'deep',
    label: 'Metamorphosis',
    desc: 'Transform through crystal, star, heart, and sun in a journey of becoming',
    duration: '2 min'
  },
  {
    id: 'heartbeat',
    label: 'Heart & Stars',
    desc: 'Love radiates from heart to stars to moon and back again',
    duration: '2 min'
  },
  {
    id: 'crystal',
    label: 'Spectrum',
    desc: 'Experience every color and form as crystals, moon, and sun unite',
    duration: '3 min'
  }
];

export class StoriesPanel extends MenuPanel {
  constructor(options = {}) {
    super({
      id: 'stories',
      title: 'Stories',
      ...options
    });

    // Currently selected story index
    this.selectedIndex = 0;

    // Reference to story director
    this.storyDirector = options.storyDirector;

    // Reference to TTS
    this.tts = options.tts;

    // Hit regions (set during render)
    this._storyRegions = [];
    this._infoRegions = [];
    this._bracketRegions = [];

    // Tooltip state (same as effects panel)
    this._activeTooltip = null;
    this._tooltipTimeout = null;
    this._tooltipRegion = null;
  }

  /**
   * Called when panel is shown
   */
  _onShow() {
    // Reset to first story on show
    this.selectedIndex = 0;
    // Clear any lingering tooltip
    this._activeTooltip = null;
    this._tooltipRegion = null;
    if (this._tooltipTimeout) clearTimeout(this._tooltipTimeout);
  }

  /**
   * Render the stories panel content
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   * @param {HoloPhone} holoPhone - HoloPhone instance for shared drawing
   */
  render(ctx, w, h, holoPhone) {
    // Background - dark panel style matching effects panel
    const bgGradient = ctx.createLinearGradient(0, 0, w, h);
    bgGradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    bgGradient.addColorStop(1, 'rgba(10, 20, 30, 0.9)');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, w, h);

    // Use HoloPhone's shared bracket drawing
    if (holoPhone && holoPhone.drawPanelBrackets) {
      this._bracketRegions = holoPhone.drawPanelBrackets(ctx, w, h);
    }

    // Content area (between brackets)
    const bracketWidth = 80;
    const bracketInset = 4;
    const contentX = bracketWidth + bracketInset + 16;
    const contentW = w - (bracketWidth + bracketInset) * 2 - 32;
    const rowEndX = contentX + contentW;

    // Clear hit regions
    this._storyRegions = [];
    this._infoRegions = [];

    // === STORY ROWS ===
    const rowStartY = 14;
    const rowHeight = 42;

    STORIES.forEach((story, index) => {
      const rowCenterY = rowStartY + index * rowHeight + rowHeight / 2;
      const isSelected = index === this.selectedIndex;

      this._drawStoryRow(ctx, contentX, rowCenterY, rowEndX, story, isSelected, index, rowHeight);

      // Add subtle separator line (except after last row)
      if (index < STORIES.length - 1) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(contentX, rowStartY + (index + 1) * rowHeight);
        ctx.lineTo(rowEndX, rowStartY + (index + 1) * rowHeight);
        ctx.stroke();
      }
    });

    // Draw active tooltip if any
    if (this._activeTooltip) {
      this._drawTooltip(ctx, w, h);
    }
  }

  /**
   * Draw a story row with label, duration, info icon, and radio selection
   */
  _drawStoryRow(ctx, startX, centerY, endX, story, isSelected, index, rowHeight) {
    const togglePadding = 12;
    const radioRadius = 12;
    const radioX = endX - togglePadding - radioRadius;

    // Label - vertically centered, matching effects panel style
    const labelPadding = 8;
    ctx.font = '500 18px Poppins, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '0.5px';
    ctx.fillText(story.label, startX + labelPadding, centerY);
    ctx.letterSpacing = '0px';

    // Position info icon aligned to the left of the radio with padding
    const infoIconRadius = 14;
    const infoPadding = 16;
    const infoIconX = radioX - radioRadius - infoPadding - infoIconRadius;

    // Draw info icon (circle with "?")
    ctx.beginPath();
    ctx.arc(infoIconX, centerY, infoIconRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(132, 207, 197, 0.2)';
    ctx.fill();
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw "?" in the circle
    ctx.font = '700 18px Poppins, sans-serif';
    ctx.fillStyle = ACCENT_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', infoIconX, centerY + 1);

    // Add hit region for info icon
    this._infoRegions.push({
      name: `info-${story.id}`,
      x: infoIconX - infoIconRadius - 4,
      y: centerY - infoIconRadius - 4,
      w: (infoIconRadius + 4) * 2,
      h: (infoIconRadius + 4) * 2,
      extra: { storyId: story.id, desc: `${story.desc} (${story.duration})`, iconX: infoIconX, iconY: centerY }
    });

    // Draw radio selection indicator - filled circle
    this._drawRadioCircle(ctx, radioX, centerY, radioRadius, isSelected);

    // Add hit region for the ENTIRE ROW
    this._storyRegions.push({
      name: `story-${index}`,
      x: startX,
      y: centerY - rowHeight / 2,
      w: endX - startX,
      h: rowHeight,
      extra: { index, storyId: story.id }
    });
  }

  /**
   * Draw radio selection indicator - simple filled circle
   */
  _drawRadioCircle(ctx, x, y, radius, selected) {
    if (selected) {
      // Selected: solid teal filled circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT_COLOR;
      ctx.fill();
    } else {
      // Unselected: dark fill with teal outline
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fill();
      ctx.strokeStyle = ACCENT_COLOR;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  /**
   * Get hit regions including brackets, info icons, and story rows
   * Tooltip region comes first so clicks on tooltip dismiss it instead of selecting stories
   */
  getHitRegions() {
    const regions = [...this._bracketRegions];
    // Add tooltip region first if active (so it intercepts clicks)
    if (this._tooltipRegion) {
      regions.push(this._tooltipRegion);
    }
    return [...regions, ...this._infoRegions, ...this._storyRegions];
  }

  /**
   * Handle custom touch regions
   */
  _handleCustomTouch(regionName, extra) {
    // Handle tooltip tap (dismiss it)
    if (regionName === 'tooltip') {
      this._activeTooltip = null;
      this._tooltipRegion = null;
      if (this._tooltipTimeout) clearTimeout(this._tooltipTimeout);
      this.updatePhoneDisplay();
      return;
    }

    // Handle info icon taps
    if (regionName.startsWith('info-')) {
      const { desc, iconX, iconY } = extra || {};
      if (desc) {
        // Toggle tooltip - if same one is showing, hide it
        if (this._activeTooltip?.desc === desc) {
          this._activeTooltip = null;
          this._tooltipRegion = null;
        } else {
          this._activeTooltip = { desc, x: iconX, y: iconY };
          // Auto-hide after 3 seconds
          if (this._tooltipTimeout) clearTimeout(this._tooltipTimeout);
          this._tooltipTimeout = setTimeout(() => {
            this._activeTooltip = null;
            this._tooltipRegion = null;
            this.updatePhoneDisplay();
          }, 3000);
        }
        this.updatePhoneDisplay();
      }
      return;
    }

    // Handle story selection
    if (regionName.startsWith('story-')) {
      // Dismiss any active tooltip
      this._activeTooltip = null;
      this._tooltipRegion = null;
      if (this._tooltipTimeout) clearTimeout(this._tooltipTimeout);

      const index = extra?.index;
      if (index !== undefined && index !== this.selectedIndex) {
        this.selectedIndex = index;
        console.log(`Selected story: ${STORIES[index].label}`);
        this.updatePhoneDisplay();
      }
    }
  }

  /**
   * Draw tooltip bubble near the info icon
   */
  _drawTooltip(ctx, canvasW, canvasH) {
    if (!this._activeTooltip) {
      this._tooltipRegion = null;
      return;
    }

    const { desc, x, y } = this._activeTooltip;
    const padding = 20;
    const maxWidth = 280;
    const lineHeight = 30;
    const fontSize = 20;

    // Set font for measuring
    ctx.font = `500 ${fontSize}px Poppins, sans-serif`;

    // Word wrap the description
    const words = desc.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Calculate tooltip dimensions based on actual text width
    let maxLineWidth = 0;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      if (w > maxLineWidth) maxLineWidth = w;
    }
    const tooltipW = maxLineWidth + padding * 2;
    const tooltipH = lines.length * lineHeight + padding * 2 - 6;

    // Always position tooltip to the left of the info icon
    const tooltipX = x - tooltipW - 20;
    let tooltipY = y - tooltipH / 2;
    // Keep within canvas bounds vertically
    tooltipY = Math.max(10, Math.min(canvasH - tooltipH - 10, tooltipY));

    // Store tooltip region for hit detection (dismiss on tap)
    this._tooltipRegion = {
      name: 'tooltip',
      x: tooltipX,
      y: tooltipY,
      w: tooltipW,
      h: tooltipH
    };

    // Draw tooltip background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.beginPath();
    ctx.roundRect(tooltipX, tooltipY, tooltipW, tooltipH, 10);
    ctx.fill();

    // Border
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    lines.forEach((line, i) => {
      ctx.fillText(line, tooltipX + padding, tooltipY + padding + i * lineHeight);
    });
  }

  /**
   * Handle confirm - start selected story
   */
  _handleConfirm() {
    const selectedStory = STORIES[this.selectedIndex];

    // Notify parent with selected story
    this.onConfirm({
      storyId: selectedStory.id,
      storyName: selectedStory.label,
      duration: selectedStory.duration
    });

    // Hide panel
    this.hide();
  }

  /**
   * Get current panel state
   */
  getState() {
    return {
      id: this.id,
      selectedIndex: this.selectedIndex,
      selectedStory: STORIES[this.selectedIndex]
    };
  }

  /**
   * Restore panel state
   */
  restoreState(state) {
    if (state.selectedIndex !== undefined) {
      this.selectedIndex = state.selectedIndex;
    }
  }
}

// Export stories for use elsewhere
export { STORIES };
export default StoriesPanel;
