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
  addItem: (handle: string, quantity: number) => void;
  removeItem: (handle: string) => void;
  setItemQuantity: (handle: string, quantity: number) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

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

  const addItem = useCallback((handle: string, quantity: number) => {
    const safeQuantity = Math.max(1, Math.floor(quantity));
    setItems((current) => {
      const existing = current.find((item) => item.handle === handle);
      if (existing) {
        return current.map((item) =>
          item.handle === handle
            ? { ...item, quantity: item.quantity + safeQuantity }
            : item
        );
      }
      return [...current, { handle, quantity: safeQuantity }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((handle: string) => {
    setItems((current) => current.filter((item) => item.handle !== handle));
  }, []);

  const setItemQuantity = useCallback((handle: string, quantity: number) => {
    const safeQuantity = Math.max(1, Math.floor(quantity));
    setItems((current) =>
      current.map((item) =>
        item.handle === handle ? { ...item, quantity: safeQuantity } : item
      )
    );
  }, []);

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
