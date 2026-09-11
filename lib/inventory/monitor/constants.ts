/** Verified PSL supplier / testing planning assumptions (Phase 2). */

export const INVENTORY_MOQ = 10;

export const PLANNING_LEAD_DAYS = 22;
export const RISK_LEAD_DAYS = 35;
export const TESTING_TURNAROUND_DAYS = 14;

export const REORDER_REVIEW_DAYS = 35;
export const DEPLETION_WATCH_PCT = 0.25;

export const TESTING_COST_LOW_USD = 250;
export const TESTING_COST_HIGH_USD = 500;

export const CANDIDATE_LOT_SIZES = [10, 25, 50, 100] as const;

/** Minimum legitimate units + calendar days before normal forecasting. */
export const MIN_UNITS_FOR_FORECAST = 3;
export const MIN_DAYS_FOR_FORECAST = 7;

export const INVENTORY_MONITOR_SHEET_TAB =
  process.env.GOOGLE_SHEETS_INVENTORY_TAB?.trim() || "Inventory_Monitor";

export type PipelineLotStatus =
  | "ordered"
  | "in_transit"
  | "received_awaiting_testing"
  | "released"
  | "cancelled";

export type ForecastConfidence = "INSUFFICIENT_SALES_DATA" | "RELIABLE";

export type MonitorStatusFlag =
  | "OK"
  | "INSUFFICIENT_SALES_DATA"
  | "DEPLETION_WATCH"
  | "REORDER_REVIEW"
  | "ABSOLUTE_LOW_STOCK";
