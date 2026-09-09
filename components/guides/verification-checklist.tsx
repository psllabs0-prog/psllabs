import { CheckSquare } from "lucide-react";

type ChecklistItem = {
  step: number;
  title: string;
  description: string;
  actionHint?: string;
};

type VerificationChecklistProps = {
  items?: ChecklistItem[];
  className?: string;
};

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  {
    step: 1,
    title: "Identify the Issuing Laboratory",
    description:
      "Verify that the testing laboratory is an independent entity with a documented physical address, contact information, and public verification infrastructure.",
    actionHint: "Check report header for laboratory legal entity name.",
  },
  {
    step: 2,
    title: "Locate the Unique Task / Report Identifier",
    description:
      "Every legitimate analytical report is assigned an immutable tracking number (e.g., Janoshik Task #199788). If there is no tracking number, the document cannot be verified.",
    actionHint: "Look for 'Task #' or 'Report ID' at the top of the COA.",
  },
  {
    step: 3,
    title: "Perform Independent Digital Verification",
    description:
      "Navigate to the laboratory's public verification portal directly (e.g., verify.janoshik.com) and query the task number and verification key to confirm the original PDF on the laboratory's server matches the document provided.",
    actionHint: "Never rely on a retyped vendor summary or cropped screenshot.",
  },
  {
    step: 4,
    title: "Match Batch / Lot Number to Physical Container",
    description:
      "The batch or lot number on the report must correspond exactly with the lot code printed on the physical vial or package label.",
    actionHint: "If the lot number does not match, the report does not document that vial.",
  },
  {
    step: 5,
    title: "Verify Chemical Target Identity",
    description:
      "Confirm that the analytical method included identity confirmation (e.g., Mass Spectrometry m/z or chromatographic retention time matching against reference material).",
    actionHint: "A purity scan alone does not prove chemical identity.",
  },
  {
    step: 6,
    title: "Inspect Analysis Date & Document Recency",
    description:
      "Evaluate when the analysis was performed relative to the current manufacturing lot. Be cautious of vendors circulating historical reports from years prior.",
    actionHint: "Analysis date should correspond to the active production lot.",
  },
  {
    step: 7,
    title: "Identify Specific Test Methods Conducted",
    description:
      "Review the reported test methods (e.g., HPLC UV area % at 214nm, quantitative net mass assay in mg). Confirm whether reported results represent purity percentage, absolute content, or both.",
    actionHint: "Purity percentage does not tell you total milligrams.",
  },
  {
    step: 8,
    title: "Catalog Tested Attributes vs Untested Attributes",
    description:
      "Explicitly identify what tests were NOT performed (e.g., microbiological sterility, bacterial endotoxins, residual counterions). Document these boundaries in research records.",
    actionHint: "Chemical purity does not establish sterility or biological safety.",
  },
];

export function VerificationChecklist({
  items = DEFAULT_CHECKLIST,
  className = "",
}: VerificationChecklistProps) {
  return (
    <div
      className={`rounded-xl border border-linen bg-surface p-6 sm:p-8 ${className}`}
    >
      <div className="flex items-center gap-2.5 border-b border-linen pb-4 text-accent">
        <CheckSquare className="size-5 shrink-0" aria-hidden />
        <h3 className="font-display text-lg font-bold text-ink sm:text-xl">
          Analytical Report Verification Checklist
        </h3>
      </div>

      <div className="mt-6 flex flex-col gap-5">
        {items.map((item) => (
          <div
            key={item.step}
            className="flex flex-col gap-1.5 rounded-lg border border-linen/80 bg-paper p-4 transition-colors hover:border-linen-dark"
          >
            <div className="flex items-baseline gap-2.5">
              <span className="font-mono text-xs font-bold text-accent">
                STEP {String(item.step).padStart(2, "0")}
              </span>
              <span className="text-stone">·</span>
              <h4 className="font-display text-base font-bold text-ink">
                {item.title}
              </h4>
            </div>

            <p className="text-xs leading-relaxed text-ash sm:text-sm">
              {item.description}
            </p>

            {item.actionHint && (
              <p className="mt-1 font-mono text-[0.6875rem] text-stone">
                Verification rule: {item.actionHint}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
