import { useEffect, useMemo, useRef } from 'react'
import { MessageBubble } from './MessageBubble'
import type { ChatMessage } from '@/hooks/use-chat'

interface MessageListProps {
  messages: ChatMessage[]
  onRetry?: () => void
}

export function MessageList({ messages, onRetry }: MessageListProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  // The retry affordance only makes sense on the *trailing* failed assistant
  // message — earlier failures in the transcript are historical and replaying
  // them would corrupt conversation order.
  const retryMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!
      if (m.role === 'assistant' && m.error && !m.streaming) return m.id
      if (m.role === 'user' && i === messages.length - 1) return null
      if (m.role === 'assistant' && !m.error) return null
    }
    return null
  }, [messages])

  return (
    <div ref={scrollerRef} className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col py-4">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onRetry={m.id === retryMessageId ? onRetry : undefined}
          />
        ))}
      </div>
    </div>
  )
}
