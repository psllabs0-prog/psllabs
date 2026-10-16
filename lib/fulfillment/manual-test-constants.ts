import type { BtcpostagePackage } from "@/lib/btcpostage/types";

export const MANUAL_TEST_SCHEMA = "psl_fulfillment_manual_qa_20261016";
export const MANUAL_TEST_ORDER = "psl_manual_qa_luke_20261016";
export const MANUAL_TEST_RECIPIENT = "lukeghaz@gmail.com";
export const MANUAL_TEST_PACKAGE: BtcpostagePackage = { weightLbs: 0, weightOz: 8, heightIn: 3, widthIn: 4, depthIn: 6, packageType: "Parcel" };
