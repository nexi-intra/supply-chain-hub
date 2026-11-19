import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TabsProps<T extends string> {
  value: T
  onChange: (value: T) => void
  items: { value: T; label: ReactNode; badge?: ReactNode; hidden?: boolean }[]
  className?: string
}

/** A row of tabs (buttons with tab semantics). The content is rendered by the caller. */
export function Tabs<T extends string>({ value, onChange, items, className }: TabsProps<T>) {
  return (
    <div role="tablist" className={cn('flex flex-wrap gap-1 border-b', className)}>
      {items.filter(item => !item.hidden).map(item => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          onClick={() => onChange(item.value)}
          className={cn(
            '-mb-px inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
            item.value === value ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {item.label}
          {item.badge}
        </button>
      ))}
    </div>
  )
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn('flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50', className)}
      {...props}
    />
  )
}

export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn('h-10 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50', className)}
      {...props}
    />
  )
}
