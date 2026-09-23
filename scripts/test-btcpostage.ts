/**
 * Offline BTCPostage integration tests (mocked HTTP + pure helpers).
 * Run: npx tsx scripts/test-btcpostage.ts
 */
import { readFileSync } from "fs";
import { join } from "path";

import {
  BtcpostageApiError,
  buildCreatePurchaseFieldsForTest,
  createPurchase,
  getRates,
  retrievePurchase,
  verifyAddress,
} from "../lib/btcpostage/client";
import { getBtcpostagePublicConfig, isBtcpostageTestMode } from "../lib/btcpostage/config";
import { toPublicLabel } from "../lib/btcpostage/store";
import type { BtcpostageLabelRecord } from "../lib/btcpostage/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function mockFetch(sequence: Array<{ status?: number; body: string }>) {
  let i = 0;
  return async () => {
    const step = sequence[i++] ?? sequence[sequence.length - 1];
    return {
      ok: (step.status ?? 200) >= 200 && (step.status ?? 200) < 300,
      status: step.status ?? 200,
      text: async () => step.body,
    } as Response;
  };
}

async function testVerifyAddress() {
  const fetchImpl = mockFetch([
    {
      body: JSON.stringify({
        status: "success",
        is_valid: true,
        data: {
          address: {
            street1: "123 MAIN ST",
            street2: "",
            city: "PHOENIX",
            state: "AZ",
            zip: "85001-1234",
            country: "US",
            phone: "",
            residential: true,
          },
          verification: { is_valid: true, errors: [] },
        },
      }),
    },
  ]);

  process.env.BTCPOSTAGE_API_KEY = "test-key";
  process.env.BTCPOSTAGE_API_SECRET = "test-secret";

  const result = await verifyAddress(
    {
      street1: "123 Main St",
      city: "Phoenix",
      state: "AZ",
      zip: "85001",
      country: "US",
    },
    fetchImpl
  );
  assert(result.isValid, "address valid");
  assert(result.standardized?.street1 === "123 MAIN ST", "standardized street");
  assert(result.errors.length === 0, "no verification errors");
}

async function testGetRates() {
  const fetchImpl = mockFetch([
    {
      body: JSON.stringify([
        {
          service: "GroundAdvantage",
          service_display: "GroundAdvantage",
          rate: "3.12",
          carrier: "USPS",
          est_delivery_days: 3,
          currency: "USD",
        },
        {
          service: "Priority",
          service_display: "Priority",
          rate: "8.64",
          carrier: "USPS",
          est_delivery_days: 2,
          currency: "USD",
        },
      ]),
    },
  ]);

  const rates = await getRates({
    to: {
      name: "Test",
      street1: "123 Main",
      city: "Phoenix",
      state: "AZ",
      zip: "85001",
      country: "US",
    },
    from: {
      name: "PSL",
      street1: "1 Warehouse",
      city: "Phoenix",
      state: "AZ",
      zip: "85001",
      country: "US",
    },
    pkg: {
      weightLbs: 0,
      weightOz: 4,
      heightIn: 3,
      widthIn: 4,
      depthIn: 6,
      packageType: "Parcel",
    },
    fetchImpl,
  });
  assert(rates.length === 2, "two rates");
  assert(rates[0].carrier === "USPS", "carrier present");
  assert(rates[0].rate === "3.12", "postage price");
  assert(rates[0].estDeliveryDays === 3, "delivery days");
}

async function testCreatePurchaseTestMode() {
  const fields = buildCreatePurchaseFieldsForTest({
    carrier: "USPS",
    service: "GroundAdvantage",
    testMode: true,
  });
  assert(fields.test_mode === true, "test_mode included when enabled");
  const live = buildCreatePurchaseFieldsForTest({
    carrier: "USPS",
    service: "GroundAdvantage",
    testMode: false,
  });
  assert(!("test_mode" in live), "omit test_mode when false");

  const fetchImpl = mockFetch([
    {
      body: JSON.stringify({
        order_timestamp: "1563268442",
        order_id: "btcp-order-1",
        remaining_credits: 50,
        items: [
          {
            shipment_id: "shp_1",
            carrier: "usps",
            service: "GroundAdvantage",
            price: "3.12",
            currency: "USD",
            filename: "https://btcpostage.com/assets/labels/test.pdf",
            tracking_no: "9400111899223344556677",
          },
        ],
      }),
    },
  ]);

  const purchase = await createPurchase({
    to: {
      name: "Test",
      street1: "123 Main",
      city: "Phoenix",
      state: "AZ",
      zip: "85001",
      country: "US",
    },
    from: {
      name: "PSL",
      street1: "1 Warehouse",
      city: "Phoenix",
      state: "AZ",
      zip: "85001",
      country: "US",
    },
    pkg: {
      weightLbs: 0,
      weightOz: 4,
      heightIn: 3,
      widthIn: 4,
      depthIn: 6,
      packageType: "Parcel",
    },
    carrier: "USPS",
    service: "GroundAdvantage",
    testMode: true,
    fetchImpl,
  });
  assert(purchase.orderId === "btcp-order-1", "btcp order id");
  assert(purchase.items[0]?.trackingNo.startsWith("9400"), "tracking persisted");
  assert(purchase.items[0]?.filename.includes("labels"), "label url");
}

