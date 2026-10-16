/** Retired: the owner chose to run the fake-order test manually. */
if (process.env.PSL_FULFILLMENT_QA) throw new Error("Automated fulfillment QA is disabled. Use the authenticated manual test page; builds cannot create labels or send test mail.");
