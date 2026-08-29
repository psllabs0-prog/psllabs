"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { resolveCartLines } from "@/lib/cart/products";
import {
  getEstimatedTotal,
  getShippingDisplay,
  getSubtotal,
} from "@/lib/cart/shipping";
import { loadCartFromStorage, saveCartToStorage } from "@/lib/cart/storage";
import type { CartLineItem, CartLineWithMeta } from "@/lib/cart/types";

export type AddItemResult =
  | { ok: true }
  | { ok: false; error: string };

type CartContextValue = {
  items: CartLineItem[];
  lines: CartLineWithMeta[];
  isHydrated: boolean;
  isOpen: boolean;
  totalQuantity: number;
  subtotal: number;
  estimatedTotal: number;
  shippingDisplay: ReturnType<typeof getShippingDisplay>;
  openCart: () => void;
  closeCart: () => void;
  addItem: (
    handle: string,
    quantity: number,
    maxAvailable?: number
  ) => AddItemResult;
  removeItem: (handle: string) => void;
  setItemQuantity: (
    handle: string,
    quantity: number,
    maxAvailable?: number
  ) => AddItemResult;
};

const CartContext = createContext<CartContextValue | null>(null);

function stockLimitMessage(maxAvailable: number): string {
  return `Only ${maxAvailable} unit${maxAvailable === 1 ? "" : "s"} available for this batch`;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartLineItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setItems(loadCartFromStorage());
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    saveCartToStorage(items);
  }, [items, isHydrated]);

  const lines = useMemo(() => resolveCartLines(items), [items]);
  const totalQuantity = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );
  const subtotal = useMemo(() => getSubtotal(lines), [lines]);
  const shippingDisplay = useMemo(() => getShippingDisplay(subtotal), [subtotal]);
  const estimatedTotal = useMemo(
    () => getEstimatedTotal(subtotal),
    [subtotal]
  );

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const addItem = useCallback(
    (handle: string, quantity: number, maxAvailable?: number): AddItemResult => {
      const safeQuantity = Math.max(1, Math.floor(quantity));

      if (maxAvailable !== undefined && maxAvailable <= 0) {
        return { ok: false, error: "Out of stock" };
      }

      let result: AddItemResult = { ok: true };

      setItems((current) => {
        const existing = current.find((item) => item.handle === handle);
        const nextQuantity = (existing?.quantity ?? 0) + safeQuantity;

        if (maxAvailable !== undefined && nextQuantity > maxAvailable) {
          result = { ok: false, error: stockLimitMessage(maxAvailable) };
          return current;
        }

        if (existing) {
          return current.map((item) =>
            item.handle === handle
              ? { ...item, quantity: nextQuantity }
              : item
          );
        }

        return [...current, { handle, quantity: safeQuantity }];
      });

      if (result.ok) {
        setIsOpen(true);
      }

      return result;
    },
    []
  );

  const removeItem = useCallback((handle: string) => {
    setItems((current) => current.filter((item) => item.handle !== handle));
  }, []);

  const setItemQuantity = useCallback(
    (
      handle: string,
      quantity: number,
      maxAvailable?: number
    ): AddItemResult => {
      const safeQuantity = Math.max(1, Math.floor(quantity));

      if (maxAvailable !== undefined && maxAvailable <= 0) {
        return { ok: false, error: "Out of stock" };
      }
      if (maxAvailable !== undefined && safeQuantity > maxAvailable) {
        return { ok: false, error: stockLimitMessage(maxAvailable) };
      }

      setItems((current) =>
        current.map((item) =>
          item.handle === handle ? { ...item, quantity: safeQuantity } : item
        )
      );
      return { ok: true };
    },
    []
  );

  const value = useMemo(
    () => ({
      items,
      lines,
      isHydrated,
      isOpen,
      totalQuantity,
      subtotal,
      estimatedTotal,
      shippingDisplay,
      openCart,
      closeCart,
      addItem,
      removeItem,
      setItemQuantity,
    }),
    [
      items,
      lines,
      isHydrated,
      isOpen,
      totalQuantity,
      subtotal,
      estimatedTotal,
      shippingDisplay,
      openCart,
      closeCart,
      addItem,
      removeItem,
      setItemQuantity,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}
