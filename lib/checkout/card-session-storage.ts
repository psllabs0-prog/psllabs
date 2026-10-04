export type TagadaCardSession = {
  orderId: string;
  checkoutToken: string;
  sessionToken: string | null;
  storeId: string;
  customer: { email: string; firstName: string; lastName: string };
  shippingAddress: { line1: string; city: string; state: string; postalCode: string; country: string };
  items: Array<{ variantId: string; quantity: number }>;
  shippingCost: number;
  total: number;
  cartFingerprint: string;
};

export type CardConfirmationHints = {
  paymentId?: string;
  tagadaOrderId?: string;
  checkoutSessionId?: string;
};

export type StoredCardCheckout = {
  version: 1;
  createdAt: number;
  expiresAt: number;
  orderId: string;
  session: TagadaCardSession | null;
  phase: "ready" | "processing" | "confirming";
  confirmation: CardConfirmationHints | null;
  reportedSuccess: boolean;
};

export const CARD_SESSION_KEY = "psl:card-checkout:v1";
export const CARD_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type ObjectValue = Record<string, unknown>;

function object(value: unknown): ObjectValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as ObjectValue : null;
}

function exactKeys(value: ObjectValue, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function string(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

export function cardCartFingerprint(lines: Array<{ handle: string; quantity: number; unitPrice: number }>): string {
  return JSON.stringify(lines.map(({ handle, quantity, unitPrice }) => ({ handle, quantity, unitPrice }))
    .sort((left, right) => left.handle < right.handle ? -1 : left.handle > right.handle ? 1 : 0));
}

export function cardSessionMatchesCart(session: TagadaCardSession, lines: Array<{ handle: string; quantity: number; unitPrice: number }>): boolean {
  return session.cartFingerprint === cardCartFingerprint(lines);
}

/** Project an explicit allowlist; caller objects are never serialized wholesale. */
export function sanitizeCardSession(value: unknown): TagadaCardSession | null {
  const raw = object(value);
  const customer = object(raw?.customer);
  const address = object(raw?.shippingAddress);
  if (!raw || !customer || !address || !string(raw.orderId, 150) ||
      !string(raw.checkoutToken, 1024) || !string(raw.storeId, 150) ||
      !string(raw.cartFingerprint, 8192) ||
      !(raw.sessionToken === null || string(raw.sessionToken, 8192)) ||
      !string(customer.email, 320) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) ||
      !string(customer.firstName, 150) || !string(customer.lastName, 150) ||
      !string(address.line1) || !string(address.city, 150) || !string(address.state, 100) ||
      !string(address.postalCode, 30) || !string(address.country, 2) ||
      !/^[A-Z]{2}$/.test(address.country) ||
      typeof raw.shippingCost !== "number" || !Number.isFinite(raw.shippingCost) ||
      raw.shippingCost < 0 || raw.shippingCost > 10000 ||
      typeof raw.total !== "number" || !Number.isFinite(raw.total) || raw.total <= 0 || raw.total > 1000000 ||
      !Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > 50) return null;

  const items: TagadaCardSession["items"] = [];
  for (const item of raw.items) {
    const line = object(item);
    if (!line || !string(line.variantId, 150) || typeof line.quantity !== "number" ||
        !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 100) return null;
    items.push({ variantId: line.variantId, quantity: line.quantity });
  }
  return {
    orderId: raw.orderId, checkoutToken: raw.checkoutToken, sessionToken: raw.sessionToken,
    storeId: raw.storeId,
    customer: { email: customer.email, firstName: customer.firstName, lastName: customer.lastName },
    shippingAddress: {
      line1: address.line1, city: address.city, state: address.state,
      postalCode: address.postalCode, country: address.country,
    },
    items, shippingCost: raw.shippingCost, total: raw.total, cartFingerprint: raw.cartFingerprint,
  };
}

/** A browser safeguard before charging; server verification remains authoritative. */
export function cardSessionReadyToCharge(session: TagadaCardSession, providerValue: unknown, expectedSessionId: string): boolean {
  const provider = object(providerValue);
  const totals = object(provider?.totals);
  return !!provider && !!totals && string(expectedSessionId, 150) &&
    provider.id === expectedSessionId && provider.storeId === session.storeId &&
    provider.checkoutToken === session.checkoutToken && provider.currency === "USD" && totals.currency === "USD" &&
    typeof totals.total === "number" && Number.isSafeInteger(totals.total) && totals.total > 0 &&
    Number.isFinite(session.total) && session.total > 0 && totals.total === Math.round(session.total * 100);
}

export function sanitizeConfirmationHints(value: unknown): CardConfirmationHints | null {
  const raw = object(value);
  if (!raw || !exactKeys(raw, ["paymentId", "tagadaOrderId", "checkoutSessionId"])) return null;
  const result: CardConfirmationHints = {};
  if (raw.paymentId !== undefined) {
    if (!string(raw.paymentId, 150) || !/^pay(?:ment)?_[A-Za-z0-9_-]+$/.test(raw.paymentId)) return null;
    result.paymentId = raw.paymentId;
  }
  if (raw.tagadaOrderId !== undefined) {
    if (!string(raw.tagadaOrderId, 150) || !/^(?:ord|order)_[A-Za-z0-9_-]+$/.test(raw.tagadaOrderId)) return null;
    result.tagadaOrderId = raw.tagadaOrderId;
  }
  if (raw.checkoutSessionId !== undefined) {
    if (!string(raw.checkoutSessionId, 150)) return null;
    result.checkoutSessionId = raw.checkoutSessionId;
  }
  return result.paymentId || result.tagadaOrderId ? result : null;
}

export function parseCardCheckout(raw: string | null, now = Date.now()): StoredCardCheckout | null {
  if (!raw || raw.length > 30000) return null;
  try {
    const value = object(JSON.parse(raw));
    if (!value || !exactKeys(value, ["version", "createdAt", "expiresAt", "orderId", "session", "phase", "confirmation", "reportedSuccess"]) ||
        value.version !== 1 || typeof value.createdAt !== "number" ||
        !Number.isSafeInteger(value.createdAt) || value.createdAt > now || value.createdAt < 0 ||
        value.expiresAt !== value.createdAt + CARD_SESSION_TTL_MS ||
        !string(value.orderId, 150) ||
        !["ready", "processing", "confirming"].includes(String(value.phase)) ||
        typeof value.reportedSuccess !== "boolean") return null;
    const confirmation = value.confirmation === null ? null : sanitizeConfirmationHints(value.confirmation);
    if ((value.confirmation !== null && !confirmation) ||
        (value.phase === "confirming" && !confirmation) ||
        (value.phase === "ready" && (confirmation || value.reportedSuccess)) ||
        (value.reportedSuccess && !confirmation)) return null;
    if (value.session === null) {
      if (value.phase === "ready" || (value.expiresAt as number) > now) return null;
      return { version: 1, createdAt: value.createdAt, expiresAt: value.expiresAt as number,
        orderId: value.orderId, session: null, phase: value.phase as StoredCardCheckout["phase"],
        confirmation, reportedSuccess: value.reportedSuccess };
    }
    const storedSession = object(value.session);
    if (!storedSession || !exactKeys(storedSession, ["orderId", "checkoutToken", "sessionToken", "storeId", "customer", "shippingAddress", "items", "shippingCost", "total", "cartFingerprint"]) ||
        !exactKeys(object(storedSession.customer) ?? {}, ["email", "firstName", "lastName"]) ||
        !exactKeys(object(storedSession.shippingAddress) ?? {}, ["line1", "city", "state", "postalCode", "country"]) ||
        !Array.isArray(storedSession.items) || !storedSession.items.every((line) =>
          !!object(line) && exactKeys(object(line)!, ["variantId", "quantity"]))) return null;
    const session = sanitizeCardSession(storedSession);
    if (!session || session.orderId !== value.orderId) return null;
    if ((value.expiresAt as number) <= now && value.phase === "ready") return null;
    return {
      version: 1, createdAt: value.createdAt, expiresAt: value.expiresAt as number,
      orderId: value.orderId, phase: value.phase as StoredCardCheckout["phase"],
      session: (value.expiresAt as number) <= now ? null : session, confirmation,
      reportedSuccess: value.reportedSuccess,
    };
  } catch { return null; }
}

export function getCardReturnHints(search: string): CardConfirmationHints | null {
  const params = new URLSearchParams(search);
  if (params.get("paymentAction") !== "requireAction") return null;
  return sanitizeConfirmationHints({ paymentId: params.get("paymentId") });
}

/** Cached immutable snapshots support useSyncExternalStore without hydration drift. */
export function createCardSessionStore(
  getStorage: () => StorageLike | null,
  now: () => number = Date.now,
) {
  let loaded = false;
  let snapshot: StoredCardCheckout | null = null;
  const listeners = new Set<() => void>();
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  function storage(): StorageLike | null {
    try { return getStorage(); } catch { return null; }
  }
  function getSnapshot() {
    if (!loaded) {
      loaded = true;
      try { snapshot = parseCardCheckout(storage()?.getItem(CARD_SESSION_KEY) ?? null, now()); }
      catch { snapshot = null; }
    }
    if (snapshot?.session && snapshot.expiresAt <= now()) {
      snapshot = snapshot.phase === "ready" ? null : { ...snapshot, session: null };
    }
    return snapshot;
  }
  function publish(value: StoredCardCheckout | null) {
    loaded = true;
    snapshot = value;
    let saved = false;
    try {
      const target = storage();
      if (value && target) {
        const serialized = JSON.stringify(value);
        target.setItem(CARD_SESSION_KEY, serialized);
        saved = target.getItem(CARD_SESSION_KEY) === serialized;
      } else if (!value && target) {
        target.removeItem(CARD_SESSION_KEY);
        saved = target.getItem(CARD_SESSION_KEY) === null;
      }
    } catch {
      // Preserve an already durable unresolved lock. A stale ready record must
      // be removed before a charge can start; markProcessing fails closed.
      try {
        const target = storage();
        const previous = parseCardCheckout(target?.getItem(CARD_SESSION_KEY) ?? null, now());
        if (!previous || previous.phase === "ready") target?.removeItem(CARD_SESSION_KEY);
      } catch { /* storage is unavailable */ }
    }
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = undefined;
    if (value?.session && listeners.size) {
      expiryTimer = setTimeout(() => publish(value.phase === "ready" ? null : { ...value, session: null }), Math.max(0, value.expiresAt - now()));
    }
    listeners.forEach((listener) => listener());
    return saved;
  }
  return {
    getSnapshot,
    getServerSnapshot: (): StoredCardCheckout | null => null,
    subscribe(listener: () => void) {
      listeners.add(listener);
      const value = getSnapshot();
      // Clear invalid/expired saved data after subscribing, outside React render.
      if (!value) {
        try { storage()?.removeItem(CARD_SESSION_KEY); } catch { /* storage may be disabled */ }
      } else if (!value.session) {
        publish(value);
      } else if (!expiryTimer) {
        expiryTimer = setTimeout(() => publish(value.phase === "ready" ? null : { ...value, session: null }), Math.max(0, value.expiresAt - now()));
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size && expiryTimer) { clearTimeout(expiryTimer); expiryTimer = undefined; }
      };
    },
    start(sessionValue: unknown) {
      if (getSnapshot()?.phase && getSnapshot()?.phase !== "ready") return false;
      publish(null);
      const session = sanitizeCardSession(sessionValue);
      if (!session) return false;
      const createdAt = now();
      publish({ version: 1, createdAt, expiresAt: createdAt + CARD_SESSION_TTL_MS,
        orderId: session.orderId, session, phase: "ready", confirmation: null, reportedSuccess: false });
      return true;
    },
    markProcessing(orderId: string) {
      const current = getSnapshot();
      if (!current?.session || current.orderId !== orderId || current.phase !== "ready") return false;
      if (!publish({ ...current, phase: "processing" })) {
        // No charge has started. Keep the ready form in memory so the customer
        // can enable storage or cancel, but never proceed without recovery.
        snapshot = current;
        listeners.forEach((listener) => listener());
        return false;
      }
      return true;
    },
    rememberConfirmation(orderId: string, hintsValue: unknown, reportedSuccess = false) {
      const current = getSnapshot();
      const hints = sanitizeConfirmationHints(hintsValue);
      if (!current || current.orderId !== orderId || !hints) return false;
      publish({ ...current, phase: "confirming", confirmation: hints,
        reportedSuccess: current.reportedSuccess || reportedSuccess });
      return true;
    },
    clear(orderId?: string) {
      if (!orderId || getSnapshot()?.orderId === orderId) publish(null);
    },
  };
}

