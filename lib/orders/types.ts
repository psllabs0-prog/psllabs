export type OrderStatus = "pending" | "paid" | "cancelled" | "failed";

export type OrderItem = {
  handle: string;
  name: string;
  strength: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type OrderShippingAddress = {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

export type Order = {
  orderId: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  currency: string;
  email: string;
  shipping: OrderShippingAddress;
  items: OrderItem[];
  subtotal: number;
  discountCode: string | null;
  discountAmount: number;
  taxRate: number;
  tax: number;
  shippingCost: number;
  total: number;
  invoiceId: string | null;
  invoiceCreatedAt: string | null;
  paidAt: string | null;
  emailSent: boolean;
  emailError: string | null;
  customerEmailSent: boolean;
  customerEmailError: string | null;
  stockDecremented: boolean;
};

// Safe subset returned to the browser (no email, invoice id, or internal flags).
export type PublicOrder = Pick<
  Order,
  | "orderId"
  | "createdAt"
  | "status"
  | "currency"
  | "items"
  | "shipping"
  | "subtotal"
  | "discountCode"
  | "discountAmount"
  | "shippingCost"
  | "total"
>;

export function toPublicOrder(order: Order): PublicOrder {
  return {
    orderId: order.orderId,
    createdAt: order.createdAt,
    status: order.status,
    currency: order.currency,
    items: order.items,
    shipping: order.shipping,
    subtotal: order.subtotal,
    discountCode: order.discountCode,
    discountAmount: order.discountAmount,
    shippingCost: order.shippingCost,
    total: order.total,
  };
}
