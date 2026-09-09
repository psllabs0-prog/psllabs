import { List } from "lucide-react";

export type TocItem = {
  id: string;
  label: string;
};

type GuideTableOfContentsProps = {
  items: TocItem[];
  className?: string;
};

export function GuideTableOfContents({
  items,
  className = "",
}: GuideTableOfContentsProps) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Table of contents"
      className={`rounded-xl border border-linen bg-surface p-5 sm:p-6 ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-linen pb-3 text-xs font-mono uppercase tracking-wider text-accent">
        <List className="size-4 shrink-0" aria-hidden />
        <span>In This Guide</span>
      </div>

      <ol className="mt-4 flex flex-col gap-2 text-sm">
        {items.map((item, index) => (
          <li key={item.id} className="flex items-start gap-2.5">
            <span className="font-mono text-xs text-stone pt-0.5">
              {String(index + 1).padStart(2, "0")}
            </span>
            <a
              href={`#${item.id}`}
              className="text-ash transition-colors hover:text-accent hover:underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
