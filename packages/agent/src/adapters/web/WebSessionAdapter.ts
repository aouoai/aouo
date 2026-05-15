/**
 * @module adapters/web/WebSessionAdapter
 * @description Adapter implementation for a single dashboard chat turn.
 *
 * One instance is created per `Agent.run()` invocation served by the
 * `/api/packs/:pack/chat` SSE endpoint. It does not own a long-lived
 * socket or a queue — the parent server response is the only sink.
 *
 * Responsibilities:
 * - Push assistant tokens, tool-call events, and dispatched messages onto
 *   the SSE stream via the injected `emit` callback.
 * - Provide a no-op `requestApproval` (MVP: auto-allow; Phase 5 wires UI).
 *
 * Non-responsibilities:
 * - No history persistence (the Agent writes to `messages` itself).
 * - No edit-in-place buffering: the browser builds the assistant message
 *   by appending `token` events client-side. The `reply()` fallback is
 *   only relevant when the provider returned the full assistant text in
 *   one chunk (no streaming).
 */

import type {
  Adapter,
  AdapterCapabilities,
  AdapterMessagePayload,
  AdapterMessageResult,
} from '../../agent/types.js';
import type { SseEvent } from '../../server/sse.js';

export type WebSessionEmit = (event: SseEvent) => void;

/**
 * Capability profile for the dashboard web client.
 *
 * `editMessage: true` is the streaming-token gate inside the Agent —
 * leaving it on lets the LLM transport call `onToken` (which our
 * chat handler turns into SSE `token` events). The other channels
 * (photo/voice/audio/document) are not yet rendered in the dashboard
 * UI, so the message-dispatch layer degrades them to plain text.
 */
export const WEB_CAPABILITIES: AdapterCapabilities = {
  photo: false,
  voice: false,
  audio: false,
  document: false,
  editMessage: true,
};

export class WebSessionAdapter implements Adapter {
  readonly platform = 'web' as const;
  readonly capabilities = WEB_CAPABILITIES;

  constructor(private readonly emit: WebSessionEmit) {}

  async reply(content: string): Promise<void> {
    // Sent when the provider returns a non-streamed final message, or as
    // the closing summary even when token deltas already streamed. The
    // browser uses this to confirm the assistant message is complete.
    this.emit({ event: 'final', data: { content } });
  }

  showToolCall(toolName: string, args: Record<string, unknown>): void {
    this.emit({ event: 'tool_call', data: { tool: toolName, args } });
  }

  showToolResult(toolName: string, result: string, isError: boolean): void {
    this.emit({ event: 'tool_result', data: { tool: toolName, result, isError } });
  }

  /**
   * MVP: auto-allow. Phase 5 will route this through the dashboard for an
   * interactive prompt and persist the decision for repeat operations.
   */
  async requestApproval(_description: string): Promise<'allow' | 'deny' | 'always'> {
    return 'allow';
  }

  /**
   * Pre-MVP: the dashboard chat path does not yet implement interactive
   * choice, so we reject and let the Agent fall back to autonomous reasoning.
   * Wiring a round-trip prompt is Phase 5 work.
   */
  async requestChoice(_description: string, _choices: string[]): Promise<string> {
    throw new Error('WebSessionAdapter.requestChoice is not implemented');
  }

  async dispatchMessage(message: AdapterMessagePayload): Promise<AdapterMessageResult> {
    this.emit({ event: 'dispatch', data: message });
    return { ok: true, sentContent: true };
  }
}
