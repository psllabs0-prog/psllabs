import assert from "node:assert/strict";

import { CART_STORAGE_KEY } from "../lib/cart/constants";
import { normalizeCartItems } from "../lib/cart/normalize";
import { resolveCartLines } from "../lib/cart/products";
import { loadCartFromStorage, saveCartToStorage } from "../lib/cart/storage";
import type { CartLineItem } from "../lib/cart/types";

const storage = new Map<string, string>();
const windowBefore = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  },
});

const cases: { name: string; stored: CartLineItem[]; expected: CartLineItem[] }[] = [
  {
    name: "retired-only saved cart",
    stored: [
      { handle: "foundation", quantity: 2 },
      { handle: "cellular-energy", quantity: 1 },
      { handle: "recovery", quantity: 4 },
    ],
    expected: [],
  },
  {
    name: "mixed saved cart preserves active quantities and order",
    stored: [
      { handle: "foundation", quantity: 3 },
      { handle: "retatrutide", quantity: 2 },
      { handle: "mots-c", quantity: 1 },
      { handle: "unknown-product", quantity: 9 },
      { handle: "ghk-cu", quantity: 5 },
      { handle: "kpv", quantity: 1 },
    ],
    expected: [
      { handle: "retatrutide", quantity: 2 },
      { handle: "ghk-cu", quantity: 5 },
    ],
  },
  {
    name: "active-only saved cart survives hydration unchanged",
    stored: [{ handle: "bpc-157", quantity: 3 }],
    expected: [{ handle: "bpc-157", quantity: 3 }],
  },
];

try {
  for (const testCase of cases) {
    storage.set(CART_STORAGE_KEY, JSON.stringify(testCase.stored));
    const rawItems = loadCartFromStorage();
    const rawBefore = structuredClone(rawItems);
    const normalized = normalizeCartItems(rawItems);
    assert.deepEqual(normalized, testCase.expected, testCase.name);
    assert.deepEqual(rawItems, rawBefore, "Normalization does not mutate the loaded cart");

    const visible = resolveCartLines(normalized);
    assert.equal(visible.length, normalized.length, "Every retained item is visible and removable");
    assert.equal(
      visible.reduce((sum, line) => sum + line.quantity, 0),
      testCase.expected.reduce((sum, item) => sum + item.quantity, 0),
      "Badge quantity matches the visible active items",
    );

    saveCartToStorage(normalized);
    assert.deepEqual(JSON.parse(storage.get(CART_STORAGE_KEY)!), testCase.expected, "Unavailable products are removed from persistence");
    assert.deepEqual(normalizeCartItems(loadCartFromStorage()), testCase.expected, "Reloading preserves the repaired cart");
  }
} finally {
  if (windowBefore) Object.defineProperty(globalThis, "window", windowBefore);
  else Reflect.deleteProperty(globalThis, "window");
}

console.log("Cart normalization regressions passed: retired-only, mixed, active-only, visible counts and persisted reloads.");
