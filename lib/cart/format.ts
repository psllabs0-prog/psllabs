/** Format USD for display (shows cents when needed). */
export function formatPrice(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const cents = Math.round(rounded * 100) % 100;
  return cents === 0 ? `$${rounded}` : `$${rounded.toFixed(2)}`;
}
