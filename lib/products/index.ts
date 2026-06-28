import { cellularEnergy } from "./data/cellular-energy";
import { foundation } from "./data/foundation";
import { glp3Rt } from "./data/glp-3-rt";
import { recovery } from "./data/recovery";
import { getOtherProducts as filterOthers } from "./shared";
import type { Product, ProductHandle } from "./types";

export const products: Record<ProductHandle, Product> = {
  foundation,
  "cellular-energy": cellularEnergy,
  recovery,
  "glp-3-rt": glp3Rt,
};

export const productHandles = Object.keys(products) as ProductHandle[];

export function getProduct(handle: string): Product | undefined {
  return products[handle as ProductHandle];
}

export function getOtherProducts(handle: string): Product[] {
  return filterOthers(handle, products);
}

export type {
  Product,
  ProductCitation,
  ProductFaq,
  ProductHandle,
  ProductHowToStep,
  ProductIngredient,
  ProductTesting,
} from "./types";
