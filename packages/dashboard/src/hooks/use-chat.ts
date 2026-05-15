import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api, type SseFrame } from '@/lib/api'

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
}

interface UseChatState {
  messages: ChatMessage[]
  pending: boolean
  sessionId?: string
}

function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function useChat(packName: string | undefined) {
  const [state, setState] = useState<UseChatState>({ messages: [], pending: false })
  const abortRef = useRef<AbortController | null>(null)

  const setMessages = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setState((prev) => ({ ...prev, messages: updater(prev.messages) }))
    },
    [],
  )

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState((prev) => ({
      ...prev,
      pending: false,
      messages: prev.messages.map((m) =>
        m.streaming ? { ...m, streaming: false, error: 'cancelled' } : m,
      ),
    }))
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
      setState((prev) => ({
        ...prev,
        pending: true,
        messages: [...prev.messages, userMsg, assistantMsg],
      }))

      const controller = new AbortController()
      abortRef.current = controller

      try {
        await api.stream(
          `/api/packs/${packName}/chat`,
          { input: trimmed, skillHint: skillHint ?? undefined },
          (frame: SseFrame) => {
            handleFrame(frame, assistantId)
          },
          { signal: controller.signal },
        )
      } catch (err) {
        const message = (err as Error).message ?? 'Stream failed'
        if (controller.signal.aborted) {
          // already handled by cancel()
          return
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, streaming: false, error: message }
              : m,
          ),
        )
        toast.error(`Chat failed: ${message}`)
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setState((prev) => ({ ...prev, pending: false }))
      }

      function handleFrame(frame: SseFrame, msgId: string) {
        switch (frame.event) {
          case 'token': {
            const delta = typeof frame.data === 'string' ? frame.data : ''
            if (!delta) return
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId ? { ...m, content: m.content + delta } : m,
              ),
            )
            return
          }
          case 'final': {
            // Provider returned a complete (non-streamed) message. Replace
            // accumulator with it unless we already have streaming content.
            const content =
              frame.data && typeof frame.data === 'object' && 'content' in frame.data
                ? String((frame.data as { content: unknown }).content ?? '')
                : ''
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== msgId) return m
                if (m.content) return m
                return { ...m, content }
              }),
            )
            return
          }
          case 'done': {
            const data = frame.data as { sessionId?: string } | null
            setState((prev) => ({
              ...prev,
              sessionId: data?.sessionId ?? prev.sessionId,
              messages: prev.messages.map((m) =>
                m.id === msgId ? { ...m, streaming: false } : m,
              ),
            }))
            return
          }
          case 'error': {
            const message = typeof frame.data === 'string'
              ? frame.data
              : JSON.stringify(frame.data)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId ? { ...m, streaming: false, error: message } : m,
              ),
            )
            toast.error(`Agent error: ${message}`)
            return
          }
          default:
            // tool_call / tool_result / dispatch — ignored in MVP (Phase 5).
            return
        }
      }
    },
    [packName, setMessages],
  )

  const reset = useCallback(() => {
    cancel()
    setState({ messages: [], pending: false })
  }, [cancel])

  return useMemo(
    () => ({
      messages: state.messages,
      pending: state.pending,
      sessionId: state.sessionId,
      send,
      cancel,
      reset,
    }),
    [state, send, cancel, reset],
  )
}
