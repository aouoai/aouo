/**
 * @module lib/vision
 * @description Image analysis adapter using Google Gemini Vision API.
 *
 * Accepts a local image file, encodes it as base64, and sends it to the
 * Gemini multimodal endpoint for description. Returns a structured result
 * with the visual analysis text.
 *
 * Design:
 * - Uses raw `fetch()` — no SDK dependency required.
 * - Supports JPEG, PNG, GIF, WebP, BMP.
 * - Max file size: 20 MB.
 * - Vision model is configurable via `config.gemini.vision_model`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AouoConfig } from '../config/defaults.js';
import { logger } from './logger.js';
import { trackVision } from './usage.js';

// ── MIME Mapping ─────────────────────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp',
};

// ── Result Type ──────────────────────────────────────────────────────────────

/**
 * Structured result from a vision analysis attempt.
 */
export interface VisionResult {
  /** Whether the analysis succeeded. */
  success: boolean;
  /** Natural-language description of the image content. */
  description?: string;
  /** Error message if analysis failed. */
  error?: string;
}

// ── Core Function ────────────────────────────────────────────────────────────

/**
 * Analyzes an image file using the Gemini Vision API.
 *
 * @param imagePath - Absolute path to the image file.
 * @param config - Agent configuration (provides API key and model).
 * @param userCaption - Optional caption from the user to guide analysis.
 * @returns Analysis result with description or error.
 */
export async function analyzeImage(
  imagePath: string,
  config: AouoConfig,
  userCaption?: string,
): Promise<VisionResult> {
  // ── Validate API key ──
  const apiKey = config.gemini?.api_key;
  if (!apiKey) {
    return { success: false, error: 'Gemini API key not configured in config.json.' };
  }

  // ── Validate file ──
  if (!fs.existsSync(imagePath)) {
    return { success: false, error: `Image file not found: ${imagePath}` };
  }

  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = MIME_MAP[ext];
  if (!mimeType) {
    return { success: false, error: `Unsupported image format: ${ext}` };
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Data = imageBuffer.toString('base64');
  const sizeMB = imageBuffer.length / (1024 * 1024);

  if (sizeMB > 20) {
    return { success: false, error: `Image too large: ${sizeMB.toFixed(1)}MB (max 20MB)` };
  }

  // ── Build prompt ──
  const model = config.gemini.vision_model || 'gemini-2.5-flash';
  const prompt = userCaption
    ? `Describe this image in detail, then answer the user's question: "${userCaption}". Include any text, code, data, objects, layout, and notable visual information. Reply in the same language as the user's question.`
    : 'Describe everything visible in this image in thorough detail. Include any text, code, data, objects, people, layout, colors, and any other notable visual information.';

  // ── Call Gemini Vision API ──
  try {
    logger.info({ msg: 'vision_analyze', imagePath, model, sizeMB: sizeMB.toFixed(1) });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64Data } },
          ],
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Gemini API ${res.status}: ${errText.substring(0, 200)}` };
    }

    const data = await res.json() as any;
    const description = data.candidates?.[0]?.content?.parts
      ?.filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join('');

    trackVision();

    if (!description) {
      return { success: false, error: 'Gemini returned empty response' };
    }

    logger.info({ msg: 'vision_done', descLength: description.length });
    return { success: true, description };
  } catch (err) {
    const error = err as Error;
    logger.error({ msg: 'vision_error', error: error.message });
    return { success: false, error: `Vision analysis failed: ${error.message}` };
  }
}
