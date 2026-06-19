"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

type AddToCartButtonProps = {
  productId: string;
  quantity?: number;
  className?: string;
  variant?: "primary" | "compact";
  children?: React.ReactNode;
};

export function AddToCartButton({
  productId,
  quantity = 1,
  className,
  variant = "primary",
  children,
}: AddToCartButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          quantity,
        }),
      });

      const data = (await res.json()) as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Failed to create checkout session");
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  const baseStyles =
    "rounded-md bg-[var(--color-sage)] font-medium text-[var(--color-lab-white)] transition-opacity duration-200 ease-out hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

  const variantStyles =
    variant === "primary"
      ? "w-full px-6 py-3.5 text-base"
      : "shrink-0 px-6 py-3 text-sm";

  return (
    <div className={cn("flex flex-col", className)}>
      <button
        type="button"
        onClick={handleCheckout}
        disabled={loading}
        className={cn(baseStyles, variantStyles)}
      >
        {loading
          ? "Redirecting…"
          : children ?? "Pay with Crypto"}
      </button>
      {error && (
        <p className="mt-2 text-xs text-[var(--color-signal)]">{error}</p>
      )}
    </div>
  );
}