export const cardSessionStore = createCardSessionStore(() =>
  typeof window === "undefined" ? null : window.sessionStorage,
);

type ConfirmationResponse = { status: number; json: () => Promise<unknown> };
export type CardConfirmationResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string; retryable: boolean };

/** Only confirmation is retried. This function cannot tokenize or charge a card. */
export async function retryCardConfirmation(
  orderId: string,
  hints: CardConfirmationHints,
  request: (payload: { orderId: string } & CardConfirmationHints) => Promise<ConfirmationResponse>,
  pause: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<CardConfirmationResult> {
  const safeHints = sanitizeConfirmationHints(hints);
  if (!string(orderId, 150) || !safeHints) {
    return { ok: false, error: "We need your original payment reference to confirm this order. Contact support.", retryable: false };
  }
  let error = "We couldn't confirm your order yet. Retry order confirmation or contact support with your order ID.";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await pause(attempt * 1000);
    try {
      const response = await request({ orderId, ...safeHints });
      const data = object(await response.json());
      if (response.status >= 200 && response.status < 300 && response.status !== 202 &&
          data?.redirectTo === `/success?orderId=${encodeURIComponent(orderId)}`) {
        return { ok: true, redirectTo: data.redirectTo as string };
      }
      if (string(data?.error, 1000)) error = data.error;
      if (response.status !== 202 && response.status < 500) return { ok: false, error, retryable: false };
    } catch { /* Network interruption retries the same confirmation payload. */ }
  }
  return { ok: false, error, retryable: true };
}
