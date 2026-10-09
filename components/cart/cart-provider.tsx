"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { normalizeCartItems } from "@/lib/cart/normalize";
import { getCartProductMeta, resolveCartLines } from "@/lib/cart/products";
import {
  getEstimatedTotal,
  getShippingDisplay,
  getSubtotal,
} from "@/lib/cart/shipping";
import { loadCartFromStorage, saveCartToStorage } from "@/lib/cart/storage";
import type { CartLineItem, CartLineWithMeta } from "@/lib/cart/types";
import { createMetaBrowserAction, dispatchMetaBrowserAction, type MetaBrowserAction } from "@/lib/meta-ads/browser";
import { REVIEWED_META_PRODUCTS } from "@/lib/meta-ads/events";

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
  const currentItems = useRef<CartLineItem[]>([]);
  const pendingAdds = useRef<{ handle: string; minimumQuantity: number; action: MetaBrowserAction }[]>([]);

  useEffect(() => {
    // Hydrate browser storage after SSR; the save effect stays gated until this finishes.
    const restored = normalizeCartItems(loadCartFromStorage());
    currentItems.current = restored;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(restored);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    saveCartToStorage(normalizeCartItems(items));
    // Dispatch only after a successful addition is visible in committed state.
    // React updater functions contain no events or other side effects.
    const additions = pendingAdds.current.splice(0);
    for (const addition of additions) {
      if ((items.find((item) => item.handle === addition.handle)?.quantity ?? 0) >= addition.minimumQuantity) {
        void dispatchMetaBrowserAction(addition.action);
      }
    }
  }, [items, isHydrated]);

  const lines = useMemo(() => resolveCartLines(items), [items]);
  const totalQuantity = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity, 0),
    [lines]
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
      if (!getCartProductMeta(handle)) {
        return { ok: false, error: "This product is no longer available." };
      }
      const safeQuantity = Math.max(1, Math.floor(quantity));

      if (maxAvailable !== undefined && maxAvailable <= 0) {
        return { ok: false, error: "Out of stock" };
      }

      const current = currentItems.current;
      const existing = current.find((item) => item.handle === handle);
      const nextQuantity = (existing?.quantity ?? 0) + safeQuantity;
      if (maxAvailable !== undefined && nextQuantity > maxAvailable) {
        return { ok: false, error: stockLimitMessage(maxAvailable) };
      }
      const next = existing ? current.map((item) => item.handle === handle
        ? { ...item, quantity: nextQuantity } : item) : [...current, { handle, quantity: safeQuantity }];
      const product = REVIEWED_META_PRODUCTS.find((entry) => entry.handle === handle);
      const action = product && typeof window !== "undefined" && window.location.pathname === product.path
        ? createMetaBrowserAction("AddToCart", [product.sku]) : null;
      if (action) pendingAdds.current.push({ handle, minimumQuantity: nextQuantity, action });
      currentItems.current = next;
      setItems(next);
      setIsOpen(true);
      return { ok: true };
    },
    []
  );

  const removeItem = useCallback((handle: string) => {
    const next = currentItems.current.filter((item) => item.handle !== handle);
    currentItems.current = next;
    setItems(next);
  }, []);

  const setItemQuantity = useCallback(
    (
      handle: string,
      quantity: number,
      maxAvailable?: number
    ): AddItemResult => {
      if (!getCartProductMeta(handle)) {
        return { ok: false, error: "This product is no longer available." };
      }
      const safeQuantity = Math.max(1, Math.floor(quantity));

      if (maxAvailable !== undefined && maxAvailable <= 0) {
        return { ok: false, error: "Out of stock" };
      }
      if (maxAvailable !== undefined && safeQuantity > maxAvailable) {
        return { ok: false, error: stockLimitMessage(maxAvailable) };
      }

      const next = currentItems.current.map((item) =>
          item.handle === handle ? { ...item, quantity: safeQuantity } : item
        );
      currentItems.current = next;
      setItems(next);
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
