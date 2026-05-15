import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { PopoverContent } from '@/components/ui/popover'
import type { SkillInfo } from '@/hooks/use-pack'

interface SkillPickerContentProps {
  skills: SkillInfo[]
  onPick: (skill: SkillInfo) => void
  /** Controlled query bound to the parent's `/foo` slice of the textarea. */
  query: string
  onQueryChange: (value: string) => void
}

export function SkillPickerContent({
  skills,
  onPick,
  query,
  onQueryChange,
}: SkillPickerContentProps) {
  return (
    <PopoverContent
      align="start"
      side="top"
      sideOffset={6}
      className="w-90 p-0"
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search skills…"
          value={query}
          onValueChange={onQueryChange}
          autoFocus
        />
        <CommandList>
          <CommandEmpty>No matching skill</CommandEmpty>
          <CommandGroup heading="Skills">
            {filterSkills(skills, query).map((skill) => (
              <CommandItem
                key={skill.qualifiedName}
                value={skill.name}
                onSelect={() => onPick(skill)}
                className="flex flex-col items-start gap-0.5 py-2"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="font-mono text-[12.5px] font-medium">
                    /{skill.name}
                  </span>
                  {skill.displayName && skill.displayName !== skill.name && (
                    <span className="truncate text-xs text-muted-foreground">
                      {skill.displayName}
                    </span>
                  )}
                </div>
                {skill.description && (
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {skill.description}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  )
}

function filterSkills(skills: SkillInfo[], query: string): SkillInfo[] {
  const q = query.trim().toLowerCase()
  if (!q) return skills
  return skills.filter((s) =>
    s.name.toLowerCase().includes(q) ||
    s.displayName.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q),
  )
}
