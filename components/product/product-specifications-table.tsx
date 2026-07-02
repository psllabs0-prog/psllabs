import type { ProductSpecification } from "@/lib/products";
import { cn } from "@/lib/utils";

type ProductSpecificationsTableProps = {
  specifications: ProductSpecification[];
  className?: string;
};

export function ProductSpecificationsTable({
  specifications,
  className,
}: ProductSpecificationsTableProps) {
  return (
    <dl
      className={cn(
        "divide-y divide-linen overflow-hidden rounded-2xl border border-linen bg-lab-white",
        className
      )}
    >
      {specifications.map((spec) => (
        <div
          key={spec.label}
          className="grid grid-cols-1 gap-1 px-5 py-4 sm:grid-cols-[minmax(9rem,38%)_1fr] sm:gap-6 sm:px-6 sm:py-5"
        >
          <dt className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider text-ash">
            {spec.label}
          </dt>
          <dd className="text-sm leading-relaxed text-ink md:text-base">
            {spec.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
