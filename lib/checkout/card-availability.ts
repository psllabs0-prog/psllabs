/**
 * Card checkout switch. While paused, the checkout hides the card option and /api/checkout/card/session
 * refuses new card sessions. A card payment that was already started can still finish (3-D Secure
 * return and the processor's webhooks are untouched). Bitcoin checkout is unaffected.
 */
export const CARD_CHECKOUT_PAUSED = true;

/** Shown to shoppers while card checkout is paused. */
export const CARD_CHECKOUT_PAUSED_MESSAGE = "Card payments are temporarily unavailable. Please pay with Bitcoin.";
