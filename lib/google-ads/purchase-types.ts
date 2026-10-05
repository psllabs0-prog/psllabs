/** Public allowlist: no customer, product, payment-provider or click identifiers. */
export type GoogleAdsPurchaseReceipt = {
  transactionId: string;
  value: number;
  currency: "USD";
};
