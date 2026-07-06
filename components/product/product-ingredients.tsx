import type { Product } from "@/lib/products";

import { AnimateIn } from "./animate-in";
import { SectionShell } from "./section-shell";

export function ProductIngredients({ product }: { product: Product }) {
  return (
    <SectionShell
      label="INGREDIENTS"
      title="Every dose disclosed."
      variant="ice"
      width="content"
    >
      <div className="premium-card hidden overflow-hidden md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-linen bg-soft-blue/50">
              <th className="px-6 py-4 font-[family-name:var(--font-display)] text-lg font-normal text-ink">
                Ingredient
              </th>
              <th className="px-6 py-4 font-[family-name:var(--font-display)] text-lg font-normal text-ink">
                Dose
              </th>
              <th className="px-6 py-4 font-[family-name:var(--font-display)] text-lg font-normal text-ink">
                Mechanism
              </th>
            </tr>
          </thead>
          <tbody>
            {product.ingredients.map((ingredient, index) => (
              <tr
                key={ingredient.name}
                className={`border-b border-linen ${index % 2 === 1 ? "bg-ice-blue/30" : ""}`}
              >
                <td className="px-6 py-5 text-ink">
                  {ingredient.name}
                </td>
                <td className="px-6 py-5 font-[family-name:var(--font-mono)] text-sm text-ink">
                  {ingredient.dose}
                </td>
                <td className="px-6 py-5 text-sm leading-relaxed text-ash">
                  {ingredient.mechanism}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="premium-card flex flex-col overflow-hidden md:hidden">
        {product.ingredients.map((ingredient, index) => (
          <AnimateIn key={ingredient.name} delay={index * 0.06}>
            <li className={`border-b border-linen px-5 py-6 last:border-b-0 ${index % 2 === 1 ? "bg-ice-blue/30" : ""}`}>
              <p className="mb-2 font-[family-name:var(--font-display)] text-lg text-ink">
                {ingredient.name}
              </p>
              <p className="mb-3 font-[family-name:var(--font-mono)] text-sm text-ink">
                {ingredient.dose}
              </p>
              <p className="text-sm leading-relaxed text-ash">
                {ingredient.mechanism}
              </p>
            </li>
          </AnimateIn>
        ))}
      </ul>
    </SectionShell>
  );
}
