import { ComponentProps } from "react"
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left"
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right"
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

// Stylet til react-day-picker v9 (classNames-nøglerne er IKKE de samme som i v8).
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "relative flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-3 w-full",
        month_caption: "flex justify-center items-center h-9",
        caption_label: "text-sm font-bold capitalize",
        dropdowns: "flex items-center justify-center gap-1.5",
        dropdown_root: "relative inline-flex items-center",
        // Ægte <select> skal være usynlig og ligge OVENPÅ caption_label (rdp v9-mønster), ellers vises begge dobbelt.
        dropdown: "absolute inset-0 z-10 opacity-0 cursor-pointer appearance-none",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between h-9 z-10 px-1",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "size-8 p-0 bg-transparent hover:bg-secondary hover:text-secondary-foreground"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "size-8 p-0 bg-transparent hover:bg-secondary hover:text-secondary-foreground"
        ),
        chevron: "size-4 fill-current",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 h-9 flex items-center justify-center text-xs font-semibold text-muted-foreground capitalize",
        week: "flex w-full mt-1",
        day: cn(
          "relative p-0 w-9 h-9 text-center text-sm",
          "[&:has([data-selected])]:rounded-md"
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "size-9 p-0 font-normal text-sm aria-selected:opacity-100 hover:bg-secondary"
        ),
        selected:
          "rounded-md bg-primary text-primary-foreground [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
        today: "[&>button]:border-2 [&>button]:border-accent [&>button]:font-bold",
        outside: "text-muted-foreground/40 [&>button]:text-muted-foreground/40",
        disabled: "text-muted-foreground/30 [&>button]:text-muted-foreground/30 [&>button]:opacity-40 [&>button]:pointer-events-none",
        hidden: "invisible",
        range_start: "rounded-l-md bg-primary text-primary-foreground [&>button]:bg-primary [&>button]:text-primary-foreground",
        range_middle: "rounded-none bg-accent/30 [&>button]:bg-transparent",
        range_end: "rounded-r-md bg-primary text-primary-foreground [&>button]:bg-primary [&>button]:text-primary-foreground",
        week_number: "w-9 h-9 flex items-center justify-center text-xs font-semibold text-primary/70 bg-muted/40 rounded-md mr-1",
        week_number_header: "w-9 h-9 flex items-center justify-center text-[10px] font-bold uppercase text-muted-foreground/60 mr-1",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("size-4", chevronClassName)} {...chevronProps} />
          ) : orientation === "down" ? (
            <ChevronDown className={cn("size-4", chevronClassName)} {...chevronProps} />
          ) : (
            <ChevronRight className={cn("size-4", chevronClassName)} {...chevronProps} />
          ),
      }}
      {...props}
    />
  )
}

export { Calendar }
