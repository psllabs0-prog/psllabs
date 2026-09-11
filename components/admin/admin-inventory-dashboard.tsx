"use client";

import { useCallback, useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import type { AdminInventoryRow, StockHistoryRow } from "@/lib/inventory/store";
import type { SkuMonitorMetrics } from "@/lib/inventory/monitor/metrics";
import type { PipelineLotRow } from "@/lib/inventory/monitor/pipeline";
import type { PipelineLotStatus } from "@/lib/inventory/monitor/constants";

type AdminInventoryDashboardProps = {
  products: AdminInventoryRow[];
  history: StockHistoryRow[];
};

type MonitorPayload = {
  metrics: SkuMonitorMetrics[];
  lots: PipelineLotRow[];
  sheetsConfigured: boolean;
  assumptions: {
    moq: number;
    planningLeadDays: number;
    riskLeadDays: number;
    testingTurnaroundDays: number;
    testingCostLowUsd: number;
    testingCostHighUsd: number;
    reorderReviewDays: number;
    depletionWatchPct: number;
    absoluteLowThreshold: number;
  };
};

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function AdminInventoryDashboard({
  products: initialProducts,
  history,
}: AdminInventoryDashboardProps) {
  const [products, setProducts] = useState(initialProducts);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialProducts.map((row) => [row.handle, String(row.stock)]))
  );
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busyHandle, setBusyHandle] = useState<string | null>(null);

  const [monitor, setMonitor] = useState<MonitorPayload | null>(null);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [monitorBusy, setMonitorBusy] = useState(false);
  const [monitorMsg, setMonitorMsg] = useState<string | null>(null);

  const [newSku, setNewSku] = useState("");
  const [newQty, setNewQty] = useState("10");
  const [newRef, setNewRef] = useState("");
  const [newExpected, setNewExpected] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [pipelineMsg, setPipelineMsg] = useState<string | null>(null);

  const refreshMonitor = useCallback(async () => {
    setMonitorError(null);
    const res = await fetch("/api/admin/inventory/monitor");
    if (!res.ok) {
      setMonitorError("Failed to load inventory monitor.");
      return;
    }
    const json = (await res.json()) as MonitorPayload;
    setMonitor(json);
    if (!newSku && json.metrics[0]?.sku) {
      setNewSku(json.metrics[0].sku);
    }
  }, [newSku]);

  useEffect(() => {
    void refreshMonitor();
  }, [refreshMonitor]);

  async function handleUpdate(handle: string) {
    const stock = Number(drafts[handle]);
    if (!Number.isInteger(stock) || stock < 0) {
      setMessages((current) => ({
        ...current,
        [handle]: "Enter a non-negative whole number.",
      }));
      return;
    }

    setBusyHandle(handle);
    setMessages((current) => ({ ...current, [handle]: "" }));

    try {
      const res = await fetch("/api/admin/inventory/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, stock }),
      });
      const data = (await res.json()) as { error?: string; stock?: number };

      if (!res.ok) {
        setMessages((current) => ({
          ...current,
          [handle]: data.error ?? "Update failed.",
        }));
        return;
      }

      setProducts((current) =>
        current.map((row) =>
          row.handle === handle ? { ...row, stock: data.stock ?? stock } : row
        )
      );
      setMessages((current) => ({
        ...current,
        [handle]: "Stock updated.",
      }));
      void refreshMonitor();
    } catch {
      setMessages((current) => ({
        ...current,
        [handle]: "Update failed.",
      }));
    } finally {
      setBusyHandle(null);
    }
  }

  async function runMonitor() {
    setMonitorBusy(true);
    setMonitorMsg(null);
    try {
      const res = await fetch("/api/admin/inventory/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        alertsSent?: number;
        sheets?: { failed?: boolean; error?: string };
      };
      if (!res.ok || !json.ok) {
        setMonitorMsg(json.error ?? "Monitor run failed");
      } else {
        setMonitorMsg(
          `Monitor complete. Alerts sent: ${json.alertsSent ?? 0}. Sheets: ${
            json.sheets?.failed
              ? `failed (${json.sheets.error ?? "error"})`
              : "ok"
          }.`
        );
        await refreshMonitor();
      }
    } catch {
      setMonitorMsg("Monitor run failed");
    } finally {
      setMonitorBusy(false);
    }
  }

  async function createLot() {
    setPipelineBusy(true);
    setPipelineMsg(null);
    try {
      const res = await fetch("/api/admin/inventory/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          sku: newSku,
          quantityOrdered: Number(newQty),
          supplierLotReference: newRef || null,
          expectedReleaseAt: newExpected
            ? new Date(newExpected).toISOString()
            : null,
          notes: newNotes || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setPipelineMsg(json.error ?? "Create failed");
      } else {
        setPipelineMsg("Inbound lot created (NOT sellable).");
        setNewQty("10");
        setNewRef("");
        setNewExpected("");
        setNewNotes("");
        await refreshMonitor();
      }
    } catch {
      setPipelineMsg("Create failed");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function updateLot(
    lotId: number,
    status: PipelineLotStatus,
    extras?: Record<string, unknown>
  ) {
    setPipelineBusy(true);
    setPipelineMsg(null);
    try {
      const res = await fetch("/api/admin/inventory/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_stage", lotId, status, ...extras }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setPipelineMsg(json.error ?? "Update failed");
      } else {
        setPipelineMsg(`Lot ${lotId} → ${statusLabel(status)}`);
        await refreshMonitor();
      }
    } catch {
      setPipelineMsg("Update failed");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function releaseLot(lotId: number) {
    const ok = window.confirm(
      "RELEASE TO SELLABLE STOCK?\n\nThis permanently increases customer-facing sellable inventory and cannot be undone via a second release.\n\nOnly proceed after testing is complete and you intend units to be sellable."
    );
    if (!ok) return;

    setPipelineBusy(true);
    setPipelineMsg(null);
    try {
      const res = await fetch("/api/admin/inventory/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "release",
          lotId,
          confirmRelease: true,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        result?: { quantity?: number; newStock?: number };
      };
      if (!res.ok || !json.ok) {
        setPipelineMsg(json.error ?? "Release failed");
      } else {
        setPipelineMsg(
          `Released ${json.result?.quantity ?? "?"} units. New sellable=${json.result?.newStock ?? "?"}.`
        );
        window.location.reload();
      }
    } catch {
      setPipelineMsg("Release failed");
    } finally {
      setPipelineBusy(false);
    }
  }

  const metrics = monitor?.metrics ?? [];
  const lots = monitor?.lots ?? [];

  return (
    <div className="flex flex-col gap-10">
      <section className="premium-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linen px-5 py-4">
          <div>
            <h2 className="font-display text-xl font-bold text-ink">
              Inventory monitor
            </h2>
            <p className="mt-1 text-xs text-ash">
              Review signals only — never auto-orders, never auto-releases.
              Inbound / awaiting testing is NOT sellable.
            </p>
          </div>
          <button
            type="button"
            disabled={monitorBusy}
            onClick={() => void runMonitor()}
            className="rounded-pill bg-accent px-4 py-2 text-sm font-medium text-page transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {monitorBusy ? "Running…" : "Run inventory monitor"}
          </button>
        </div>
        {monitorMsg && (
          <p className="border-b border-linen px-5 py-3 text-sm text-ash">
            {monitorMsg}
          </p>
        )}
        {monitorError && (
          <p className="border-b border-linen px-5 py-3 text-sm text-red-700">
            {monitorError}
          </p>
        )}
        {monitor && (
          <p className="border-b border-linen px-5 py-2 text-xs text-ash">
            Assumptions: MOQ {monitor.assumptions.moq} · planning{" "}
            {monitor.assumptions.planningLeadDays}d · risk{" "}
            {monitor.assumptions.riskLeadDays}d · testing ~
            {monitor.assumptions.testingTurnaroundDays}d · test $
            {monitor.assumptions.testingCostLowUsd}–$
            {monitor.assumptions.testingCostHighUsd}/lot · absolute low &lt;{" "}
            {monitor.assumptions.absoluteLowThreshold} · Sheets{" "}
            {monitor.sheetsConfigured ? "configured" : "not configured"}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-linen bg-surface text-left text-ash">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SELLABLE</th>
                <th className="px-4 py-3 font-medium">INBOUND</th>
                <th className="px-4 py-3 font-medium">AWAITING TEST</th>
                <th className="px-4 py-3 font-medium">Sold 7/14/28</th>
                <th className="px-4 py-3 font-medium">Velocity</th>
                <th className="px-4 py-3 font-medium">Coverage</th>
                <th className="px-4 py-3 font-medium">Depletion</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Test $/u</th>
              </tr>
            </thead>
            <tbody>
              {metrics.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-ash">
                    Loading monitor…
                  </td>
                </tr>
              ) : (
                metrics.map((m) => {
                  const econ = Object.fromEntries(
                    m.testingEconomics.map((e) => [e.quantity, e])
                  );
                  return (
                    <tr
                      key={m.sku}
                      className="border-b border-linen last:border-b-0 align-top"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{m.productName}</div>
                        <div className="font-mono text-xs text-ash">{m.sku}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-ink">
                        {m.sellableStock}
                      </td>
                      <td className="px-4 py-3 font-mono text-ash">
                        {m.orderedInbound + m.inTransit}
                        <div className="text-[10px] uppercase tracking-wide">
                          not sellable
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-ash">
                        {m.awaitingTesting}
                        <div className="text-[10px] uppercase tracking-wide">
                          not sellable
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-ink">
                        {m.sold7d}/{m.sold14d}/{m.sold28d}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink">
                        {m.forecastConfidence === "INSUFFICIENT_SALES_DATA" ? (
                          <span>INSUFFICIENT SALES DATA</span>
                        ) : (
                          <>
                            <div>7d {fmtNum(m.avg7d, 3)}</div>
                            <div>14d {fmtNum(m.avg14d, 3)}</div>
                            <div>28d {fmtNum(m.avg28d, 3)}</div>
                            <div>plan {fmtNum(m.planningVelocity, 3)}</div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink">
                        {m.forecastConfidence === "INSUFFICIENT_SALES_DATA" ? (
                          "INSUFFICIENT SALES DATA"
                        ) : (
                          <>
                            <div>sellable DOS {fmtNum(m.daysSupply, 1)}</div>
                            <div>
                              plan adj {fmtNum(m.planningAdjustedDaysSupply, 1)}
                            </div>
                            <div>risk adj {fmtNum(m.riskAdjustedDaysSupply, 1)}</div>
                            <div>
                              out (sellable){" "}
                              {m.projectedStockoutAt
                                ? m.projectedStockoutAt.slice(0, 10)
                                : "—"}
                            </div>
                            <div>
                              out (plan){" "}
                              {m.planningAdjustedProjectedStockoutAt
                                ? m.planningAdjustedProjectedStockoutAt.slice(0, 10)
                                : "—"}
                            </div>
                            <div>
                              review{" "}
                              {m.reorderReviewAt
                                ? m.reorderReviewAt.slice(0, 10)
                                : "—"}
                            </div>
                            {m.minimumRiskWindowGap !== null && (
                              <div>gap {m.minimumRiskWindowGap}</div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <div>base {m.baselineStock}</div>
                        <div>
                          {m.depletionPct === null
                            ? "—"
                            : `${(m.depletionPct * 100).toFixed(1)}%`}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-ink">
                        {m.monitorStatus}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-ash">
                        <div>
                          @10 {fmtNum(econ[10]?.costPerUnitLow)}–
                          {fmtNum(econ[10]?.costPerUnitHigh)}
                        </div>
                        <div>
                          @25 {fmtNum(econ[25]?.costPerUnitLow)}–
                          {fmtNum(econ[25]?.costPerUnitHigh)}
                        </div>
                        <div>
                          @50 {fmtNum(econ[50]?.costPerUnitLow)}–
                          {fmtNum(econ[50]?.costPerUnitHigh)}
                        </div>
                        <div>
                          @100 {fmtNum(econ[100]?.costPerUnitLow)}–
                          {fmtNum(econ[100]?.costPerUnitHigh)}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-linen px-5 py-3 text-xs text-ash">
          Testing efficiency vs ~1-year shelf life, cash (100% upfront crypto),
          velocity, and existing/inbound stock must be balanced manually. MOQ 10
          does not mean reorder 10.
        </p>
      </section>

      <section className="premium-card overflow-hidden">
        <div className="border-b border-linen px-5 py-4">
          <h2 className="font-display text-xl font-bold text-ink">
            Inbound lots / pipeline
          </h2>
          <p className="mt-1 text-xs text-ash">
            Ordered · In transit · Received awaiting testing — never customer
            sellable until explicit RELEASE TO SELLABLE STOCK.
          </p>
        </div>
        <div className="grid gap-3 border-b border-linen px-5 py-4 md:grid-cols-6">
          <label className="text-xs text-ash md:col-span-2">
            SKU
            <select
              className="mt-1 h-10 w-full rounded-lg border border-linen bg-lab-white px-3 font-mono text-sm text-ink"
              value={newSku}
              onChange={(e) => setNewSku(e.target.value)}
            >
              {metrics.map((m) => (
                <option key={m.sku} value={m.sku}>
                  {m.productName} ({m.sku})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ash">
            Qty ordered
            <Input
              type="number"
              min={1}
              step={1}
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              className="mt-1 h-10 font-mono"
            />
          </label>
          <label className="text-xs text-ash">
            Supplier lot ref
            <Input
              value={newRef}
              onChange={(e) => setNewRef(e.target.value)}
              className="mt-1 h-10"
            />
          </label>
          <label className="text-xs text-ash">
            Expected release (optional)
            <Input
              type="date"
              value={newExpected}
              onChange={(e) => setNewExpected(e.target.value)}
              className="mt-1 h-10"
            />
          </label>
          <label className="text-xs text-ash md:col-span-4">
            Notes
            <Input
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="mt-1 h-10"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={pipelineBusy}
              onClick={() => void createLot()}
              className="h-10 rounded-pill bg-ink px-4 text-sm font-medium text-page disabled:opacity-50"
            >
              Add inbound lot
            </button>
          </div>
        </div>
        {pipelineMsg && (
          <p className="border-b border-linen px-5 py-3 text-sm text-ash">
            {pipelineMsg}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-linen bg-surface text-left text-ash">
              <tr>
                <th className="px-4 py-3 font-medium">Lot</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Dates</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lots.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-ash">
                    No pipeline lots yet. Add inbound quantities manually — do
                    not seed from projected post-release totals.
                  </td>
                </tr>
              ) : (
                lots.map((lot) => (
                  <tr
                    key={lot.id}
                    className="border-b border-linen last:border-b-0 align-top"
                  >
                    <td className="px-4 py-3 font-mono text-xs">#{lot.id}</td>
                    <td className="px-4 py-3 font-mono text-xs">{lot.sku}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      ordered {lot.quantityOrdered}
                      {lot.quantityReceived !== null && (
                        <div>recv {lot.quantityReceived}</div>
                      )}
                      {lot.testingCost !== null && (
                        <div>test ${lot.testingCost}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">
                      {statusLabel(lot.status)}
                      {lot.status !== "released" &&
                        lot.status !== "cancelled" && (
                          <div className="mt-1 text-[10px] uppercase tracking-wide text-ash">
                            not sellable
                          </div>
                        )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ash">
                      <div>ordered {lot.orderedAt.slice(0, 10)}</div>
                      {lot.expectedReleaseAt && (
                        <div>expected {lot.expectedReleaseAt.slice(0, 10)}</div>
                      )}
                      {lot.receivedAt && (
                        <div>received {lot.receivedAt.slice(0, 10)}</div>
                      )}
                      {lot.testingStartedAt && (
                        <div>testing {lot.testingStartedAt.slice(0, 10)}</div>
                      )}
                      {lot.releasedAt && (
                        <div>released {lot.releasedAt.slice(0, 10)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {lot.status === "ordered" && (
                          <button
                            type="button"
                            disabled={pipelineBusy}
                            className="rounded border border-linen px-2 py-1 text-xs"
                            onClick={() =>
                              void updateLot(lot.id, "in_transit")
                            }
                          >
                            Mark in transit
                          </button>
                        )}
                        {(lot.status === "ordered" ||
                          lot.status === "in_transit") && (
                          <button
                            type="button"
                            disabled={pipelineBusy}
                            className="rounded border border-linen px-2 py-1 text-xs"
                            onClick={() => {
                              const qty = window.prompt(
                                "Quantity received?",
                                String(lot.quantityOrdered)
                              );
                              if (!qty) return;
                              void updateLot(lot.id, "received_awaiting_testing", {
                                quantityReceived: Number(qty),
                                receivedAt: new Date().toISOString(),
                              });
                            }}
                          >
                            Record received
                          </button>
                        )}
                        {lot.status === "received_awaiting_testing" && (
                          <>
                            <button
                              type="button"
                              disabled={pipelineBusy}
                              className="rounded border border-linen px-2 py-1 text-xs"
                              onClick={() =>
                                void updateLot(
                                  lot.id,
                                  "received_awaiting_testing",
                                  { recordTestingStart: true }
                                )
                              }
                            >
                              Start testing
                            </button>
                            <button
                              type="button"
                              disabled={pipelineBusy}
                              className="rounded border border-linen px-2 py-1 text-xs"
                              onClick={() => {
                                const cost = window.prompt(
                                  "Testing cost USD (optional)?",
                                  lot.testingCost != null
                                    ? String(lot.testingCost)
                                    : "350"
                                );
                                if (cost === null) return;
                                void updateLot(
                                  lot.id,
                                  "received_awaiting_testing",
                                  {
                                    testingCost:
                                      cost.trim() === ""
                                        ? null
                                        : Number(cost),
                                  }
                                );
                              }}
                            >
                              Record test cost
                            </button>
                            <button
                              type="button"
                              disabled={pipelineBusy}
                              className="rounded bg-accent px-2 py-1 text-xs font-medium text-page"
                              onClick={() => void releaseLot(lot.id)}
                            >
                              RELEASE TO SELLABLE
                            </button>
                          </>
                        )}
                        {lot.status !== "released" &&
                          lot.status !== "cancelled" && (
                            <button
                              type="button"
                              disabled={pipelineBusy}
                              className="rounded border border-linen px-2 py-1 text-xs text-ash"
                              onClick={() =>
                                void updateLot(lot.id, "cancelled")
                              }
                            >
                              Cancel
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="premium-card overflow-hidden">
        <div className="border-b border-linen px-5 py-4">
          <h2 className="font-display text-xl font-bold text-ink">
            Active inventory (SELLABLE)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-linen bg-surface text-left text-ash">
              <tr>
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium">Stock</th>
                <th className="px-5 py-3 font-medium">Set level</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {products.map((row) => (
                <tr key={row.handle} className="border-b border-linen last:border-b-0">
                  <td className="px-5 py-4 font-medium text-ink">{row.name}</td>
                  <td className="px-5 py-4 font-mono text-xs text-ash">
                    {row.sku ?? "—"}
                  </td>
                  <td className="px-5 py-4 font-mono text-ink">{row.stock}</td>
                  <td className="px-5 py-4">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={drafts[row.handle] ?? ""}
                      onChange={(e) =>
                        setDrafts((current) => ({
                          ...current,
                          [row.handle]: e.target.value,
                        }))
                      }
                      className="h-10 w-28 rounded-lg border-linen bg-lab-white px-3 font-mono"
                    />
                  </td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      disabled={busyHandle === row.handle}
                      onClick={() => void handleUpdate(row.handle)}
                      className="rounded-pill bg-accent px-4 py-2 text-sm font-medium text-page transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyHandle === row.handle ? "Saving…" : "Update"}
                    </button>
                    {messages[row.handle] && (
                      <p className="mt-2 text-xs text-ash">{messages[row.handle]}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="premium-card overflow-hidden">
        <div className="border-b border-linen px-5 py-4">
          <h2 className="font-display text-xl font-bold text-ink">
            Recent stock changes
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-linen bg-surface text-left text-ash">
              <tr>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-6 text-ash">
                    No stock changes recorded yet.
                  </td>
                </tr>
              ) : (
                history.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-linen last:border-b-0"
                  >
                    <td className="px-5 py-4 text-ink">
                      {new Date(entry.changedAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-ash">
                      {entry.sku ?? entry.handle}
                    </td>
                    <td className="px-5 py-4 font-mono text-ink">
                      {entry.oldStock} → {entry.newStock}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
