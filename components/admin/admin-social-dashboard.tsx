"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { XPostView, XSectionView } from "@/lib/x-publishing/admin-api";
import type { XAutopilotView } from "@/lib/x-publishing/autopilot/store";
import type { XDayCapacity } from "@/lib/x-publishing/capacity";
import type { XGate, XAdminMode } from "@/lib/x-publishing/config";
import { X_AUTOPILOT_ACTOR, type XDisplayState } from "@/lib/x-publishing/constants";
import { checkPostText, normalizeDraftText } from "@/lib/x-publishing/content";
import type { XSection } from "@/lib/x-publishing/reads";
import { X_DRAFT_ASSISTANT_ACTOR } from "@/lib/x-drafts/constants";

type Payload = {
  now: string;
  todayPhoenix: string;
  account: { id: string; handle: string };
  limits: {
    createDispatchesPerPhoenixDay: number;
    postsPerWorkflowRun: number;
    slotMinutes: number;
    expiryMinutesAfterScheduled: number;
    nextManualRunValidityMinutes: number;
    maxScheduleHorizonDays: number;
    maxWeightedLength: number;
    maxLinks: number;
    maxSourceRefs: number;
  };
  policyVersion: string;
  provenance: string;
  config: { environment: string; admin: XAdminMode; live: XGate; dryRun: XGate; expectedAccount: XGate };
  initialized: boolean;
  missing: string[];
  migrationRequired: string | null;
  isTest?: boolean;
  control: { paused: boolean; reason: string | null; updatedAt: string | null; updatedBy: string | null } | null;
  counts: Partial<Record<XDisplayState, number>>;
  totalPosts: number;
  sections: Record<XSection, XSectionView>;
  autopilot: XAutopilotView | null;
};

type Offsets = Record<XSection, number>;
const NO_OFFSETS: Offsets = { review: 0, open: 0, history: 0 };

const STATE_STYLE: Record<XDisplayState, string> = {
  draft: "bg-zinc-100 text-zinc-700",
  scheduled: "bg-indigo-100 text-indigo-800",
  preparing: "bg-blue-100 text-blue-800",
  awaiting_confirmation: "bg-amber-100 text-amber-900",
  created_unconfirmed: "bg-amber-100 text-amber-900",
  published: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-zinc-200 text-zinc-700",
  cancelled: "bg-zinc-100 text-zinc-500",
  uncertain: "bg-orange-100 text-orange-900",
};

const SLOTS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? `${d.toLocaleString("en-US", { timeZone: "America/Phoenix", dateStyle: "medium", timeStyle: "short" })} (Phoenix)`
    : "—";
}

