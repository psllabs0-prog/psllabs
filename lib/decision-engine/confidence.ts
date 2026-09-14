import type { DecisionConfidence, DecisionEvidenceItem } from "./types";

/**
 * Confidence from independent evidence classes — do not sum raw counts.
 */
export function confidenceFromCorroboration(input: {
  evidenceClasses: string[];
  sampleHint: "tiny" | "small" | "adequate" | "strong";
  dataFresh: boolean;
  financeTrusted?: boolean;
}): DecisionConfidence {
  if (!input.dataFresh) return "insufficient";
  if (input.financeTrusted === false && input.sampleHint !== "strong") {
    // Lower confidence when financial totals are not fully trusted
  }

  const classes = new Set(input.evidenceClasses.filter(Boolean));
  const n = classes.size;

  if (input.sampleHint === "tiny") return "insufficient";
  if (n >= 3 && input.sampleHint === "strong") return "high";
  if (n >= 3 && (input.sampleHint === "adequate" || input.sampleHint === "small"))
    return "moderate";
  if (n === 2) return "moderate";
  if (n === 1 && input.sampleHint === "strong") return "moderate";
  if (n === 1 && input.sampleHint === "adequate") return "early";
  if (n === 1 && input.sampleHint === "small") return "early";
  return "insufficient";
}

export function evidenceClassesOf(
  items: DecisionEvidenceItem[]
): string[] {
  return [...new Set(items.map((e) => e.sourceClass))];
}

export function priorityRank(p: string): number {
  switch (p) {
    case "P0":
      return 0;
    case "P1":
      return 1;
    case "P2":
      return 2;
    case "P3":
      return 3;
    default:
      return 9;
  }
}

export function sortByPriorityThenConfidence<
  T extends { priority: string; confidence: string; lastDetectedAt?: string },
>(items: T[]): T[] {
  const confRank = (c: string) => {
    switch (c) {
      case "high":
        return 0;
      case "moderate":
        return 1;
      case "early":
        return 2;
      default:
        return 3;
    }
  };
  return [...items].sort((a, b) => {
    const pr = priorityRank(a.priority) - priorityRank(b.priority);
    if (pr !== 0) return pr;
    const cr = confRank(a.confidence) - confRank(b.confidence);
    if (cr !== 0) return cr;
    return (b.lastDetectedAt ?? "").localeCompare(a.lastDetectedAt ?? "");
  });
}
