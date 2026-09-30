"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { XPostView, XSectionView } from "@/lib/x-publishing/admin-api";
import type { XGate, XAdminMode } from "@/lib/x-publishing/config";
import type { XDisplayState } from "@/lib/x-publishing/constants";
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

type Draft = { id: string | null; revision: number | null; text: string; refs: string; date: string; slot: string };
const EMPTY: Draft = { id: null, revision: null, text: "", refs: "", date: "", slot: "09:00" };

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
  const [draft, setDraft] = useState<Draft>(EMPTY);
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

  const run = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const { ok, data: res } = await postAction(body);
      setMessage(ok ? { kind: "ok", text: success } : { kind: "error", text: String(res.error ?? "Action failed") });
      await load();
      return ok;
    } finally {
      setBusy(false);
    }
  };

  const preview = useMemo(() => checkPostText(normalizeDraftText(draft.text)), [draft.text]);

  if (loadError) return <p className="text-sm text-red-700">Could not load the X queue: {loadError}</p>;
  if (!data) return <p className="text-sm text-ash">Loading…</p>;

  const readOnly = data.config.admin.mode === "disabled" || !data.initialized;
  const page = (section: XSection) => (offset: number) => setOffsets({ ...offsets, [section]: offset });

  const saveDraft = async () => {
    const ok = await run(
      {
        action: "save_draft",
        id: draft.id,
        expectedRevision: draft.revision,
        text: draft.text,
        sourceRefs: draft.refs.split("\n").map((s) => s.trim()).filter(Boolean),
        scheduledForLocal: draft.date ? `${draft.date}T${draft.slot}` : null,
      },
      draft.id ? "Draft updated. Any earlier approval was invalidated." : "Draft saved. Review it below before approving."
    );
    if (ok) setDraft(EMPTY);
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">X post queue</h1>
        <p className="mt-1 text-sm text-ink">
          Destination: <strong>@{data.account.handle}</strong> · account ID <code className="font-mono">{data.account.id}</code>
        </p>
        <p className="mt-1 text-xs text-ash">
          Save draft → review exact text, account, and time → approve → n8n publishes the approved version when due →
          X&apos;s response and a read-only lookup are recorded here and in Mission Control.
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
          <li>{data.limits.createDispatchesPerPhoenixDay} Create Post dispatch per Phoenix calendar day; {data.limits.postsPerWorkflowRun} post per workflow run.</li>
          <li>{data.limits.slotMinutes}-minute slots in America/Phoenix; approval expires {data.limits.expiryMinutesAfterScheduled} minutes after the slot. Nothing is rescheduled automatically.</li>
          <li>Original text only, ≤ {data.limits.maxWeightedLength} weighted characters, up to {data.limits.maxLinks} fully written https:// links. No mentions, media, threads, or replies.</li>
          <li>Pause stops new dispatch permits. Neither pause nor cancel can retract a request already sent to X, and nothing is deleted automatically.</li>
        </ul>
      </section>

      {message && (
        <p className={`text-sm ${message.kind === "ok" ? "text-emerald-800" : "text-red-700"}`}>{message.text}</p>
      )}

      {!readOnly && (
        <section className="premium-card space-y-3 px-4 py-4">
          <h2 className="font-display text-lg font-bold text-ink">{draft.id ? `Edit draft (revision ${draft.revision})` : "New draft"}</h2>
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
          <div className="flex flex-wrap items-end gap-3 text-xs text-ash">
            <label>
              Phoenix date
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                className="ml-1 rounded border border-zinc-300 bg-white px-1 py-0.5 text-ink"
              />
            </label>
            <label>
              Slot
              <select
                value={draft.slot}
                onChange={(e) => setDraft({ ...draft, slot: e.target.value })}
                className="ml-1 rounded border border-zinc-300 bg-white px-1 py-0.5 text-ink"
              >
                {SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <span>Leave the date empty to decide the time later.</span>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={busy || !draft.text.trim()} onClick={saveDraft} className="rounded bg-ink px-3 py-1 text-sm text-white">
              Save draft
            </button>
            {draft.id && (
              <button type="button" onClick={() => setDraft(EMPTY)} className="text-sm text-ink underline">
                Discard edits
              </button>
            )}
          </div>
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
        <PostGroup title="Needs owner review" section={data.sections.review} onPage={page("review")} data={data} busy={busy} readOnly={readOnly} run={run} onEdit={setDraft} />
      )}
      <PostGroup title="Drafts, scheduled, and in flight" section={data.sections.open} onPage={page("open")} data={data} busy={busy} readOnly={readOnly} run={run} onEdit={setDraft} empty="Nothing drafted or scheduled." />
      {data.sections.history.total > 0 && (
        <PostGroup title="History" section={data.sections.history} onPage={page("history")} data={data} busy={busy} readOnly={readOnly} run={run} onEdit={setDraft} />
      )}
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

type CardProps = {
  data: Payload;
  busy: boolean;
  readOnly: boolean;
  run: (body: Record<string, unknown>, success: string) => Promise<boolean>;
  onEdit: (d: Draft) => void;
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

function PostCard({ post, data, busy, readOnly, run, onEdit }: CardProps & { post: XPostView }) {
  const [acks, setAcks] = useState<string[]>([]);
  const [confirmScheduled, setConfirmScheduled] = useState(false);
  const [confirmManual, setConfirmManual] = useState(false);
  const [confirmManual2, setConfirmManual2] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [notCreated, setNotCreated] = useState(false);
  const editable = ["draft", "approved", "claimed", "rejected", "expired", "cancelled"].includes(post.status);
  const cancellable = ["draft", "approved", "claimed"].includes(post.status);
  const allAcked = post.check.warnings.every((w) => acks.includes(w.code));
  const active = post.attempts.find((a) => a.id === post.activeAttemptId) ?? post.attempts[0] ?? null;

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
      kind === "scheduled" ? "Approved for its scheduled slot." : "Approved for the next manual run."
    );

  return (
    <li className="premium-card px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={`rounded px-2 py-0.5 text-xs ${STATE_STYLE[post.displayState]}`}>{post.displayLabel}</span>
        {post.reviewRequired && <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-900">Review required</span>}
        {post.isTest && <span className="rounded bg-zinc-100 px-1 text-xs text-zinc-600">TEST</span>}
        {post.createdBy === X_DRAFT_ASSISTANT_ACTOR && (
          <span className="rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-900">AI-assisted — owner review required</span>
        )}
        <span className="font-mono text-xs text-ash">queue {post.id} · revision {post.revision}</span>
      </div>
      <pre className="mt-2 whitespace-pre-wrap break-words rounded border border-zinc-200 bg-white p-2 font-mono text-sm text-ink">{post.text}</pre>
      <p className="mt-1 text-xs text-ash">
        {post.check.weightedLength} / {post.check.maxWeightedLength} weighted · to @{post.accountHandle} ({post.accountId}) ·{" "}
        {post.scheduleKind === "next_manual_run" && post.status !== "draft" ? "next manual run" : "scheduled"}{" "}
        {post.scheduledForPhoenix ?? "— no time chosen"}
        {post.expiresAtPhoenix ? ` · approval expires ${post.expiresAtPhoenix}` : ""}
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
      {post.xUrl && (
        <p className="mt-1 text-xs">
          <a href={post.xUrl} target="_blank" rel="noreferrer" className="underline">
            Open X post {post.xPostId}
          </a>
          {post.verifiedAt ? ` · lookup confirmed ${fmt(post.verifiedAt)} — ${data.provenance}` : " · verification pending"}
        </p>
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
          {!post.check.ok && <p className="text-red-700">Fix the errors above (edit the draft) before approving.</p>}
          <div className="border-t border-zinc-100 pt-2">
            {post.scheduleProblem ? (
              <p className="text-amber-800">Scheduled approval unavailable: {post.scheduleProblem}</p>
            ) : (
              <>
                <label className="flex items-start gap-1">
                  <input type="checkbox" checked={confirmScheduled} onChange={(e) => setConfirmScheduled(e.target.checked)} />
                  I authorize publishing this exact text publicly to @{post.accountHandle} (ID {post.accountId}) at {post.scheduledForPhoenix}. It
                  expires unpublished {data.limits.expiryMinutesAfterScheduled} minutes later if not sent.
                </label>
                <button
                  type="button"
                  disabled={busy || !post.check.ok || !allAcked || !confirmScheduled}
                  onClick={() => approve("scheduled")}
                  className="mt-1 rounded bg-ink px-3 py-1 text-white disabled:opacity-40"
                >
                  Approve for scheduled slot
                </button>
              </>
            )}
          </div>
          <div className="border-t border-zinc-100 pt-2">
            <label className="flex items-start gap-1">
              <input type="checkbox" checked={confirmManual} onChange={(e) => setConfirmManual(e.target.checked)} />
              Approve for the next manual run instead: valid for {data.limits.nextManualRunValidityMinutes} minutes from approval, then it expires unpublished.
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
              Approve for next manual run
            </button>
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {editable && (
            <button
              type="button"
              className="text-ink underline"
              onClick={() => {
                const local = post.scheduledForLocalInput;
                onEdit({
                  id: post.id,
                  revision: post.revision,
                  text: post.text,
                  refs: post.sourceRefs.join("\n"),
                  date: local ? local.slice(0, 10) : "",
                  slot: local ? local.slice(11, 16) : "09:00",
                });
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              {post.status === "draft" ? "Edit" : "Edit as new draft (invalidates approval)"}
            </button>
          )}
          {cancellable && (
            <button
              type="button"
              className="text-red-700 underline"
              disabled={busy}
              onClick={() => window.confirm("Cancel this post? It will not be sent.") && run({ action: "cancel", id: post.id }, "Cancelled.")}
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
              onClick={() => run({ action: "reconcile_candidate", attemptId: active.id, candidatePostId: candidate }, "Read-only lookup queued for the next workflow run.")}
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
                onClick={() => run({ action: "resolve_not_created", attemptId: active.id, confirmChecked: true }, "Recorded as not created. Edit and re-approve to try again.")}
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
          onClick={() => run({ action: "request_lookup", attemptId: active.id }, "Read-only lookup re-queued.")}
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
