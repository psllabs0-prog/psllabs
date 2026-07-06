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
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-linen bg-lab-white shadow-[0_4px_24px_rgba(37,99,235,0.08)]",
        className
      )}
    >
      <div className="border-b border-linen bg-gradient-to-r from-soft-blue/80 to-ice-blue px-5 py-3 md:px-6">
        <p className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider text-biotech-deep">
          Technical specifications
        </p>
      </div>
      <dl className="divide-y divide-linen">
        {specifications.map((spec, index) => (
          <div
            key={spec.label}
            className={cn(
              "grid grid-cols-1 gap-1 px-5 py-3.5 sm:grid-cols-[minmax(9rem,38%)_1fr] sm:gap-6 sm:px-6 sm:py-4",
              index % 2 === 1 && "bg-ice-blue/30"
            )}
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
    </div>
  );
}
