import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Accordion({
  className,
  multiple = false,
  ...props
}: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("flex w-full flex-col", className)}
      multiple={multiple}
      {...props}
    />
  )
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("not-last:border-b", className)}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="flex w-full">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group/accordion-trigger flex w-full min-h-[3.25rem] flex-1 cursor-pointer items-center justify-between gap-4 border border-transparent text-left text-sm font-medium transition-colors duration-300 ease-out outline-none",
          "hover:bg-biotech-mist/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol",
          "aria-disabled:pointer-events-none aria-disabled:opacity-50",
          className
        )}
        {...props}
      >
        <span className="min-w-0 flex-1">{children}</span>
        <ChevronDownIcon
          aria-hidden
          className="pointer-events-none size-5 shrink-0 text-ash transition-transform duration-300 ease-out group-data-[panel-open]/accordion-trigger:rotate-180"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className={cn(
        "overflow-hidden text-sm",
        "data-open:animate-accordion-down data-closed:animate-accordion-up",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "pb-px pt-0 data-ending-style:h-0 data-starting-style:h-0",
          "[&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-ink [&_p:not(:last-child)]:mb-5"
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