async function postAction(body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch("/api/admin/x-publishing", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-psl-admin-action": "1" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

type NewDraft = { text: string; refs: string; date: string; slot: string };
const EMPTY: NewDraft = { text: "", refs: "", date: "", slot: "09:00" };

/** A result shown on one card; hidden once that card's revision changes. */
type CardMessage = { revision: number; kind: "ok" | "error"; text: string; capacity?: XDayCapacity };
type Run = (
  body: Record<string, unknown>,
  success: string,
  target?: { postId: string; revision: number }
) => Promise<{ ok: boolean; data: Record<string, unknown> }>;

async function fetchQueue(offsets: Offsets): Promise<{ data: Payload } | { error: string }> {
  try {
    const qs = new URLSearchParams({
      reviewOffset: String(offsets.review),
      openOffset: String(offsets.open),
      historyOffset: String(offsets.history),
    });
    const res = await fetch(`/api/admin/x-publishing?${qs}`, { cache: "no-store" });
    if (!res.ok) return { error: res.status === 401 ? "Signed out — reload" : `HTTP ${res.status}` };
    return { data: (await res.json()) as Payload };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Load failed" };
  }
}

export function AdminSocialDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [cardMessages, setCardMessages] = useState<Record<string, CardMessage>>({});
  const [draft, setDraft] = useState<NewDraft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [offsets, setOffsets] = useState<Offsets>(NO_OFFSETS);

  const apply = useCallback((r: { data: Payload } | { error: string }) => {
    if ("data" in r) {
      setData(r.data);
      setLoadError(null);
    } else {
      setLoadError(r.error);
    }
  }, []);

  const load = useCallback(async () => apply(await fetchQueue(offsets)), [apply, offsets]);

  useEffect(() => {
    let active = true;
    void fetchQueue(offsets).then((r) => {
      if (active) apply(r);
    });
    return () => {
      active = false;
    };
  }, [apply, offsets]);

  const run: Run = async (body, success, target) => {
    setBusy(true);
    if (!target) setMessage(null);
    try {
      const { ok, data: res } = await postAction(body);
      if (target) {
        const saved = (res.post as { revision?: unknown } | undefined)?.revision;
        const revision = ok && typeof saved === "number" ? saved : target.revision;
        setCardMessages((m) => ({
          ...m,
          [target.postId]: ok
            ? { revision, kind: "ok", text: success }
            : { revision, kind: "error", text: String(res.error ?? "Action failed"), capacity: res.capacity as XDayCapacity | undefined },
        }));
      } else {
        setMessage(ok ? { kind: "ok", text: success } : { kind: "error", text: String(res.error ?? "Action failed") });
      }
      await load();
      return { ok, data: res };
    } finally {
      setBusy(false);
    }
  };

  const preview = useMemo(() => checkPostText(normalizeDraftText(draft.text)), [draft.text]);

  if (loadError) return <p className="text-sm text-red-700">Could not load the X queue: {loadError}</p>;
  if (!data) return <p className="text-sm text-ash">Loading…</p>;

  const readOnly = data.config.admin.mode === "disabled" || !data.initialized;
  const page = (section: XSection) => (offset: number) => setOffsets({ ...offsets, [section]: offset });

  const saveNewDraft = async () => {
    const { ok } = await run(
      {
        action: "save_draft",
        id: null,
        expectedRevision: null,
        text: draft.text,
        sourceRefs: draft.refs.split("\n").map((s) => s.trim()).filter(Boolean),
        scheduledForLocal: draft.date ? `${draft.date}T${draft.slot}` : null,
      },
      "New draft saved with the date shown on its card. Review it below before approving."
    );
    if (ok) setDraft(EMPTY);
  };

  const cardProps = { data, busy, readOnly, run, messages: cardMessages };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">X post queue</h1>
        <p className="mt-1 text-sm text-ink">
          Destination: <strong>@{data.account.handle}</strong> · account ID <code className="font-mono">{data.account.id}</code>
        </p>
        <p className="mt-1 text-xs text-ash">
          Save draft → set the date on its card → review exact text, account, and saved time → approve → n8n publishes the approved
          version when due → X&apos;s response and a read-only lookup are recorded here and in Mission Control.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-zinc-100 px-2 py-0.5 text-zinc-700">Environment: {data.config.environment}</span>
          <span className={`rounded px-2 py-0.5 ${data.config.live.enabled ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-zinc-700"}`}>
            {data.config.live.enabled ? "Live publishing enabled" : `Live publishing off — ${data.config.live.reason}`}
          </span>
          {data.config.admin.mode === "test" && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">TEST items only — cannot reach X</span>
          )}
          {data.control && (
            <span className={`rounded px-2 py-0.5 ${data.control.paused ? "bg-red-100 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
              {data.control.paused ? `Paused — ${data.control.reason ?? ""}` : "Dispatch not paused"}
            </span>
          )}
          {data.autopilot && (
            <span className={`rounded px-2 py-0.5 ${data.autopilot.mode === "on" ? "bg-indigo-100 text-indigo-800" : "bg-zinc-100 text-zinc-700"}`}>
              Autopilot: {autopilotModeLabel(data.autopilot)}
            </span>
          )}
          {!readOnly && data.control && (
            <button
              type="button"
              disabled={busy}
              className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-ink"
              onClick={() =>
                data.control!.paused
                  ? window.confirm("Resume new dispatches? Approved posts will be sent when due.") &&
                    run({ action: "resume" }, "Resumed.")
                  : run({ action: "pause", reason: "Paused by owner" }, "Paused. No new dispatch permits will be issued.")
              }
            >
              {data.control.paused ? "Resume" : "Pause new dispatches"}
            </button>
          )}
        </div>
        {data.config.admin.mode === "disabled" && (
          <p className="mt-2 text-sm text-red-700">Read-only: {data.config.admin.reason}.</p>
        )}
        {!data.initialized && <p className="mt-2 text-sm text-amber-800">{data.migrationRequired}</p>}
      </header>

      <section className="premium-card px-4 py-3 text-xs text-ash">
        <p className="font-bold uppercase tracking-wide">PSL operating limits (our defaults, not X policy)</p>
        <ul className="mt-1 list-disc pl-4">
          <li>
            At most {data.limits.createDispatchesPerPhoenixDay} Create Post dispatches per Phoenix calendar day, shared by manual
            approvals and the autopilot; {data.limits.postsPerWorkflowRun} post per workflow run.
          </li>
          <li>{data.limits.slotMinutes}-minute slots in America/Phoenix; approval expires {data.limits.expiryMinutesAfterScheduled} minutes after the slot. Nothing is rescheduled automatically.</li>
          <li>Original text only, ≤ {data.limits.maxWeightedLength} weighted characters, up to {data.limits.maxLinks} fully written https:// links. No mentions, media, threads, or replies.</li>
          <li>Pause stops new dispatch permits. Neither pause nor cancel can retract a request already sent to X, and nothing is deleted automatically.</li>
        </ul>
      </section>

      {message && (
        <p className={`text-sm ${message.kind === "ok" ? "text-emerald-800" : "text-red-700"}`}>{message.text}</p>
      )}

      {data.autopilot && <AutopilotSection autopilot={data.autopilot} busy={busy} readOnly={readOnly} run={run} />}

      {!readOnly && (
        <section className="premium-card space-y-3 px-4 py-4">
          <h2 className="font-display text-lg font-bold text-ink">New draft</h2>
          <p className="text-xs text-ash">
            This form only creates a new item. To change an existing post&apos;s text or date, use the controls on that post&apos;s card
            below.
          </p>
          <textarea
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            rows={5}
            className="w-full rounded border border-zinc-300 bg-white p-2 font-mono text-sm text-ink"
            placeholder="Exact post text"
          />
          <p className={`text-xs ${preview.weightedLength > data.limits.maxWeightedLength ? "text-red-700" : "text-ash"}`}>
            {preview.weightedLength} / {data.limits.maxWeightedLength} weighted characters (X counting rules)
          </p>
          <IssueList check={preview} />
          <label className="block text-xs text-ash">
            Source references (internal notes, one per line, never posted)
            <textarea
              value={draft.refs}
              onChange={(e) => setDraft({ ...draft, refs: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded border border-zinc-300 bg-white p-2 text-sm text-ink"
            />
          </label>
          <ScheduleInputs date={draft.date} slot={draft.slot} onChange={(date, slot) => setDraft({ ...draft, date, slot })} />
          <p className="text-xs text-ash">Leave the date empty to choose it later on the saved draft&apos;s card.</p>
          <button type="button" disabled={busy || !draft.text.trim()} onClick={saveNewDraft} className="rounded bg-ink px-3 py-1 text-sm text-white">
            Save new draft
          </button>
        </section>
      )}

      {data.initialized && (
        <p className="text-xs text-ash">
          All {data.isTest ? "TEST" : "live"} items (exact, {data.totalPosts}):{" "}
          {Object.entries(data.counts)
            .map(([state, n]) => `${state.replace(/_/g, " ")} ${n}`)
            .join(" · ") || "none"}
        </p>
      )}
      {data.sections.review.total > 0 && (
        <PostGroup title="Needs owner review" section={data.sections.review} onPage={page("review")} {...cardProps} />
      )}
      <PostGroup title="Drafts, scheduled, and in flight" section={data.sections.open} onPage={page("open")} {...cardProps} empty="Nothing drafted or scheduled." />
      {data.sections.history.total > 0 && (
        <PostGroup title="History" section={data.sections.history} onPage={page("history")} {...cardProps} />
      )}
    </div>
  );
}

function ScheduleInputs({ date, slot, onChange }: { date: string; slot: string; onChange: (date: string, slot: string) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-3 text-xs text-ash">
      <label>
        Phoenix date
        <input
          type="date"
          value={date}
          onChange={(e) => onChange(e.target.value, slot)}
          className="ml-1 rounded border border-zinc-300 bg-white px-1 py-0.5 text-ink"
        />
      </label>
      <label>
        Slot
        <select value={slot} onChange={(e) => onChange(date, e.target.value)} className="ml-1 rounded border border-zinc-300 bg-white px-1 py-0.5 text-ink">
          {SLOTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function IssueList({ check }: { check: { errors: Array<{ code: string; message: string }>; warnings: Array<{ code: string; message: string }>; links: string[] } }) {
  if (!check.errors.length && !check.warnings.length && !check.links.length) return null;
  return (
    <div className="space-y-1 text-xs">
      {check.links.length > 0 && (
        <p className="text-ash">
          Links (shown in full): {check.links.map((l) => <code key={l} className="mr-2 font-mono text-ink">{l}</code>)}
        </p>
      )}
      {check.errors.map((e) => (
        <p key={e.code} className="text-red-700">✕ {e.message}</p>
      ))}
      {check.warnings.map((w) => (
        <p key={w.code} className="text-amber-800">⚠ {w.message}</p>
      ))}
    </div>
  );
}

function autopilotModeLabel(a: XAutopilotView): string {
  if (!a.available) return "unavailable (migration required)";
  if (a.mode === "on") return `ON — ${a.policy.label}`;
  if (a.mode === "needs_reauthorization") return "paused — policy changed, re-authorization required";
  return "OFF";
}

const TEMPLATE_STATUS_LABEL: Record<XAutopilotView["library"]["templates"][number]["status"], string> = {
  eligible: "eligible",
  fails_checks: "fails checks (never automatic)",
  not_authorized: "not authorized",
  changed_since_authorization: "changed — needs re-authorization",
  consumed: "used",
  duplicate: "duplicate of an existing post",
  near_duplicate: "too similar to an existing post",
};

function AutopilotSection({ autopilot: a, busy, readOnly, run }: { autopilot: XAutopilotView; busy: boolean; readOnly: boolean; run: Run }) {
  const [confirm, setConfirm] = useState({ reviewedLibrary: false, noIndividualReview: false, sharedDailyCap: false });
  const allConfirmed = confirm.reviewedLibrary && confirm.noIndividualReview && confirm.sharedDailyCap;
  const eligibleTemplates = a.library.templates.filter((t) => t.problems.length === 0).length;
  return (
    <section className="premium-card space-y-3 px-4 py-4 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-display text-lg font-bold text-ink">Documentation autopilot (standing policy)</h2>
        <span className={`rounded px-2 py-0.5 text-xs ${a.mode === "on" ? "bg-indigo-100 text-indigo-800" : "bg-zinc-100 text-zinc-700"}`}>
          {autopilotModeLabel(a)}
        </span>
      </div>
      <p className="text-xs text-ash">
        When on, each {a.policy.windows.join(" and ")} {a.policy.timeZone} window may publish at most one post, chosen in order from
        the reviewed documentation library below — exact wording only, nothing generated. Posts are authorized by this standing
        policy, not by an individual review, and are recorded that way. They share the {a.policy.dailyCreateDispatchCap}-per-day cap
        with manual approvals. A slot is skipped (never made up later) when paused, when any item needs review, when the day is
        full, or when the library is exhausted. Global Pause still blocks every dispatch.
      </p>
      {!a.available && <p className="text-xs text-amber-800">Autopilot tables are missing ({a.missing.join(", ")}). Run the additive migration first; manual publishing is unaffected.</p>}
      {a.libraryChangedSinceAuthorization && (
        <p className="text-xs text-amber-800">
          The library changed since it was authorized. Changed or new templates are not eligible until you authorize the current
          version; unchanged templates keep their authorization.
        </p>
      )}
      <dl className="grid gap-x-4 gap-y-1 text-xs text-ash sm:grid-cols-2">
        <div>Policy: <code className="font-mono text-ink">{a.policy.label}</code></div>
        <div>Library: <code className="font-mono text-ink">{a.library.id} {a.library.version.slice(0, 12)}</code></div>
        <div>Eligible remaining: <strong className="text-ink">{a.remaining}</strong> of {a.library.templates.length}</div>
        <div>
          Automatic authorizations {a.counts.authorized} · verified posts {a.counts.verified} · in progress {a.counts.inProgress} ·
          uncertain {a.counts.uncertain} · skipped slots {a.counts.skipped}
        </div>
        {a.authorization && (
          <div className="sm:col-span-2">
            Authorized {fmt(a.authorization.authorizedAt)} by {a.authorization.authorizedBy} ({a.authorization.authorizedEnv}) ·
            authorization {a.authorization.id}
          </div>
        )}
      </dl>

      {a.nextSlots.length > 0 && (
        <div>
          <p className="text-xs font-bold text-ink">Next slots</p>
          <ul className="mt-1 space-y-1 text-xs text-ash">
            {a.nextSlots.map((s) => (
              <li key={s.key}>
                <span className="text-ink">{s.slotAtPhoenix}</span>
                {s.open ? " (window open)" : ""} · day {s.dayCapacity.used}/{s.dayCapacity.cap} used ·{" "}
                {s.outcome === "authorized"
                  ? `authorized ${s.templateId} → ${s.postStatus ?? "?"}${s.xPostId ? ` (X ${s.xPostId})` : ""}`
                  : s.outcome === "skipped"
                    ? `skipped: ${s.reason}${s.detail ? ` — ${s.detail}` : ""}`
                    : a.mode === "on"
                      ? s.expectedTemplateId
                        ? `expected ${s.expectedTemplateId} (if nothing changes)`
                        : "would skip: library exhausted"
                      : "autopilot off — nothing scheduled"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {a.recentSlots.length > 0 && (
        <details className="text-xs text-ash">
          <summary className="cursor-pointer">Recent slot decisions ({a.recentSlots.length})</summary>
          <ul className="mt-1 space-y-1">
            {a.recentSlots.map((s) => (
              <li key={s.key}>
                {s.slotAtPhoenix} · {s.outcome}
                {s.outcome === "authorized"
                  ? ` ${s.templateId} → ${s.postStatus ?? "?"}${s.xPostId ? ` (X ${s.xPostId})` : ""}`
                  : `: ${s.reason}${s.detail ? ` — ${s.detail}` : ""}`}
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="text-xs text-ash">
        <summary className="cursor-pointer">
          Review the documentation library ({a.library.templates.length} templates, {eligibleTemplates} pass the checks)
        </summary>
        <ol className="mt-2 space-y-3">
          {a.library.templates.map((t) => (
            <li key={t.id} className="rounded border border-zinc-200 bg-white p-2">
              <div className="font-mono text-ink">
                {t.id} · {TEMPLATE_STATUS_LABEL[t.status]} · hash {t.hash.slice(0, 12)}
              </div>
              <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-ink">{t.text}</pre>
              <div className="mt-1">Reader question: {t.purpose}</div>
              <div>Limitation preserved: {t.context}</div>
              <div>
                Excerpt [{t.excerpt.sourceId}]: “{t.excerpt.quote}”
              </div>
              <div>
                Documented warning exceptions:{" "}
                {t.acceptedWarnings.length ? t.acceptedWarnings.map((w) => `${w.code} (${w.justification})`).join("; ") : "none"}
              </div>
              {t.problems.length > 0 && <div className="text-red-700">Problems: {t.problems.join("; ")}</div>}
              {t.detail && t.status !== "eligible" && <div>{t.detail}</div>}
            </li>
          ))}
        </ol>
      </details>

      {!readOnly && a.available && a.mode !== "on" && (
        <div className="space-y-1 rounded border border-zinc-200 bg-white p-3 text-xs">
          <p className="font-bold text-ink">Authorize the standing policy (one time)</p>
          <label className="flex items-start gap-1">
            <input type="checkbox" checked={confirm.reviewedLibrary} onChange={(e) => setConfirm({ ...confirm, reviewedLibrary: e.target.checked })} />
            I reviewed policy {a.policy.label} and every template in library version {a.library.version.slice(0, 12)} above.
          </label>
          <label className="flex items-start gap-1">
            <input type="checkbox" checked={confirm.noIndividualReview} onChange={(e) => setConfirm({ ...confirm, noIndividualReview: e.target.checked })} />
            I authorize these exact templates to be published to @{a.policy.accountHandle} (ID {a.policy.accountId}) without reviewing each
            post; they will be recorded as authorized by the standing policy, not by me individually.
          </label>
          <label className="flex items-start gap-1">
            <input type="checkbox" checked={confirm.sharedDailyCap} onChange={(e) => setConfirm({ ...confirm, sharedDailyCap: e.target.checked })} />
            I understand automatic posts use the same {a.policy.dailyCreateDispatchCap}-per-day capacity as my manual approvals.
          </label>
          <button
            type="button"
            disabled={busy || !allConfirmed || eligibleTemplates === 0}
            onClick={() =>
              window.confirm(`Turn on the documentation autopilot with ${eligibleTemplates} templates?`) &&
              run(
                { action: "autopilot_authorize", policyVersion: a.policy.label, libraryVersion: a.library.version, confirmations: confirm },
                "Autopilot authorized. Eligible slots will be decided by the scheduled workflow."
              )
            }
            className="mt-1 rounded bg-ink px-3 py-1 text-white disabled:opacity-40"
          >
            Turn on autopilot with this policy and library
          </button>
        </div>
      )}
      {!readOnly && a.available && a.mode !== "off" && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            window.confirm("Turn the autopilot off? Pending automatic posts that have not been sent are withdrawn.") &&
            run({ action: "autopilot_disable", reason: "Turned off by owner" }, "Autopilot turned off. No new automatic authorizations.")
          }
          className="rounded border border-red-700 px-3 py-1 text-xs text-red-700"
        >
          Turn autopilot off
        </button>
      )}
    </section>
  );
}

type CardProps = {
  data: Payload;
  busy: boolean;
  readOnly: boolean;
  run: Run;
  messages: Record<string, CardMessage>;
};

type GroupProps = CardProps & {
  title: string;
  section: XSectionView;
  onPage: (offset: number) => void;
  empty?: string;
};

function PostGroup({ title, section, onPage, empty, ...rest }: GroupProps) {
  const { total, offset, limit, posts } = section;
  const from = posts.length ? offset + 1 : 0;
  const to = offset + posts.length;
  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-display text-lg font-bold text-ink">
          {title} ({total})
        </h2>
        {total > limit || offset > 0 ? (
          <span className="text-xs text-ash">
            Showing {from}–{to} of {total}
            <button type="button" className="ml-2 underline disabled:opacity-40" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - limit))}>
              Previous
            </button>
            <button type="button" className="ml-2 underline disabled:opacity-40" disabled={to >= total} onClick={() => onPage(offset + limit)}>
              Next
            </button>
          </span>
        ) : null}
      </div>
      {posts.length === 0 ? (
        <p className="mt-2 text-sm text-ash">{total > 0 ? "No items on this page." : empty}</p>
      ) : (
        <ul className="mt-2 space-y-4">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} {...rest} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PostCard({ post, data, busy, readOnly, run, messages }: CardProps & { post: XPostView }) {
  const [acks, setAcks] = useState<string[]>([]);
  const [confirmScheduled, setConfirmScheduled] = useState(false);
  const [confirmManual, setConfirmManual] = useState(false);
  const [confirmManual2, setConfirmManual2] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [notCreated, setNotCreated] = useState(false);
  const saved = post.scheduledForLocalInput;
  const [editingTime, setEditingTime] = useState(false);
  const [date, setDate] = useState(saved ? saved.slice(0, 10) : "");
  const [slot, setSlot] = useState(saved ? saved.slice(11, 16) : "09:00");
  const [editingText, setEditingText] = useState(false);
  const [text, setText] = useState(post.text);
  const [refs, setRefs] = useState(post.sourceRefs.join("\n"));
  const editable = ["draft", "approved", "claimed", "rejected", "expired", "cancelled"].includes(post.status);
  const cancellable = ["draft", "approved", "claimed"].includes(post.status);
  const allAcked = post.check.warnings.every((w) => acks.includes(w.code));
  const active = post.attempts.find((a) => a.id === post.activeAttemptId) ?? post.attempts[0] ?? null;
  const standing = post.approvalContext?.authorization === "standing_policy" ? post.approvalContext.standingPolicy : null;
  const target = { postId: post.id, revision: post.revision };
  const msg = messages[post.id];
  const shownMessage = msg && msg.revision === post.revision ? msg : null;
  const textPreview = checkPostText(normalizeDraftText(text));
  const invalidates = post.status !== "draft";

  const approve = (kind: "scheduled" | "next_manual_run") =>
    run(
      {
        action: "approve",
        id: post.id,
        expectedRevision: post.revision,
        scheduleKind: kind,
        previewHash: post.previews?.[kind],
        confirmPublic: true,
        confirmManualRun: kind === "next_manual_run",
        acknowledgedWarnings: acks,
      },
      kind === "scheduled" ? `Approved for its saved slot ${post.scheduledForPhoenix}.` : "Approved for the next manual run (testing option).",
      target
    );

  const saveTime = async (local: string | null) => {
    const { ok } = await run(
      { action: "set_schedule", id: post.id, expectedRevision: post.revision, scheduledForLocal: local },
      local ? `Saved date/time: ${local.replace("T", " ")} Phoenix. Review and approve it for that slot.` : "Saved time cleared.",
      target
    );
    if (ok) setEditingTime(false);
  };

  const saveText = async () => {
    const { ok } = await run(
      {
        action: "save_draft",
        id: post.id,
        expectedRevision: post.revision,
        text,
        sourceRefs: refs.split("\n").map((s) => s.trim()).filter(Boolean),
        scheduledForLocal: saved,
      },
      invalidates ? "Text saved as a new draft revision; the earlier approval no longer applies." : "Text saved.",
      target
    );
    if (ok) setEditingText(false);
  };

  return (
    <li className="premium-card px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={`rounded px-2 py-0.5 text-xs ${STATE_STYLE[post.displayState]}`}>{post.displayLabel}</span>
        {post.reviewRequired && <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-900">Review required</span>}
        {post.isTest && <span className="rounded bg-zinc-100 px-1 text-xs text-zinc-600">TEST</span>}
        {post.createdBy === X_DRAFT_ASSISTANT_ACTOR && (
          <span className="rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-900">AI-assisted — owner review required</span>
        )}
        {standing && (
          <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800">
            Standing policy (automatic) — not individually reviewed · {standing.templateId}
          </span>
        )}
        {!standing && post.createdBy === X_AUTOPILOT_ACTOR && (
          <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">From documentation library — edited, owner approval required</span>
        )}
        <span className="font-mono text-xs text-ash">queue {post.id} · revision {post.revision}</span>
      </div>
      <pre className="mt-2 whitespace-pre-wrap break-words rounded border border-zinc-200 bg-white p-2 font-mono text-sm text-ink">{post.text}</pre>
      <p className="mt-1 text-xs text-ash">
        {post.check.weightedLength} / {post.check.maxWeightedLength} weighted · to @{post.accountHandle} ({post.accountId})
      </p>
      <p className="mt-1 text-xs text-ink">
        <strong>Saved time:</strong>{" "}
        {post.scheduleKind === "next_manual_run" && post.status !== "draft"
          ? `next manual run (approved ${fmt(post.approvedAt)})`
          : (post.scheduledForPhoenix ?? "none saved yet — set a date/time on this card")}
        {post.expiresAtPhoenix ? ` · approval expires ${post.expiresAtPhoenix}` : ""}
        {standing ? ` · authorized ${fmt(post.approvedAt)} by ${post.approvedBy} under ${standing.policyVersion}` : ""}
      </p>
      {post.sourceRefs.length > 0 &&
        (post.createdBy === X_DRAFT_ASSISTANT_ACTOR ? (
          <div className="mt-1 text-xs text-ash">
            <ul className="mb-1 ml-4 list-disc text-ink">
              <li>
                <strong>Source excerpt present:</strong> the quoted words appear in the cited approved source. This shows where the
                wording came from; it is not a factual check of the post.
              </li>
              <li>
                <strong>Heuristic checks passed:</strong> keyword and source-matching rules only — not factual, legal, or regulatory
                verification.
              </li>
              <li>
                <strong>Owner review:</strong>{" "}
                {post.status === "draft"
                  ? "still required. This draft is not approved and nothing is scheduled."
                  : "see the status above; the assistant never approves or schedules anything."}
              </li>
            </ul>
            <p>Provenance (internal, never posted) — compare the post and excerpt with the source before approving:</p>
            <ul className="ml-4 list-disc">
              {post.sourceRefs.map((ref, i) => (
                <li key={i} className="break-words">
                  {ref}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-1 text-xs text-ash">Sources (internal): {post.sourceRefs.join(" · ")}</p>
        ))}
      <div className="mt-1">
        <IssueList check={post.check} />
      </div>
      {post.lastErrorMessage && <p className="mt-1 text-xs text-red-700">{post.lastErrorMessage}</p>}
      {shownMessage && (
        <div className={`mt-2 text-xs ${shownMessage.kind === "ok" ? "text-emerald-800" : "text-red-700"}`}>
          <p>{shownMessage.text}</p>
          {shownMessage.capacity && shownMessage.capacity.items.length > 0 && (
            <ul className="ml-4 list-disc">
              {shownMessage.capacity.items.map((i) => (
                <li key={i.kind === "permit" ? i.attemptId : i.postId}>
                  {i.kind === "permit"
                    ? `Dispatch permit issued ${fmt(i.permitIssuedAt)} — queue ${i.postId} (${i.state})`
                    : `Reserved: queue ${i.postId} ${i.status} for ${fmt(i.scheduledFor)} (${i.authorization === "standing_policy" ? "autopilot" : "owner-approved"})`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {post.xUrl && (
        <p className="mt-1 text-xs">
          <a href={post.xUrl} target="_blank" rel="noreferrer" className="underline">
            Open X post {post.xPostId}
          </a>
          {post.verifiedAt ? ` · lookup confirmed ${fmt(post.verifiedAt)} — ${data.provenance}` : " · verification pending"}
        </p>
      )}

      {!readOnly && editable && (
        <div className="mt-2 space-y-2 text-xs">
          {!editingTime ? (
            <button
              type="button"
              className="text-ink underline"
              onClick={() => {
                setDate(saved ? saved.slice(0, 10) : "");
                setSlot(saved ? saved.slice(11, 16) : "09:00");
                setEditingTime(true);
              }}
            >
              {saved ? "Change this post's date/time" : "Set this post's date/time"}
              {invalidates ? " (returns it to draft; approval invalidated)" : ""}
            </button>
          ) : (
            <div className="space-y-2 rounded border border-zinc-200 bg-white p-2">
              <p className="text-ink">Editing the saved time of queue {post.id} (revision {post.revision}).</p>
              <ScheduleInputs date={date} slot={slot} onChange={(d, s) => { setDate(d); setSlot(s); }} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !date}
                  onClick={() => saveTime(`${date}T${slot}`)}
                  className="rounded bg-ink px-3 py-1 text-white disabled:opacity-40"
                >
                  Save date/time
                </button>
                {saved && (
                  <button type="button" disabled={busy} onClick={() => saveTime(null)} className="rounded border border-ink px-3 py-1 text-ink">
                    Clear saved time
                  </button>
                )}
                <button type="button" onClick={() => setEditingTime(false)} className="text-ink underline">
                  Close
                </button>
              </div>
            </div>
          )}
          {!editingText ? (
            <button
              type="button"
              className="ml-3 text-ink underline"
              onClick={() => {
                setText(post.text);
                setRefs(post.sourceRefs.join("\n"));
                setEditingText(true);
              }}
            >
              Edit this post&apos;s text{invalidates ? " (returns it to draft; approval invalidated)" : ""}
            </button>
          ) : (
            <div className="space-y-2 rounded border border-zinc-200 bg-white p-2">
              <p className="text-ink">Editing the text of queue {post.id} (revision {post.revision}).</p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                className="w-full rounded border border-zinc-300 bg-white p-2 font-mono text-sm text-ink"
              />
              <p className={textPreview.weightedLength > data.limits.maxWeightedLength ? "text-red-700" : "text-ash"}>
                {textPreview.weightedLength} / {data.limits.maxWeightedLength} weighted characters
              </p>
              <IssueList check={textPreview} />
              <label className="block text-ash">
                Source references (internal, one per line)
                <textarea value={refs} onChange={(e) => setRefs(e.target.value)} rows={2} className="mt-1 w-full rounded border border-zinc-300 bg-white p-2 text-ink" />
              </label>
              <div className="flex gap-2">
                <button type="button" disabled={busy || !text.trim()} onClick={saveText} className="rounded bg-ink px-3 py-1 text-white disabled:opacity-40">
                  Save text
                </button>
                <button type="button" onClick={() => setEditingText(false)} className="text-ink underline">
                  Discard edits
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!readOnly && post.status === "draft" && (
        <div className="mt-3 space-y-2 rounded border border-zinc-200 bg-white p-3 text-xs">
          <p className="font-bold text-ink">Approve — this authorizes a PUBLIC post of exactly the text above.</p>
          {post.check.warnings.map((w) => (
            <label key={w.code} className="flex items-start gap-1">
              <input
                type="checkbox"
                checked={acks.includes(w.code)}
                onChange={(e) => setAcks(e.target.checked ? [...acks, w.code] : acks.filter((a) => a !== w.code))}
              />
              I reviewed: {w.message}
            </label>
          ))}
          {!post.check.ok && <p className="text-red-700">Fix the errors above (edit the text) before approving.</p>}
          <div className="border-t border-zinc-100 pt-2">
            {post.scheduleProblem ? (
              <p className="text-amber-800">Scheduled approval unavailable: {post.scheduleProblem}</p>
            ) : (
              <>
                <label className="flex items-start gap-1">
                  <input type="checkbox" checked={confirmScheduled} onChange={(e) => setConfirmScheduled(e.target.checked)} />
                  I authorize publishing this exact text publicly to @{post.accountHandle} (ID {post.accountId}) at its saved time,{" "}
                  {post.scheduledForPhoenix}. It expires unpublished {data.limits.expiryMinutesAfterScheduled} minutes later if not sent.
                </label>
                <button
                  type="button"
                  disabled={busy || !post.check.ok || !allAcked || !confirmScheduled}
                  onClick={() => approve("scheduled")}
                  className="mt-1 rounded bg-ink px-3 py-1 text-white disabled:opacity-40"
                >
                  Approve for saved slot: {post.scheduledForPhoenix}
                </button>
              </>
            )}
          </div>
          <details className="border-t border-zinc-100 pt-2">
            <summary className="cursor-pointer text-ash">Manual / testing option — approve for the next manual run (ignores the saved date)</summary>
            <div className="mt-2 space-y-1">
              <p className="text-amber-800">
                This does not use the saved date{post.scheduledForPhoenix ? ` (${post.scheduledForPhoenix})` : ""}. It is valid for{" "}
                {data.limits.nextManualRunValidityMinutes} minutes from now, counts against today&apos;s Phoenix capacity, and then expires
                unpublished.
              </p>
              <label className="flex items-start gap-1">
                <input type="checkbox" checked={confirmManual} onChange={(e) => setConfirmManual(e.target.checked)} />
                Approve for the next manual run instead of the saved slot.
              </label>
              <label className="flex items-start gap-1">
                <input type="checkbox" checked={confirmManual2} onChange={(e) => setConfirmManual2(e.target.checked)} />
                I authorize publishing this exact text publicly to @{post.accountHandle} (ID {post.accountId}) when the n8n workflow is next run manually.
              </label>
              <button
                type="button"
                disabled={busy || !post.check.ok || !allAcked || !confirmManual || !confirmManual2}
                onClick={() => approve("next_manual_run")}
                className="mt-1 rounded border border-ink px-3 py-1 text-ink disabled:opacity-40"
              >
                Approve for next manual run (testing)
              </button>
            </div>
          </details>
        </div>
      )}

      {!readOnly && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {cancellable && (
            <button
              type="button"
              className="text-red-700 underline"
              disabled={busy}
              onClick={() => window.confirm("Cancel this post? It will not be sent.") && run({ action: "cancel", id: post.id }, "Cancelled.", target)}
            >
              Cancel
            </button>
          )}
          {(post.status === "dispatched" || post.status === "created") && (
            <span className="text-ash">Already sent to X or in flight — cannot be edited, cancelled, or retracted here.</span>
          )}
        </div>
      )}

      {active && active.dispatchOverdue && (
        <p className="mt-2 text-xs text-orange-900">
          Dispatch deadline {fmt(active.dispatchDeadline)} passed with no result recorded from X. The outcome is unknown; no second
          permit is issued and nothing is retried. A late confirmed result from the workflow still resolves this automatically.
        </p>
      )}
      {!readOnly && active && active.effectiveState === "uncertain" && (
        <div className="mt-3 space-y-2 rounded border border-orange-200 bg-orange-50 p-3 text-xs">
          <p className="font-bold text-orange-900">Outcome unknown: the post may or may not exist. Nothing will be retried automatically.</p>
          <p className="text-orange-900">
            Check @{post.accountHandle} on X. If you find the post, paste its ID for a read-only lookup. If it does not exist, record that below.
          </p>
          <div className="flex items-center gap-2">
            <input
              value={candidate}
              onChange={(e) => setCandidate(e.target.value.trim())}
              placeholder="X post ID (digits)"
              className="rounded border border-zinc-300 bg-white px-1 py-0.5 font-mono"
            />
            <button
              type="button"
              disabled={busy || !/^\d{1,19}$/.test(candidate)}
              onClick={() => run({ action: "reconcile_candidate", attemptId: active.id, candidatePostId: candidate }, "Read-only lookup queued for the next workflow run.", target)}
              className="rounded border border-ink px-2 py-0.5 text-ink disabled:opacity-40"
            >
              Queue read-only lookup
            </button>
          </div>
          {!active.xPostId && (
            <div>
              <label className="flex items-start gap-1">
                <input type="checkbox" checked={notCreated} onChange={(e) => setNotCreated(e.target.checked)} />
                I checked @{post.accountHandle} on X and this post does not exist.
              </label>
              <button
                type="button"
                disabled={busy || !notCreated}
                onClick={() => run({ action: "resolve_not_created", attemptId: active.id, confirmChecked: true }, "Recorded as not created. Edit and re-approve to try again.", target)}
                className="mt-1 rounded border border-red-700 px-2 py-0.5 text-red-700 disabled:opacity-40"
              >
                Resolve as not created
              </button>
            </div>
          )}
        </div>
      )}
      {!readOnly && active && active.state === "created" && active.reviewRequired && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run({ action: "request_lookup", attemptId: active.id }, "Read-only lookup re-queued.", target)}
          className="mt-2 rounded border border-ink px-2 py-0.5 text-xs text-ink"
        >
          Retry read-only verification
        </button>
      )}

      {post.attempts.length > 0 && (
        <details className="mt-3 text-xs text-ash">
          <summary className="cursor-pointer">Attempts ({post.attempts.length})</summary>
          <ul className="mt-1 space-y-2">
            {post.attempts.map((a) => (
              <li key={a.id} className="rounded border border-zinc-200 bg-white p-2 font-mono">
                <div>
                  attempt {a.id} · {a.state} · {a.mode} · {a.trigger} · n8n execution {a.executionId} · revision {a.approvedRevision}
                </div>
                <div>
                  claimed {fmt(a.claimedAt)} · account check {a.identityHttpStatus ?? "—"} {a.identityAccountId ?? ""} · permit {fmt(a.permitIssuedAt)}
                </div>
                <div>
                  result {a.resultHttpStatus ?? "—"} at {fmt(a.resultReceivedAt)} · X post {a.xPostId ?? "—"} · lookups {a.lookupAttempts}
                  {a.nextLookupAt ? ` · next lookup ${fmt(a.nextLookupAt)}` : ""}
                  {a.reconcileCandidateId ? ` · reconciling ${a.reconcileCandidateId}` : ""}
                </div>
                {(a.errorCode || a.reviewNote) && (
                  <div className="text-red-700">
                    {a.errorCode} {a.errorMessage} {a.reviewNote ? `· ${a.reviewNote}` : ""}
                  </div>
                )}
                {a.rateLimitResetAt && <div>X rate limit resets {fmt(a.rateLimitResetAt)}</div>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}
