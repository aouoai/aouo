/**
 * @module server/sse
 * @description Server-Sent Events helper for the local dashboard server.
 *
 * Writes `text/event-stream` frames to a `node:http` ServerResponse with a
 * keep-alive heartbeat so proxies (nginx, browser internal buffers) don't
 * collapse long-lived chat streams.
 *
 * Frame shape (one event per call to `emit`):
 *   event: <name>
 *   data: <json>
 *   (blank line)
 */

import type { ServerResponse } from 'node:http';

export interface SseEvent {
  /** Event name. Consumers `switch` on this. */
  event: string;
  /** Event payload. JSON-serialized; strings are quoted by JSON.stringify. */
  data: unknown;
}

export interface SseStream {
  /** Push a single event frame. No-op after close. */
  emit(event: SseEvent): void;
  /** Flush a final blank-line terminator and end the response. */
  close(): void;
  /** True after `close()` has run or the underlying response ended. */
  readonly closed: boolean;
}

const HEARTBEAT_MS = 15_000;

/**
 * Wraps a ServerResponse so callers can `emit` SSE frames without managing
 * headers, encoding, or heartbeat themselves. Honors client disconnect.
 */
export function createSseStream(res: ServerResponse): SseStream {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Disable Nginx response buffering when fronted by a proxy.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let closed = false;

  const heartbeat = setInterval(() => {
    if (closed) return;
    res.write(': keep-alive\n\n');
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  const finish = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
  };

  res.once('close', finish);
  res.once('finish', finish);

  return {
    get closed() {
      return closed;
    },
    emit(evt: SseEvent): void {
      if (closed) return;
      const payload = JSON.stringify(evt.data ?? null);
      res.write(`event: ${evt.event}\ndata: ${payload}\n\n`);
    },
    close(): void {
      if (closed) return;
      finish();
      res.end();
    },
  };
}
