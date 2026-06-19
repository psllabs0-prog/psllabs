import type { ContentPageMeta, ContentSection } from "./types";

export const protocolPageMeta: ContentPageMeta = {
  label: "THE PROTOCOL",
  title: "Three compounds. One daily rhythm.",
  description:
    "How to use the PSL stack—timing, stacking order, and what to expect.",
  intro: [
    "The protocol is intentionally simple. Complexity belongs in the formulation and the evidence—not in your morning routine.",
  ],
};

export const protocolSections: ContentSection[] = [
  {
    id: "overview",
    title: "Overview",
    paragraphs: [
      "PSL is a three-part daily protocol: Foundation every morning, Cellular Energy every morning (with Foundation), Recovery every evening. Each product targets a distinct mechanism. Together, they cover base-layer signaling, NAD+ maintenance, and mitochondrial function.",
      "You do not need to start all three at once. Most users begin with Foundation for 4–8 weeks, then add Cellular Energy, then Recovery.",
    ],
  },
  {
    id: "foundation",
    title: "Foundation — morning",
    paragraphs: [
      "Take 2 capsules with your first meal containing fat. Same time daily. Foundation is the base layer: resveratrol, spermidine, fisetin, and methylated B vitamins.",
      "If you experience GI sensitivity, split the dose: 1 capsule with breakfast, 1 with lunch.",
    ],
  },
  {
    id: "cellular-energy",
    title: "Cellular Energy — morning",
    paragraphs: [
      "Take 2 capsules with Foundation at your first meal. NMN, NR, and TMG are dosed together to support NAD+ pathways and methylation balance.",
      "Do not take Cellular Energy in the evening if you are sensitive to daytime NAD+ precursors affecting sleep.",
    ],
  },
  {
    id: "recovery",
    title: "Recovery — evening",
    paragraphs: [
      "Take 2 capsules with dinner or your last meal. Recovery targets mitochondrial function with urolithin A, ubiquinol, and PQQ—separated from morning compounds by design.",
      "Consistency over 8–12 weeks matters more than perfect timing to the minute.",
    ],
  },
  {
    id: "what-to-expect",
    title: "What to expect",
    paragraphs: [
      "We do not promise specific outcomes. Cellular mechanisms operate on long timescales. The protocol is built for years of daily use, not a 30-day transformation.",
      "Track consistency, not daily subjective changes. If you stop for more than a week, resume at full dose when you restart—do not double up to catch up.",
    ],
  },
];
