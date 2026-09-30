import fs from "node:fs";
import path from "node:path";

import matter from "gray-matter";

import { TESTING_SCOPE_STATEMENT } from "@/lib/content/testing-scope";

import {
  X_DRAFT_OMISSION_MARKER,
  X_DRAFT_SOURCE_ALLOWLIST,
  type XDraftPassage,
  type XDraftSource,
  type XDraftSourceSpec,
} from "./sources";

/**
 * Reads the allowlisted sources from the working tree. Used only by the
 * snapshot script and tests; the endpoints serve the committed snapshot.
 */
function read(root: string, file: string): string {
  return fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n?/g, "\n");
}

function sections(markdown: string, headings: readonly string[], file: string): string {
  const { content } = matter(markdown);
  const blocks = content.split(/\n(?=## )/);
  return headings
    .map((heading) => {
      const block = blocks.find((b) => b.trimStart().startsWith(`## ${heading}\n`));
      if (!block) throw new Error(`${file}: section "## ${heading}" not found`);
      return block.trim();
    })
    .join("\n\n");
}

type SectionRange = { heading: string | null; headingStart: number; start: number; end: number };

function sectionRanges(body: string): SectionRange[] {
  const headings = [...body.matchAll(/^## (.+)$/gm)];
  const ranges: SectionRange[] = [{ heading: null, headingStart: 0, start: 0, end: headings[0]?.index ?? body.length }];
  headings.forEach((m, i) => {
    ranges.push({
      heading: m[1].trim(),
      headingStart: m.index,
      start: m.index + m[0].length,
      end: headings[i + 1]?.index ?? body.length,
    });
  });
  return ranges;
}

/** True when the skipped text contains more than whitespace and section headings. */
function omits(gap: string): boolean {
  return gap.replace(/^## .*$/gm, "").trim().length > 0;
}

/**
 * Joins verbatim passages in document order. Section headings are kept for
 * context and every stretch of omitted article text becomes the omission
 * marker, so the snapshot never presents non-adjacent passages as continuous.
 */
function passages(markdown: string, selected: readonly XDraftPassage[], file: string): { title: string; text: string } {
  const { data, content } = matter(markdown);
  const title = String(data.title ?? "").trim();
  if (!title) throw new Error(`${file}: title is required`);
  if (selected.length === 0) throw new Error(`${file}: at least one passage is required`);
  const body = content;
  const ranges = sectionRanges(body);
  const parts: string[] = [];
  let cursor = 0;
  let currentHeading: string | null = null;
  for (const passage of selected) {
    const text = passage.text;
    if (!text.trim() || text !== text.trim()) throw new Error(`${file}: passages must be non-empty and trimmed`);
    const label = passage.heading === null ? "the introduction" : `"## ${passage.heading}"`;
    const range = ranges.find((r) => r.heading === passage.heading);
    if (!range) throw new Error(`${file}: section ${label} not found`);
    const at = body.indexOf(text, Math.max(cursor, range.start));
    if (at < 0 || at + text.length > range.end) {
      throw new Error(`${file}: passage not found verbatim in ${label} (after the previous passage): ${JSON.stringify(text.slice(0, 80))}`);
    }
    if (passage.heading !== currentHeading && passage.heading !== null) {
      if (omits(body.slice(cursor, range.headingStart))) parts.push(X_DRAFT_OMISSION_MARKER);
      parts.push(`## ${passage.heading}`);
      if (omits(body.slice(range.start, at))) parts.push(X_DRAFT_OMISSION_MARKER);
    } else if (omits(body.slice(cursor, at))) {
      parts.push(X_DRAFT_OMISSION_MARKER);
    }
    parts.push(text);
    cursor = at + text.length;
    currentHeading = passage.heading;
  }
  if (omits(body.slice(cursor))) parts.push(X_DRAFT_OMISSION_MARKER);
  return { title, text: parts.join("\n\n") };
}

export function buildXDraftSource(spec: XDraftSourceSpec, root = process.cwd()): XDraftSource {
  const s = spec.select;
  switch (s.type) {
    case "mdx-passages": {
      const { title, text } = passages(read(root, s.file), s.passages, s.file);
      return { id: spec.id, kind: spec.kind, title, url: spec.url, origin: `${s.file} (selected verbatim passages)`, text };
    }
    case "constant":
      return {
        id: spec.id,
        kind: spec.kind,
        title: "Testing-scope statement",
        url: spec.url,
        origin: `${s.module}#${s.name}`,
        text: TESTING_SCOPE_STATEMENT,
      };
    case "md-sections": {
      const raw = read(root, s.file);
      const { data } = matter(raw);
      if (data.status !== "approved") throw new Error(`${s.file}: guidance must have status: approved`);
      return {
        id: spec.id,
        kind: spec.kind,
        title: path.basename(s.file, ".md"),
        url: spec.url,
        origin: `${s.file} (${s.headings.map((h) => `## ${h}`).join("; ")})`,
        text: sections(raw, s.headings, s.file),
      };
    }
  }
}

export function buildXDraftSources(root = process.cwd()): XDraftSource[] {
  const ids = new Set<string>();
  return X_DRAFT_SOURCE_ALLOWLIST.map((spec) => {
    if (ids.has(spec.id)) throw new Error(`duplicate source id ${spec.id}`);
    ids.add(spec.id);
    return buildXDraftSource(spec, root);
  });
}

export function renderXDraftSnapshotModule(sources: XDraftSource[]): string {
  const body = sources
    .map(
      (s) =>
        `  {\n    id: ${JSON.stringify(s.id)},\n    kind: ${JSON.stringify(s.kind)},\n    title: ${JSON.stringify(s.title)},\n    url: ${JSON.stringify(s.url)},\n    origin: ${JSON.stringify(s.origin)},\n    text: ${JSON.stringify(s.text)},\n  },`
    )
    .join("\n");
  return [
    "// Generated by `npm run x-drafts:snapshot` from lib/x-drafts/sources.ts. Do not edit by hand.",
    'import type { XDraftSource } from "./sources";',
    "",
    "export const X_DRAFT_SOURCE_SNAPSHOT: readonly XDraftSource[] = [",
    body,
    "];",
    "",
  ].join("\n");
}
