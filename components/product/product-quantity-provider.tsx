"use client";

import { createContext, useContext, useMemo, useState } from "react";

type ProductQuantityContextValue = {
  quantity: number;
  setQuantity: (quantity: number) => void;
  unitPrice: number;
  totalPrice: number;
};

const ProductQuantityContext =
  createContext<ProductQuantityContextValue | null>(null);

export function ProductQuantityProvider({
  unitPrice,
  children,
}: {
  unitPrice: number;
  children: React.ReactNode;
}) {
  const [quantity, setQuantity] = useState(1);
  const totalPrice = unitPrice * quantity;

  const value = useMemo(
    () => ({ quantity, setQuantity, unitPrice, totalPrice }),
    [quantity, unitPrice, totalPrice]
  );

  return (
    <ProductQuantityContext.Provider value={value}>
      {children}
    </ProductQuantityContext.Provider>
  );
}

export function useProductQuantity() {
  const ctx = useContext(ProductQuantityContext);
  if (!ctx) {
    throw new Error(
      "useProductQuantity must be used within ProductQuantityProvider"
    );
  }
  return ctx;
}
