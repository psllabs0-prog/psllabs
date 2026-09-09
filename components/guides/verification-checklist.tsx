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
    title: "Who issued the report?",
    description:
      "Look for a real lab name, contact details, and a way to verify the file. A logo alone is not enough.",
    actionHint: "Check the header for the laboratory name.",
  },
  {
    step: 2,
    title: "Find the task or report ID",
    description:
      "Legitimate reports usually include a unique tracking number (for Janoshik reports, a Task #). Without that ID, independent checks are hard.",
    actionHint: "Look for Task # or Report ID near the top.",
  },
  {
    step: 3,
    title: "Verify it on the lab's site",
    description:
      "Open the lab's verification page (for Janoshik: verify.janoshik.com) and check the task number and key against the original file.",
    actionHint: "Do not rely only on a screenshot or vendor summary.",
  },
  {
    step: 4,
    title: "Match the batch number",
    description:
      "The batch or lot on the report should match the code on the vial or package.",
    actionHint: "If the numbers do not match, the report is not for that vial.",
  },
  {
    step: 5,
    title: "Check identity testing",
    description:
      "Confirm the lab actually tested identity (often with mass spectrometry), not only a purity percentage.",
    actionHint: "A purity peak alone does not prove identity.",
  },
  {
    step: 6,
    title: "Check the analysis date",
    description:
      "Make sure the test date fits the lot you are evaluating. Older reports may belong to earlier lots.",
    actionHint: "Compare the date to the active lot you received.",
  },
  {
    step: 7,
    title: "See which tests were run",
    description:
      "Note whether the report lists purity percentage, measured amount, or both. Those are different results.",
    actionHint: "Purity % is not the same as total milligrams.",
  },
  {
    step: 8,
    title: "Note what was not tested",
    description:
      "If sterility, endotoxin, or other tests are missing, treat them as untested unless another report covers them.",
    actionHint: "Write down what is missing for your records.",
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
          Lab report checklist
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
                Tip: {item.actionHint}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
