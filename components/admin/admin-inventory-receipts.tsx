"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { Input } from "@/components/ui/input";
import type { InventoryReceipt, InventoryReceiptInput, InventoryReceiptSnapshot } from "@/lib/inventory/receipt-types";

export type ReceiptSnapshot = InventoryReceiptSnapshot;
type SavedReceipt = InventoryReceipt;
type ReceiptRequest = InventoryReceiptInput;
type ReceiptLine = InventoryReceiptInput["lines"][number];
type DraftLine = { key: number; sku: string; quantity: string; unitCost: string };

const endpoint = "/api/admin/inventory/receipts";
const control = "h-11 rounded-lg border border-linen bg-lab-white px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const secondary = "rounded-lg border border-linen px-3 py-2 text-sm text-ink hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50";
const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
const lineValue = (line: ReceiptLine) => Math.round(line.quantity * line.unitCostUsd * 100) / 100;
const receiptValue = (lines: ReceiptLine[]) => lines.reduce((sum, line) => sum + Math.round(lineValue(line) * 100), 0) / 100;
const referenceKey = (value: string) => value.normalize("NFKC").trim().toUpperCase();

function matchesRequest(receipt: SavedReceipt, request: ReceiptRequest) {
  const lineKey = (values: ReceiptLine[]) => JSON.stringify(values.map((line) => [line.sku, line.quantity, Math.round(line.unitCostUsd * 100)]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  return lineKey(receipt.lines) === lineKey(request.lines) && receipt.sourceNote === request.sourceNote &&
    receipt.releaseToSellable === request.releaseToSellable &&
    JSON.stringify([...receipt.closedInboundLotIds].sort((a, b) => a - b)) === JSON.stringify([...request.closeInboundLotIds].sort((a, b) => a - b));
}

async function readSnapshot(reference?: string, signal?: AbortSignal): Promise<ReceiptSnapshot> {
  const response = await fetch(reference ? `${endpoint}?reference=${encodeURIComponent(reference)}` : endpoint, {
    cache: "no-store",
    credentials: "same-origin",
    signal: signal ?? AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(response.status === 401 ? "Sign in again to view received inventory." : "Unable to read saved receipts. Try checking again.");
  const result = await response.json() as ReceiptSnapshot;
  if (!Array.isArray(result.products) || !Array.isArray(result.receipts) || !Array.isArray(result.openInboundLots)) {
    throw new Error("The saved receipt response could not be verified.");
  }
  return result;
}

export function AdminInventoryReceipts({
  onRecorded,
  hasUnsavedStockEdits = false,
}: {
  onRecorded: (snapshot: ReceiptSnapshot) => void;
  hasUnsavedStockEdits?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<ReceiptSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ key: 0, sku: "", quantity: "", unitCost: "" }]);
  const nextKey = useRef(1);
  const [releaseToSellable, setReleaseToSellable] = useState(false);
  const [closeInboundLotIds, setCloseInboundLotIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [uncertainRequest, setUncertainRequest] = useState<ReceiptRequest | null>(null);
  const [saved, setSaved] = useState<SavedReceipt | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await readSnapshot(undefined, signal));
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Unable to load received inventory.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void readSnapshot(undefined, controller.signal).then((data) => {
      if (!controller.signal.aborted) setSnapshot(data);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load received inventory.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, []);

  const locked = busy || uncertainRequest !== null || saved !== null;
  const parsedLines = lines.map((line) => ({ sku: line.sku, quantity: Number(line.quantity), unitCostUsd: Number(line.unitCost) }));
  const validLines = lines.length > 0 && lines.every((line, index) =>
    Boolean(line.sku) && line.quantity.trim() !== "" && Number.isSafeInteger(parsedLines[index].quantity) && parsedLines[index].quantity > 0 && parsedLines[index].quantity <= 1_000_000 &&
    line.unitCost.trim() !== "" && Number.isFinite(parsedLines[index].unitCostUsd) && parsedLines[index].unitCostUsd > 0 && parsedLines[index].unitCostUsd <= 1_000_000 &&
    Math.abs(parsedLines[index].unitCostUsd * 100 - Math.round(parsedLines[index].unitCostUsd * 100)) < 0.00001,
  );
  const duplicateSku = new Set(lines.map((line) => line.sku).filter(Boolean)).size !== lines.filter((line) => line.sku).length;
  const totalVials = validLines ? parsedLines.reduce((sum, line) => sum + line.quantity, 0) : 0;
  const totalCost = validLines ? receiptValue(parsedLines) : 0;

  function updateLine(key: number, field: "sku" | "quantity" | "unitCost", value: string) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, [field]: value } : line));
  }

  function confirmSaved(data: ReceiptSnapshot, receipt: SavedReceipt, reconciled: boolean) {
    setSnapshot(data);
    setSaved(receipt);
    setUncertainRequest(null);
    setError(null);
    setMessage(`${reconciled ? "Saved receipt found. Inventory has not been added again." : "Received inventory recorded."}${hasUnsavedStockEdits ? " Your other unsaved stock edits were kept." : ""}`);
    onRecorded(data);
  }

  async function reconcile(request: ReceiptRequest) {
    const data = await readSnapshot(request.reference);
    setSnapshot(data);
    const receipt = data.receipts.find((item) => referenceKey(item.reference) === referenceKey(request.reference));
    if (!receipt) {
      setError("A saved receipt has not been confirmed. No automatic retry was sent. Keep this reference and check saved status again before recording anything else.");
      return false;
    }
    if (!matchesRequest(receipt, request)) {
      setError("This reference belongs to a different saved receipt. No further inventory was added by this status check. Review the saved history before recording this shipment.");
      return false;
    }
    confirmSaved(data, receipt, true);
    return true;
  }

  async function checkSavedStatus() {
    if (!uncertainRequest || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await reconcile(uncertainRequest);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to check saved status.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || locked || !snapshot) return;
    if (reference.trim().length < 3 || !sourceNote.trim() || !validLines || duplicateSku) {
      setError("Add a reference, choose each product once, and enter whole vial quantities with a valid purchase cost per vial.");
      return;
    }
    const request: ReceiptRequest = {
      reference: reference.trim(), sourceNote: sourceNote.trim(), lines: parsedLines,
      releaseToSellable, closeInboundLotIds,
    };
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    let confirmedResponse = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(endpoint, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request), signal: controller.signal,
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        if (response.status < 500) {
          setError(result.error ?? "The receipt was not accepted. Review the entries.");
          return;
        }
        throw new Error("The receipt response could not be confirmed.");
      }
      confirmedResponse = true;
      const data = await readSnapshot(request.reference);
      const receipt = data.receipts.find((item) => referenceKey(item.reference) === referenceKey(request.reference));
      if (!receipt) throw new Error("The receipt could not be found after recording.");
      if (!matchesRequest(receipt, request)) throw new Error("The saved receipt does not match these entries.");
      confirmSaved(data, receipt, false);
    } catch {
      setUncertainRequest(request);
      try {
        await reconcile(request);
      } catch {
        setError(confirmedResponse
          ? "The server confirmed recording, but the updated totals could not be loaded. Check saved status; do not record this shipment again."
          : "The outcome is not confirmed. No automatic retry was sent. Check saved status before doing anything else with this receipt.");
      }
    } finally {
      window.clearTimeout(timeout);
      busyRef.current = false;
      setBusy(false);
    }
  }

  return <section className="premium-card overflow-hidden" aria-labelledby="inventory-receipts-title">
    <div className="border-b border-linen px-5 py-4">
      <h2 id="inventory-receipts-title" className="font-display text-xl font-bold text-ink">Receive purchased inventory</h2>
      <p className="mt-1 text-xs leading-relaxed text-ash">Add a received shipment to existing stock and save its purchase costs. Quantities below are individual vials, not kits. This does not pay a supplier or create a public product listing.</p>
    </div>
    {loading && <p className="px-5 py-4 text-sm text-ash" role="status">Loading inventory and recent receipts…</p>}
    {error && <p className="mx-5 my-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-ink" role="alert">{error}</p>}
    {!snapshot && !loading && <div className="px-5 pb-4"><button type="button" className={secondary} onClick={() => void reload()}>Try loading again</button></div>}
    {message && <p className="mx-5 my-4 rounded-lg border border-accent/40 px-4 py-3 text-sm text-ink" role="status">{message}</p>}
    {uncertainRequest && <div className="px-5 pb-4"><button type="button" disabled={busy} className={secondary} onClick={() => void checkSavedStatus()}>{busy ? "Checking…" : "Check saved status"}</button><p className="mt-2 break-words text-xs text-ash">Reference: {uncertainRequest.reference}. This button only reads saved records.</p></div>}
    {snapshot && !saved && <form onSubmit={(event) => void submit(event)} className="space-y-5 px-5 py-5">
      <fieldset disabled={locked} className="space-y-5 disabled:opacity-70">
        <legend className="sr-only">Received shipment details</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 text-sm text-ash">
            <label htmlFor="received-inventory-reference">Receipt or shipment reference</label>
            <Input id="received-inventory-reference" aria-describedby="received-inventory-reference-help" required minLength={3} maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} autoComplete="off" className={control} />
            <p id="received-inventory-reference-help" className="text-xs">Use a unique reference for this purchase. The same reference cannot add stock twice.</p>
          </div>
          <label className="space-y-1 text-sm text-ash"><span>Source notes</span><Input required maxLength={2000} value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} autoComplete="off" className={control} placeholder="Supplier, invoice or receiving notes" /></label>
        </div>
        <div className="space-y-3">
          {lines.map((line, index) => <div key={line.key} className="grid items-end gap-3 rounded-lg border border-linen p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="min-w-0 space-y-1 text-xs text-ash"><span>Product {index + 1} · exact size</span><select required value={line.sku} onChange={(event) => updateLine(line.key, "sku", event.target.value)} className={`${control} w-full`}><option value="">Choose product and size</option>{snapshot.products.map((product) => <option key={product.sku} value={product.sku}>{product.name} · {product.sku}{product.listedForSale ? "" : " · not listed"}</option>)}</select></label>
            <label className="space-y-1 text-xs text-ash"><span>Individual vials received</span><Input required type="number" min={1} max={1000000} step={1} value={line.quantity} onChange={(event) => updateLine(line.key, "quantity", event.target.value)} className={control} /></label>
            <label className="space-y-1 text-xs text-ash"><span>Purchase cost per vial · USD</span><Input required type="number" min="0.01" max={1000000} step="0.01" value={line.unitCost} onChange={(event) => updateLine(line.key, "unitCost", event.target.value)} className={control} /></label>
            <button type="button" disabled={lines.length === 1} aria-label={`Remove product ${index + 1}`} className={`${secondary} min-h-11`} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>Remove</button>
          </div>)}
          <button type="button" disabled={lines.length >= snapshot.products.length} className={secondary} onClick={() => setLines((current) => [...current, { key: nextKey.current++, sku: "", quantity: "", unitCost: "" }])}>Add product</button>
          {duplicateSku && <p className="text-sm text-amber-300">Choose each product once; combine its vial quantity on one line.</p>}
        </div>
        <div className="rounded-lg border border-linen bg-surface p-4 text-sm text-ink" aria-live="polite"><strong>{totalVials} vials · {money(totalCost)} merchandise</strong><p className="mt-1 text-xs text-ash">{validLines ? "Shipping, taxes and testing charges are not included in this merchandise total." : "Complete each line to calculate the total."}</p></div>
        <label className="flex items-start gap-3 text-sm text-ink"><input type="checkbox" checked={releaseToSellable} onChange={(event) => setReleaseToSellable(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-accent" /><span>Listed products are tested and ready for sale<span className="mt-1 block text-xs leading-relaxed text-ash">Leave unchecked to hold the received stock awaiting testing. Internal, unlisted products remain unavailable to customers either way. Bac water 10 ml is separate from Reconstitution Solution 5 ml.</span></span></label>
        {snapshot.openInboundLots.length > 0 && <fieldset className="space-y-2 rounded-lg border border-linen p-4"><legend className="px-1 text-sm font-medium text-ink">Close old incoming tracking entries</legend><p className="text-xs leading-relaxed text-ash">Select only entries this receipt replaces or resolves. These are tracking records; closing them does not cancel an order with a supplier or add their quantities again.</p>{snapshot.openInboundLots.map((lot) => <label key={lot.id} className="flex items-start gap-3 py-1 text-sm text-ink"><input type="checkbox" checked={closeInboundLotIds.includes(lot.id)} onChange={(event) => setCloseInboundLotIds((current) => event.target.checked ? [...current, lot.id] : current.filter((id) => id !== lot.id))} className="mt-0.5 size-5 shrink-0 accent-accent" /><span className="min-w-0 break-words">#{lot.id} · {lot.sku} · {lot.quantityOrdered} vials<span className="block text-xs text-ash">{lot.status.replaceAll("_", " ")}{lot.supplierLotReference ? ` · ${lot.supplierLotReference}` : ""}</span></span></label>)}</fieldset>}
        <button type="submit" disabled={!validLines || duplicateSku || reference.trim().length < 3 || !sourceNote.trim()} className="min-h-11 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-page hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Recording…" : "Record received inventory"}</button>
      </fieldset>
    </form>}
    {saved && (
      <div className="space-y-3 px-5 py-4">
        <h3 className="break-words text-sm font-semibold text-ink">Saved: {saved.reference}</h3>
        <p className="text-sm text-ash">{saved.totalQuantity} received vials · {money(saved.merchandiseTotalUsd)} merchandise</p>
        <ul className="space-y-2 text-sm text-ink">
          {saved.lines.map((line) => (
            <li key={line.sku} className="break-words rounded-lg border border-linen p-3">
              {line.name} · {line.quantity} received · {money(line.lineTotalUsd)}
              <span className="mt-1 block text-xs text-ash">
                {line.disposition === "sellable" ? "Added to listed stock" : line.disposition === "awaiting_testing" ? "Held awaiting testing" : "Internal inventory · not listed"}
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className={secondary} onClick={() => {
          setSaved(null); setReference(""); setSourceNote("");
          setLines([{ key: nextKey.current++, sku: "", quantity: "", unitCost: "" }]);
          setCloseInboundLotIds([]); setReleaseToSellable(false); setMessage(null);
        }}>Record another shipment</button>
      </div>
    )}
    {snapshot && (
      <div className="border-t border-linen px-5 py-4">
        <h3 className="text-sm font-semibold text-ink">Current physical inventory</h3>
        <p className="mt-1 text-sm font-medium text-ink">{snapshot.products.reduce((sum, product) => sum + product.physicalOnHand, 0)} total vials on hand</p>
        <p className="mt-1 text-xs text-ash">On hand includes stock held for testing. Internal products are not available to buy.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-linen text-xs text-ash">
              <tr>
                <th className="py-2 pr-4 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">On hand</th>
                <th className="px-3 py-2 font-medium">Listed stock</th>
                <th className="px-3 py-2 font-medium">Awaiting testing</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.products.map((product) => (
                <tr key={product.sku} className="border-b border-linen last:border-0">
                  <td className="py-3 pr-4 text-ink">
                    {product.name}<span className="block font-mono text-xs text-ash">{product.sku}</span>
                    {!product.listedForSale && <span className="block text-xs text-ash">Internal inventory · not listed</span>}
                  </td>
                  <td className="px-3 py-3 font-mono text-ink">{product.physicalOnHand}</td>
                  <td className="px-3 py-3 font-mono text-ink">{product.listedForSale ? product.stock : "—"}</td>
                  <td className="px-3 py-3 font-mono text-ink">{product.awaitingTesting}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
    {snapshot && (
      <details className="border-t border-linen px-5 py-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Recent received shipments ({snapshot.receipts.length})</summary>
        <div className="mt-3 space-y-3">
          {snapshot.receipts.length === 0 ? <p className="text-sm text-ash">No received shipments recorded here yet.</p> : snapshot.receipts.map((receipt) => (
            <article key={receipt.id} className="rounded-lg border border-linen p-3">
              <h4 className="break-words text-sm font-semibold text-ink">{receipt.reference}</h4>
              <p className="mt-1 text-xs text-ash">{new Date(receipt.createdAt).toLocaleString()} · {receipt.totalQuantity} vials · {money(receipt.merchandiseTotalUsd)}</p>
              {receipt.sourceNote && <p className="mt-2 break-words text-xs text-ash">{receipt.sourceNote}</p>}
              <ul className="mt-2 space-y-1 text-xs text-ash">
                {receipt.lines.map((line) => <li key={line.sku} className="break-words">{line.sku} · {line.quantity} × {money(line.unitCostUsd)} = {money(line.lineTotalUsd)}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </details>
    )}
  </section>;
}
