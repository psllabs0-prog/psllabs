import { LabIllustration } from "@/components/illustrations/lab-illustrations";

export function ContactBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -right-40 -top-32 h-[520px] w-[520px] rounded-full bg-biotech-light/35 blur-3xl" />
      <div className="absolute -bottom-24 -left-32 h-96 w-96 rounded-full bg-biotech-pale/50 blur-3xl" />
      <div className="absolute right-1/4 top-1/3 h-64 w-64 rounded-full bg-biotech-blue/8 blur-2xl" />

      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(61,107,140,0.12) 1px, transparent 0)`,
          backgroundSize: "32px 32px",
        }}
      />

      <div className="absolute right-[8%] top-[18%] size-28 opacity-[0.12] md:size-36">
        <LabIllustration id="hplc" className="size-full" />
      </div>
      <div className="absolute bottom-[22%] left-[6%] size-24 opacity-[0.1] md:size-32">
        <LabIllustration id="batch-coa" className="size-full" />
      </div>
      <div className="absolute right-[18%] bottom-[12%] size-20 opacity-[0.08] md:size-28">
        <LabIllustration id="research-support" className="size-full" />
      </div>
      <div className="absolute left-[42%] top-[8%] size-16 opacity-[0.07] md:size-24">
        <LabIllustration id="third-party-tested" className="size-full" />
      </div>
    </div>
  );
}
