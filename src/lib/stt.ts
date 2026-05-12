/**
 * @module lib/stt
 * @description Speech-to-Text adapter using Groq Whisper API.
 *
 * Provides audio transcription with:
 * - File validation (format, size, existence)
 * - Whisper hallucination filtering
 * - Structured result type
 *
 * The adapter is designed to be provider-swappable — only the Groq
 * implementation is included, but the TranscriptionResult interface
 * can be fulfilled by any STT backend.
 */

import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';
import type { AouoConfig } from '../config/defaults.js';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'whisper-large-v3-turbo';

/** Formats accepted by Groq's Whisper API. */
const SUPPORTED_FORMATS = new Set([
  '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a',
  '.wav', '.webm', '.ogg', '.aac', '.flac',
]);

/** Groq API file size limit: 25 MB. */
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// ── Hallucination Filter ─────────────────────────────────────────────────────

/**
 * Known spurious strings Whisper generates from silence or noise.
 */
const HALLUCINATIONS = new Set([
  'thank you.', 'thank you', 'thanks for watching.',
  'thanks for watching', 'bye.', 'bye', 'you',
  'the end.', 'the end',
]);

/**
 * Checks if a transcript is a known Whisper hallucination.
 */
function isHallucination(text: string): boolean {
  const cleaned = text.trim().toLowerCase();
  if (!cleaned) return true;
  if (HALLUCINATIONS.has(cleaned) || HALLUCINATIONS.has(cleaned.replace(/[.!]/g, ''))) return true;
  if (/^(?:thank you|thanks|bye|you|ok|okay|the end|[.\s,!])+$/i.test(cleaned)) return true;
  return false;
}

// ── Core Interface ───────────────────────────────────────────────────────────

/**
 * Result of an audio transcription attempt.
 */
export interface TranscriptionResult {
  /** Whether transcription succeeded (may be true with empty transcript for filtered hallucinations). */
  success: boolean;
  /** The transcribed text, empty if filtered or failed. */
  transcript: string;
  /** Error description if success is false. */
  error?: string;
}

/**
 * Transcribes an audio file to text using the Groq Whisper API.
 *
 * @param filePath - Absolute path to the audio file.
 * @param config - Agent configuration (provides API key).
 * @returns Transcription result with text or error details.
 */
export async function transcribeAudio(
  filePath: string,
  config: AouoConfig,
): Promise<TranscriptionResult> {
  // ── Validation ──
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_FORMATS.has(ext)) {
    return { success: false, transcript: '', error: `Unsupported format: ${ext}` };
  }

  if (!fs.existsSync(filePath)) {
    return { success: false, transcript: '', error: `File not found: ${filePath}` };
  }

  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) {
    return {
      success: false,
      transcript: '',
      error: `File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB (max 25MB)`,
    };
  }

  // ── API Key ──
  const apiKey = config.stt.groq_api_key || process.env['GROQ_API_KEY'];
  if (!apiKey) {
    return {
      success: false,
      transcript: '',
      error: 'Groq API key not configured. Set stt.groq_api_key or GROQ_API_KEY.',
    };
  }

  // ── Transcription ──
  try {
    const startTime = Date.now();
    const model = config.stt.model || DEFAULT_MODEL;

    // Dynamic import — groq-sdk is an optional peer dependency
    // @ts-expect-error — groq-sdk is an optional peer dependency
    const Groq = (await import('groq-sdk')).default;
    const groq = new Groq({ apiKey });
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model,
      response_format: 'text',
    });

    const durationMs = Date.now() - startTime;
    const transcript = String(transcription).trim();

    if (isHallucination(transcript)) {
      logger.info({ msg: 'stt_hallucination_filtered', transcript });
      return { success: true, transcript: '' };
    }

    logger.info({
      msg: 'stt_transcribed',
      filePath,
      model,
      durationMs,
      chars: transcript.length,
      transcript: transcript.substring(0, 150),
    });

    return { success: true, transcript };
  } catch (error) {
    const errMsg = (error as Error).message;
    logger.error({ msg: 'stt_exception', error: errMsg });
    return { success: false, transcript: '', error: `Transcription failed: ${errMsg}` };
  }
}
