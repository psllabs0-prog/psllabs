import { Star } from "lucide-react";

export function StarRating({ count = 5 }: { count?: number }) {
  return (
    <div
      className="flex items-center gap-0.5"
      aria-label={`${count} out of 5 stars`}
    >
      {Array.from({ length: count }, (_, i) => (
        <Star
          key={i}
          className="size-4 fill-[var(--color-brass)] text-[var(--color-brass)]"
          aria-hidden
        />
      ))}
    </div>
  );
}
