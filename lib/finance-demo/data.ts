import "server-only";

import fixture from "./fixture.json";
import { summarizeDemo, type DemoFixture } from "./model";

/** Imported only after the existing admin-session check. Never exported through an API. */
export function getFinanceDemo() {
  const data: DemoFixture = fixture;
  return { data, summary: summarizeDemo(data) };
}
