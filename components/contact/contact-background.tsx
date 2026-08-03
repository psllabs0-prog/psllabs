import { LabIllustration } from "@/components/illustrations/lab-illustrations";

export function ContactBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(36,38,43,0.9) 1px, transparent 0)`,
          backgroundSize: "32px 32px",
        }}
      />

      <div className="absolute right-[8%] top-[18%] size-28 opacity-[0.08] md:size-36">
        <LabIllustration id="hplc" className="size-full" />
      </div>
      <div className="absolute bottom-[22%] left-[6%] size-24 opacity-[0.07] md:size-32">
        <LabIllustration id="batch-coa" className="size-full" />
      </div>
      <div className="absolute right-[18%] bottom-[12%] size-20 opacity-[0.06] md:size-28">
        <LabIllustration id="research-support" className="size-full" />
      </div>
      <div className="absolute left-[42%] top-[8%] size-16 opacity-[0.05] md:size-24">
        <LabIllustration id="third-party-tested" className="size-full" />
      </div>
    </div>
  );
}
