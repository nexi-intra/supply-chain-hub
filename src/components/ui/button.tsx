import { ComponentProps, useEffect, useRef, useState } from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { CircleNotch } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"
import { watchClickResult } from "@/lib/clickPending"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border border-input bg-background hover:bg-secondary hover:text-secondary-foreground dark:bg-input/20 dark:hover:bg-input/40",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost:
          "hover:bg-secondary hover:text-secondary-foreground dark:hover:bg-secondary",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2.5 has-[>svg]:px-4",
        sm: "h-9 gap-1.5 px-3.5 text-xs has-[>svg]:px-3",
        lg: "h-12 px-7 text-base has-[>svg]:px-5",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  onClick,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
  }) {
  const Comp = asChild ? Slot : "button"
  // A handler that returns a promise (an async save, an SAP call ...) shows the spinner until it is done, also where
  // the screen does not set `loading` itself: the user always sees that the click was registered.
  const [working, setWorking] = useState(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const handleClick: ComponentProps<"button">["onClick"] = onClick && !asChild
    ? event => { void watchClickResult(onClick(event), busy => { if (mounted.current) setWorking(busy) })?.catch(error => console.error('Handlingen fejlede:', error)) }
    : onClick
  const busy = loading || working

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }), busy && "relative overflow-hidden")}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={handleClick}
      {...props}
    >
      {/* A visible spinner the moment the click is registered: saves to the shared drive can take seconds. */}
      {busy && !asChild && <CircleNotch aria-hidden="true" className="motion-safe:animate-spin" weight="bold" />}
      {children}
      {busy && !asChild && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-current/20"><span className="block h-full w-full bg-current motion-safe:animate-pulse" /></span>}
    </Comp>
  )
}

export { Button, buttonVariants }
