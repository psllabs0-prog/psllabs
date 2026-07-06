export type CartLineItem = {
  handle: string;
  quantity: number;
};

export type CartProductMeta = {
  handle: string;
  name: string;
  strength: string;
  unitPrice: number;
  imageSrc: string;
  imageAlt: string;
};

export type CartLineWithMeta = CartLineItem & CartProductMeta;

export type ShippingDisplay = {
  message: string;
  isFreeShipping: boolean;
};

export type CheckoutFormData = {
  email: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};
