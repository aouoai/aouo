import { useCallback, useMemo, useRef, useState } from 'react'
import { ArrowUp, Square, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useChat } from '@/hooks/use-chat'
import type { PackDetail, SkillInfo } from '@/hooks/use-pack'

import { MessageList } from './MessageList'
import { SkillPickerContent } from './SkillPicker'

interface ChatPanelProps {
  pack: PackDetail
}

export function ChatPanel({ pack }: ChatPanelProps) {
  const chat = useChat(pack.name)
  const [draft, setDraft] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const skillQuery = useMemo(() => {
    if (!pickerOpen) return ''
    const match = /^\/(\S*)/.exec(draft)
    return match?.[1] ?? ''
  }, [draft, pickerOpen])

  const handleDraftChange = useCallback(
    (value: string) => {
      setDraft(value)
      if (selectedSkill) return
      const wantsPicker = value.startsWith('/')
      setPickerOpen((open) => (open === wantsPicker ? open : wantsPicker))
    },
    [selectedSkill],
  )

  const submit = useCallback(() => {
    if (chat.pending) return
    const text = draft.trim()
    if (!text) return
    chat.send(text, selectedSkill?.name).catch(() => {
      // toast handled inside useChat
    })
    setDraft('')
    setSelectedSkill(null)
    setPickerOpen(false)
  }, [chat, draft, selectedSkill])

  const pickSkill = useCallback((skill: SkillInfo) => {
    setSelectedSkill(skill)
    // Strip the `/foo` prefix the user typed.
    setDraft((prev) => prev.replace(/^\/\S*\s?/, ''))
    setPickerOpen(false)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        submit()
      }
      if (e.key === 'Escape' && pickerOpen) {
        e.preventDefault()
        setPickerOpen(false)
      }
    },
    [submit, pickerOpen],
  )

  const empty = chat.messages.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      {chat.loadingHistory ? (
        <LoadingState />
      ) : empty ? (
        <EmptyState pack={pack} onPick={pickSkill} />
      ) : (
        <MessageList messages={chat.messages} onRetry={chat.retry} />
      )}

      <div className="border-t bg-background/95 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger
              render={
                <div className="rounded-xl border bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0" />
              }
            >
              {selectedSkill && (
                <div className="flex items-center gap-2 border-b px-3 py-2">
                  <Badge variant="secondary" className="font-mono text-[11px]">
                    /{selectedSkill.name}
                    <button
                      type="button"
                      onClick={() => setSelectedSkill(null)}
                      className="ml-1 inline-flex size-3.5 items-center justify-center rounded-full hover:bg-foreground/10"
                      aria-label="Clear skill"
                    >
                      <X className="size-2.5" />
                    </button>
                  </Badge>
                  {selectedSkill.description && (
                    <span className="truncate text-xs text-muted-foreground">
                      {selectedSkill.description}
                    </span>
                  )}
                </div>
              )}
              <Textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={
                  selectedSkill
                    ? `Continue with /${selectedSkill.name}…`
                    : 'Ask anything — type `/` to invoke a skill'
                }
                rows={1}
                className={cn(
                  'min-h-11 max-h-48 resize-none border-0 bg-transparent px-3 py-2.5 text-sm shadow-none focus-visible:ring-0',
                )}
              />
              <div className="flex items-center justify-between px-3 pb-2 pt-1">
                <span className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                  {chat.pending ? 'Streaming…' : 'Enter to send · Shift+Enter for newline'}
                </span>
                {chat.pending ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={chat.cancel}
                    aria-label="Stop streaming"
                  >
                    <Square className="size-3.5" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="icon"
                    onClick={submit}
                    disabled={!draft.trim()}
                    aria-label="Send message"
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                )}
              </div>
            </PopoverTrigger>
            <SkillPickerContent
              skills={pack.skills}
              onPick={pickSkill}
              query={skillQuery}
              onQueryChange={(value) => {
                // User typed inside the picker — treat it like editing the
                // `/foo` prefix in the textarea so the two stay in sync.
                setDraft(`/${value}`)
                setSelectedSkill(null)
              }}
            />
          </Popover>
        </div>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
      Loading conversation…
    </div>
  )
}

function EmptyState({
  pack,
  onPick,
}: {
  pack: PackDetail
  onPick: (skill: SkillInfo) => void
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 text-center">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{pack.displayName}</h1>
          {pack.description && (
            <p className="text-sm text-muted-foreground">{pack.description}</p>
          )}
        </div>
        {pack.skills.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
              Try a skill
            </span>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {pack.skills.slice(0, 6).map((skill) => (
                <button
                  key={skill.qualifiedName}
                  type="button"
                  onClick={() => onPick(skill)}
                  className="group flex flex-col items-start gap-0.5 rounded-md border bg-card px-3 py-2 text-left transition-colors hover:border-foreground/20 hover:bg-accent"
                >
                  <span className="font-mono text-xs font-medium">/{skill.name}</span>
                  {skill.description && (
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {skill.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
