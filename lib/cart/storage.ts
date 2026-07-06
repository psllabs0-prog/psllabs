import { CART_STORAGE_KEY } from "./constants";
import type { CartLineItem } from "./types";

function isCartLineItem(value: unknown): value is CartLineItem {
  if (!value || typeof value !== "object") return false;
  const item = value as CartLineItem;
  return (
    typeof item.handle === "string" &&
    typeof item.quantity === "number" &&
    item.quantity >= 1 &&
    Number.isFinite(item.quantity)
  );
}

export function loadCartFromStorage(): CartLineItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isCartLineItem)
      .map((item) => ({
        handle: item.handle,
        quantity: Math.max(1, Math.floor(item.quantity)),
      }));
  } catch {
    return [];
  }
}

export function saveCartToStorage(items: CartLineItem[]): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore quota / privacy errors
  }
}
