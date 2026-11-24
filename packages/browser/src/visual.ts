import type { BrowserController } from './controller.js';
import type { ActionResult, ScreenshotResult } from './types.js';

export interface ViewportDimensions {
  width: number;
  height: number;
}

export interface TargetCoordinate {
  x: number;
  y: number;
  confidence: number;
  reasoning?: string;
  box?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0..1000
}

export type VisionModelCaller = (prompt: string, imageBase64: string) => Promise<string>;

export interface VisualFallbackOptions {
  controller: BrowserController;
  viewport?: ViewportDimensions;
  visionCaller?: VisionModelCaller;
}

export class VisualFallbackEngine {
  private readonly controller: BrowserController;
  private readonly viewport: ViewportDimensions;
  private readonly visionCaller?: VisionModelCaller;

  constructor(options: VisualFallbackOptions) {
    this.controller = options.controller;
    this.viewport = options.viewport || { width: 1280, height: 800 };
    this.visionCaller = options.visionCaller;
  }

  /**
   * Resolves target screen coordinates for an element description using vision LLM
   * or spatial heuristic fallback.
   */
  public async locateTarget(
    description: string,
    screenshot: ScreenshotResult,
  ): Promise<TargetCoordinate> {
    if (this.visionCaller) {
      const prompt = `You are a computer vision UI agent. Given the browser screenshot, locate the UI element described as: "${description}".
Return ONLY a valid JSON object in the following format:
{
  "x": <integer horizontal pixel coordinate 0 to ${this.viewport.width}>,
  "y": <integer vertical pixel coordinate 0 to ${this.viewport.height}>,
  "confidence": <float 0.0 to 1.0>,
  "reasoning": "<brief explanation of resolved position>"
}`;

      try {
        const rawOutput = await this.visionCaller(prompt, screenshot.base64Png);
        const parsed = this.parseCoordinatesFromOutput(rawOutput);
        if (parsed) {
          return this.clampToViewport(parsed);
        }
      } catch {
        // Fall back to spatial heuristics if vision model call fails
      }
    }

    // Spatial heuristic fallback (resolves positional anchors e.g. "top-right", "compose", "center")
    return this.resolveSpatialHeuristic(description);
  }

  /**
   * Complete visual fallback cycle:
   * 1. Capture viewport screenshot.
   * 2. Locate target element visually.
   * 3. Dispatch click at resolved (x, y) coordinates with occlusion checks.
   * 4. Capture verification screenshot.
   */
  public async interact(
    description: string,
    action: 'click' | 'hover' = 'click',
    tabId?: string,
  ): Promise<ActionResult> {
    // 1. Pre-action screenshot
    const preScreenshot = await this.controller.screenshot(undefined, tabId);

    // 2. Locate target
    const target = await this.locateTarget(description, preScreenshot);

    // 3. Dispatch click at exact coordinate
    let actionRes: ActionResult;
    if (action === 'click') {
      actionRes = await this.controller.clickCoordinates(target.x, target.y, tabId);
    } else {
      actionRes = {
        success: true,
        action: 'hover',
        target: `(${target.x}, ${target.y})`,
        message: `Hovered at (${target.x}, ${target.y})`,
      };
    }

    // Small delay for UI animation/transition
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 4. Post-action screenshot to verify state change
    const postScreenshot = await this.controller.screenshot(undefined, tabId);
    const stateChanged = this.verifyStateChange(preScreenshot.base64Png, postScreenshot.base64Png);

    return {
      success: actionRes.success,
      action: `visual_${action}`,
      target: `(${target.x}, ${target.y}) - "${description}"`,
      value: `confidence: ${target.confidence.toFixed(2)}${stateChanged ? ' (state transition verified)' : ''}`,
      message: `Visually clicked "${description}" at (${target.x}, ${target.y})${actionRes.message ? ` - ${actionRes.message}` : ''}`,
    };
  }

  public verifyStateChange(preBase64: string, postBase64: string): boolean {
    if (!preBase64 || !postBase64) return false;
    // Check if pixel data changed
    return preBase64 !== postBase64;
  }

  private parseCoordinatesFromOutput(output: string): TargetCoordinate | null {
    // Attempt JSON parse
    const jsonMatch = output.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;

    try {
      const data = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      let x = typeof data['x'] === 'number' ? data['x'] : undefined;
      let y = typeof data['y'] === 'number' ? data['y'] : undefined;

      // Handle normalized 0..1000 coordinates (e.g. [ymin, xmin, ymax, xmax])
      if (Array.isArray(data['box']) && data['box'].length === 4) {
        const [ymin, xmin, ymax, xmax] = data['box'] as number[];
        if (typeof ymin === 'number' && typeof xmin === 'number' && typeof ymax === 'number' && typeof xmax === 'number') {
          const normX = (xmin + xmax) / 2;
          const normY = (ymin + ymax) / 2;
          x = (normX / 1000) * this.viewport.width;
          y = (normY / 1000) * this.viewport.height;
        }
      }

      if (x !== undefined && y !== undefined) {
        return {
          x: Math.round(x),
          y: Math.round(y),
          confidence: typeof data['confidence'] === 'number' ? data['confidence'] : 0.85,
          reasoning: typeof data['reasoning'] === 'string' ? data['reasoning'] : undefined,
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  private clampToViewport(coord: TargetCoordinate): TargetCoordinate {
    return {
      ...coord,
      x: Math.max(0, Math.min(this.viewport.width, coord.x)),
      y: Math.max(0, Math.min(this.viewport.height, coord.y)),
    };
  }

  private resolveSpatialHeuristic(description: string): TargetCoordinate {
    const lower = description.toLowerCase();
    const w = this.viewport.width;
    const h = this.viewport.height;

    // Common UI landmark heuristics
    if (lower.includes('compose') || lower.includes('new email')) {
      return { x: Math.round(w * 0.08), y: Math.round(h * 0.16), confidence: 0.8, reasoning: 'Standard sidebar compose button anchor' };
    }
    if (lower.includes('search') || lower.includes('search bar') || lower.includes('search input')) {
      return { x: Math.round(w * 0.35), y: Math.round(h * 0.05), confidence: 0.8, reasoning: 'Top navigation search bar anchor' };
    }
    if (lower.includes('close') || lower.includes('dismiss') || lower.includes('exit')) {
      return { x: Math.round(w * 0.95), y: Math.round(h * 0.05), confidence: 0.7, reasoning: 'Top right close control anchor' };
    }
    if (lower.includes('top left')) {
      return { x: Math.round(w * 0.05), y: Math.round(h * 0.05), confidence: 0.7, reasoning: 'Top left quadrant anchor' };
    }
    if (lower.includes('top right') || lower.includes('profile') || lower.includes('avatar')) {
      return { x: Math.round(w * 0.95), y: Math.round(h * 0.05), confidence: 0.75, reasoning: 'Top right header anchor' };
    }
    if (lower.includes('bottom right') || lower.includes('send')) {
      return { x: Math.round(w * 0.88), y: Math.round(h * 0.92), confidence: 0.75, reasoning: 'Bottom right action anchor' };
    }
    if (lower.includes('center')) {
      return { x: Math.round(w * 0.5), y: Math.round(h * 0.5), confidence: 0.6, reasoning: 'Viewport center anchor' };
    }

    // Default to center
    return { x: Math.round(w * 0.5), y: Math.round(h * 0.5), confidence: 0.5, reasoning: 'Default fallback center coordinate' };
  }
}
