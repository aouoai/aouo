import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api, type SseFrame } from '@/lib/api'
import { usePackHistory } from '@/hooks/use-pack'

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  /** When streaming, the message is still receiving deltas. */
  streaming?: boolean
  /** If the agent failed mid-turn, this is the human-readable error. */
  error?: string | null
  /** Stable per-message timestamp for ordering and key generation. */
  createdAt: number
  /** Skill hint chip carried alongside the user message. */
  skillHint?: string | null
  /** True when the message came from server history (already persisted). */
  persisted?: boolean
}

function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Drives one pack's chat panel.
 *
 * `messages` is composed of two slices:
 *   - server history (persisted user/assistant turns from prior page loads)
 *   - local state (new turns added during this hook's lifetime, streaming
 *     deltas, and transient error frames)
 *
 * Combining the two via `useMemo` avoids the trap of seeding local state from
 * an effect (which would race against the first user input). Persisted rows
 * never re-enter `local`, so there is no duplication after the next refetch.
 *
 * Callers should mount the panel under `key={pack.name}` so switching packs
 * remounts this hook and clears local state cleanly.
 */
export function useChat(packName: string | undefined) {
  const { data: history, isLoading: loadingHistory } = usePackHistory(packName)
  const [local, setLocal] = useState<ChatMessage[]>([])
  const [pending, setPending] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>()
  const abortRef = useRef<AbortController | null>(null)

  const messages = useMemo<ChatMessage[]>(() => {
    const hydrated: ChatMessage[] = (history?.messages ?? []).map((m) => ({
      id: `db_${m.id}`,
      role: m.role,
      content: m.content,
      createdAt: new Date(m.createdAt).getTime(),
      persisted: true,
    }))
    return [...hydrated, ...local]
  }, [history, local])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setPending(false)
    setLocal((prev) =>
      prev.map((m) =>
        m.streaming ? { ...m, streaming: false, error: 'cancelled' } : m,
      ),
    )
  }, [])

  const send = useCallback(
    async (input: string, skillHint?: string | null) => {
      if (!packName) return
      const trimmed = input.trim()
      if (!trimmed) return

      const userMsg: ChatMessage = {
        id: nextId('u'),
        role: 'user',
        content: trimmed,
        createdAt: Date.now(),
        skillHint: skillHint ?? null,
      }
      const assistantId = nextId('a')
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        streaming: true,
        createdAt: Date.now() + 1,
      }
      setLocal((prev) => [...prev, userMsg, assistantMsg])
      setPending(true)

      const controller = new AbortController()
      abortRef.current = controller

      const updateAssistant = (patch: Partial<ChatMessage>) => {
        setLocal((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)),
        )
      }

      try {
        await api.stream(
          `/api/packs/${packName}/chat`,
          { input: trimmed, skillHint: skillHint ?? undefined },
          (frame: SseFrame) => handleFrame(frame),
          { signal: controller.signal },
        )
      } catch (err) {
        const message = (err as Error).message ?? 'Stream failed'
        if (controller.signal.aborted) return
        updateAssistant({ streaming: false, error: message })
        toast.error(`Chat failed: ${message}`)
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setPending(false)
      }

      function handleFrame(frame: SseFrame) {
        switch (frame.event) {
          case 'token': {
            const delta = typeof frame.data === 'string' ? frame.data : ''
            if (!delta) return
            setLocal((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + delta } : m,
              ),
            )
            return
          }
          case 'final': {
            const content =
              frame.data && typeof frame.data === 'object' && 'content' in frame.data
                ? String((frame.data as { content: unknown }).content ?? '')
                : ''
            setLocal((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m
                if (m.content) return m
                return { ...m, content }
              }),
            )
            return
          }
          case 'done': {
            const data = frame.data as { sessionId?: string } | null
            if (data?.sessionId) setSessionId(data.sessionId)
            updateAssistant({ streaming: false })
            return
          }
          case 'error': {
            const message = typeof frame.data === 'string'
              ? frame.data
              : JSON.stringify(frame.data)
            updateAssistant({ streaming: false, error: message })
            toast.error(`Agent error: ${message}`)
            return
          }
          default:
            // tool_call / tool_result / dispatch — ignored in MVP (Phase 5).
            return
        }
      }
    },
    [packName],
  )

  /**
   * Re-send the most recent user turn after a failure. Drops the failed
   * local pair (user message + errored assistant message) and re-fires the
   * stream so the user does not see a duplicate prompt in the transcript.
   * No-ops when the trailing local turn is not in an error state.
   */
  const retry = useCallback(() => {
    const idx = local.findLastIndex(
      (m) => m.role === 'assistant' && !m.streaming && m.error,
    )
    if (idx < 1) return
    const failed = local[idx]!
    const user = local[idx - 1]
    if (!user || user.role !== 'user') return
    setLocal((prev) =>
      prev.filter((m) => m.id !== failed.id && m.id !== user.id),
    )
    void send(user.content, user.skillHint ?? null)
  }, [local, send])

  return useMemo(
    () => ({
      messages,
      pending,
      sessionId,
      loadingHistory,
      send,
      cancel,
      retry,
    }),
    [messages, pending, sessionId, loadingHistory, send, cancel, retry],
  )
}
