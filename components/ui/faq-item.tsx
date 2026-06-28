import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

type FaqItemProps = {
  id: string;
  question: string;
  answer: string;
  className?: string;
};

export function FaqItem({ id, question, answer, className }: FaqItemProps) {
  return (
    <AccordionItem
      value={id}
      className={cn("border-b border-linen last:border-b-0", className)}
    >
      <AccordionTrigger className="py-6 font-display text-base font-bold tracking-[-0.02em] text-ink hover:no-underline md:text-lg">
        {question}
      </AccordionTrigger>
      <AccordionContent className="pb-6 text-base leading-relaxed text-ash">
        {answer}
      </AccordionContent>
    </AccordionItem>
  );
}
