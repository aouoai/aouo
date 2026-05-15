import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AlertCircle, Bot, RefreshCw, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { ChatMessage } from '@/hooks/use-chat'

interface MessageBubbleProps {
  message: ChatMessage
  /** Shown next to the error footer on the trailing failed assistant turn. */
  onRetry?: () => void
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const Icon = isUser ? User : Bot
  return (
    <div
      className={cn(
        'flex w-full gap-3 px-4 py-4',
        isUser ? 'flex-row-reverse text-right' : 'flex-row',
      )}
    >
      <Avatar className={cn('size-7 shrink-0 border')}>
        <AvatarFallback className="bg-muted">
          <Icon className="size-3.5" />
        </AvatarFallback>
      </Avatar>
      <div className={cn('flex max-w-[80%] flex-col gap-1', isUser && 'items-end')}>
        {message.skillHint && (
          <Badge variant="secondary" className="text-[10px] font-mono tracking-tight">
            /{message.skillHint}
          </Badge>
        )}
        <div
          className={cn(
            'rounded-xl px-3.5 py-2 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground',
            message.error && 'border border-destructive/40 bg-destructive/10 text-destructive-foreground',
          )}
        >
          {message.content || (message.streaming && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-current" />
              <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:0.15s]" />
              <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:0.3s]" />
            </span>
          ))}
          {message.content && (
            <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1.5 [&_pre]:rounded-md [&_pre]:bg-background/80 [&_pre]:p-3 [&_code]:rounded [&_code]:bg-background/80 [&_code]:px-1 [&_code]:py-0.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        {message.error && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="size-3.5" />
            <span>{message.error}</span>
            {onRetry && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-xs text-destructive hover:text-destructive"
                onClick={onRetry}
              >
                <RefreshCw className="size-3" />
                Retry
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