async function testRetrievePurchase() {
  const fetchImpl = mockFetch([
    {
      body: JSON.stringify({
        order_id: "btcp-order-1",
        items: [
          {
            shipment_id: "shp_1",
            carrier: "usps",
            service: "GroundAdvantage",
            price: "3.12",
            currency: "USD",
            filename: "https://btcpostage.com/assets/labels/test.pdf",
            tracking_no: "9400111899223344556677",
          },
        ],
      }),
    },
  ]);
  const purchase = await retrievePurchase("btcp-order-1", fetchImpl);
  assert(purchase.orderId === "btcp-order-1", "retrieve order id");
}

async function testUncertainFailureFlag() {
  const fetchImpl = async () => {
    throw new Error("network down");
  };
  try {
    await verifyAddress(
      {
        street1: "x",
        city: "y",
        state: "AZ",
        zip: "85001",
        country: "US",
      },
      fetchImpl as typeof fetch
    );
    assert(false, "should throw");
  } catch (e) {
    assert(e instanceof BtcpostageApiError, "api error type");
    assert(e.uncertain === true, "network failure is uncertain");
  }
}

function testPublicLabelAndDuplicateSemantics() {
  const purchased: BtcpostageLabelRecord = {
    pslOrderId: "psl_1",
    purchaseStatus: "purchased",
    btcpOrderId: "btcp-1",
    shipmentId: "shp_1",
    carrier: "usps",
    service: "GroundAdvantage",
    postageCost: 3.12,
    trackingNumber: "9400",
    labelUrl: "https://btcpostage.com/assets/labels/a.pdf",
    labelFormat: "PDF",
    testMode: false,
    purchasedAt: "2026-01-01T00:00:00.000Z",
    purchaseClaimedAt: null,
    lastError: null,
    verifiedStreet1: null,
    verifiedStreet2: null,
    verifiedCity: null,
    verifiedState: null,
    verifiedZip: null,
    verifiedCountry: null,
    weightLbs: 0,
    weightOz: 4,
    heightIn: 3,
    widthIn: 4,
    depthIn: 6,
    updatedAt: null,
  };
  const pub = toPublicLabel(purchased);
  assert(pub.isRealShipment === true, "real purchase is real shipment");
  assert(pub.trackingNumber === "9400", "tracking on public label");
  assert(
    !JSON.stringify(pub).toLowerCase().includes("secret"),
    "public label has no secrets"
  );

  const testLabel = toPublicLabel({ ...purchased, testMode: true });
  assert(testLabel.isRealShipment === false, "test label not real shipment");
}

function testSecretsNeverReachClientSources() {
  const root = process.cwd();
  const panel = readFileSync(
    join(root, "components/admin/btcpostage-order-panel.tsx"),
    "utf8"
  );
  const dash = readFileSync(
    join(root, "components/admin/admin-fulfillment-dashboard.tsx"),
    "utf8"
  );
  const route = readFileSync(
    join(root, "app/api/admin/btcpostage/route.ts"),
    "utf8"
  );
  const config = readFileSync(join(root, "lib/btcpostage/config.ts"), "utf8");

  assert(
    !/BTCPOSTAGE_API_SECRET/.test(panel) && !/BTCPOSTAGE_API_KEY/.test(panel),
    "panel never references API key/secret env"
  );
  assert(
    !/BTCPOSTAGE_API_SECRET/.test(dash),
    "dashboard never references API secret"
  );
  assert(
    /getBtcpostagePublicConfig/.test(route),
    "admin route uses public config helper"
  );
  assert(
    /Server-only credentials|Never pass to client/.test(config),
    "config documents server-only credentials"
  );

  const publicConfig = getBtcpostagePublicConfig();
  assert(
    !("key" in publicConfig) && !("secret" in publicConfig),
    "public config has no key/secret fields"
  );
}

function testTestModeEnv() {
  const prev = process.env.BTCPOSTAGE_TEST_MODE;
  process.env.BTCPOSTAGE_TEST_MODE = "true";
  assert(isBtcpostageTestMode() === true, "test mode true");
  process.env.BTCPOSTAGE_TEST_MODE = "false";
  assert(isBtcpostageTestMode() === false, "test mode false");
  if (prev === undefined) delete process.env.BTCPOSTAGE_TEST_MODE;
  else process.env.BTCPOSTAGE_TEST_MODE = prev;
}

function testDuplicatePurchaseGuardInServiceSource() {
  const service = readFileSync(
    join(process.cwd(), "lib/btcpostage/service.ts"),
    "utf8"
  );
  const store = readFileSync(
    join(process.cwd(), "lib/btcpostage/store.ts"),
    "utf8"
  );
  assert(/claimLabelPurchase/.test(service), "buy path claims purchase");
  assert(/already_purchased/.test(service), "duplicate purchase short-circuit");
  assert(/needs_review/.test(store), "uncertain path uses needs_review");
  assert(/markPurchaseNeedsReview/.test(service), "uncertain failure marked");
  assert(
    !/setOrderTracking/.test(service),
    "label purchase does not auto-mark shipped via setOrderTracking"
  );
}

async function main() {
  console.log("[test-btcpostage] running…");
  await testVerifyAddress();
  await testGetRates();
  await testCreatePurchaseTestMode();
  await testRetrievePurchase();
  await testUncertainFailureFlag();
  testPublicLabelAndDuplicateSemantics();
  testSecretsNeverReachClientSources();
  testTestModeEnv();
  testDuplicatePurchaseGuardInServiceSource();
  console.log("[test-btcpostage] all passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
