import type { Product } from "@/lib/products";

import { AnimateIn } from "./animate-in";
import { SectionShell } from "./section-shell";

export function ProductIngredients({ product }: { product: Product }) {
  return (
    <SectionShell
      label="INGREDIENTS"
      title="Every dose disclosed."
      variant="white"
      width="content"
    >
      <div className="hidden md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--color-sage)]">
              <th className="pb-5 pr-10 font-[family-name:var(--font-display)] text-lg font-normal text-[var(--color-ink)]">
                Ingredient
              </th>
              <th className="pb-5 pr-10 font-[family-name:var(--font-display)] text-lg font-normal text-[var(--color-ink)]">
                Dose
              </th>
              <th className="pb-5 font-[family-name:var(--font-display)] text-lg font-normal text-[var(--color-ink)]">
                Mechanism
              </th>
            </tr>
          </thead>
          <tbody>
            {product.ingredients.map((ingredient) => (
              <tr
                key={ingredient.name}
                className="border-b border-[var(--color-sage)]"
              >
                <td className="py-6 pr-10 text-[var(--color-ink)]">
                  {ingredient.name}
                </td>
                <td className="py-6 pr-10 font-[family-name:var(--font-mono)] text-sm text-[var(--color-ink)]">
                  {ingredient.dose}
                </td>
                <td className="py-6 text-sm leading-relaxed text-[var(--color-stone)]">
                  {ingredient.mechanism}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col md:hidden">
        {product.ingredients.map((ingredient, index) => (
          <AnimateIn key={ingredient.name} delay={index * 0.06}>
            <li className="border-b border-[var(--color-sage)] py-8">
              <p className="mb-2 font-[family-name:var(--font-display)] text-lg text-[var(--color-ink)]">
                {ingredient.name}
              </p>
              <p className="mb-3 font-[family-name:var(--font-mono)] text-sm text-[var(--color-ink)]">
                {ingredient.dose}
              </p>
              <p className="text-sm leading-relaxed text-[var(--color-stone)]">
                {ingredient.mechanism}
              </p>
            </li>
          </AnimateIn>
        ))}
      </ul>
    </SectionShell>
  );
}
