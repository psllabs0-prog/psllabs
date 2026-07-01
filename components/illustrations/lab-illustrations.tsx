import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type LabIllustrationId =
  | "usa-shipping"
  | "third-party-tested"
  | "certificate"
  | "research-docs"
  | "batch-coa"
  | "hplc"
  | "quality-panel"
  | "us-fulfillment"
  | "protected-shipping"
  | "research-support";

type LabIllustrationProps = {
  id: LabIllustrationId;
  className?: string;
};

const blue = {
  deep: "#1A4D6D",
  mid: "#3D6B8C",
  light: "#7BAFD4",
  pale: "#E8F2FA",
  white: "#FFFFFF",
};

export function LabIllustration({ id, className }: LabIllustrationProps) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-full", className)}
      aria-hidden
    >
      <rect width="80" height="80" rx="12" fill={blue.pale} />
      {illustrations[id]}
    </svg>
  );
}

const illustrations: Record<LabIllustrationId, ReactNode> = {
  "usa-shipping": (
    <>
      <path
        d="M18 48h44l-6-14H24l-6 14Z"
        fill={blue.white}
        stroke={blue.mid}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M28 34h24v6H28v-6Z"
        fill={blue.light}
        stroke={blue.mid}
        strokeWidth="1.5"
      />
      <circle cx="28" cy="50" r="4" fill={blue.deep} />
      <circle cx="52" cy="50" r="4" fill={blue.deep} />
      <rect x="34" y="18" width="12" height="8" rx="2" fill={blue.mid} />
      <path d="M40 26v8" stroke={blue.mid} strokeWidth="1.5" />
    </>
  ),
  "third-party-tested": (
    <>
      <circle cx="40" cy="40" r="18" fill={blue.white} stroke={blue.mid} strokeWidth="1.5" />
      <path
        d="M30 40l6 6 14-14"
        stroke={blue.deep}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M40 14v6M40 60v6M14 40h6M60 40h6"
        stroke={blue.light}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),
  certificate: (
    <>
      <rect
        x="22"
        y="16"
        width="36"
        height="48"
        rx="3"
        fill={blue.white}
        stroke={blue.mid}
        strokeWidth="1.5"
      />
      <path d="M28 26h24M28 34h20M28 42h16" stroke={blue.light} strokeWidth="2" strokeLinecap="round" />
      <circle cx="40" cy="54" r="6" fill={blue.pale} stroke={blue.mid} strokeWidth="1.5" />
      <path d="M37 54l2 2 4-5" stroke={blue.deep} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  "research-docs": (
    <>
      <rect x="20" y="18" width="28" height="36" rx="2" fill={blue.white} stroke={blue.mid} strokeWidth="1.5" />
      <rect x="32" y="24" width="28" height="36" rx="2" fill={blue.pale} stroke={blue.mid} strokeWidth="1.5" />
      <path d="M38 34h16M38 40h12M38 46h14" stroke={blue.light} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="54" cy="52" r="8" fill={blue.mid} />
      <path d="M51 52h6M54 49v6" stroke={blue.white} strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  "batch-coa": (
    <>
      <rect x="18" y="20" width="44" height="40" rx="4" fill={blue.white} stroke={blue.mid} strokeWidth="1.5" />
      <rect x="24" y="28" width="32" height="4" rx="1" fill={blue.light} />
      <rect x="24" y="36" width="24" height="3" rx="1" fill={blue.pale} />
      <rect x="24" y="42" width="28" height="3" rx="1" fill={blue.pale} />
      <path
        d="M48 48l4 4 8-10"
        stroke={blue.deep}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="24" y="58" fill={blue.mid} fontSize="6" fontFamily="monospace">
        LOT#
      </text>
    </>
  ),
  hplc: (
    <>
      <rect x="16" y="48" width="48" height="14" rx="2" fill={blue.white} stroke={blue.mid} strokeWidth="1.5" />
      <rect x="22" y="36" width="8" height="12" fill={blue.mid} rx="1" />
      <rect x="34" y="28" width="8" height="20" fill={blue.deep} rx="1" />
      <rect x="46" y="32" width="8" height="16" fill={blue.light} rx="1" />
      <path d="M20 22h40" stroke={blue.mid} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="40" cy="22" r="3" fill={blue.light} />
    </>
  ),
  "quality-panel": (
    <>
      <rect x="20" y="20" width="40" height="40" rx="6" fill={blue.white} stroke={blue.mid} strokeWidth="1.5" />
      <path d="M28 32h24M28 40h18M28 48h22" stroke={blue.light} strokeWidth="2" strokeLinecap="round" />
      <circle cx="52" cy="48" r="8" fill={blue.pale} stroke={blue.mid} strokeWidth="1.5" />
      <path d="M49 48l2 2 4-5" stroke={blue.deep} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  "us-fulfillment": (
    <>
      <rect x="14" y="28" width="52" height="28" rx="4" fill={blue.white} stroke={blue.mid} strokeWidth="1.5" />
      <path d="M14 36h52" stroke={blue.mid} strokeWidth="1.5" />
      <rect x="22" y="42" width="14" height="8" rx="1" fill={blue.light} />
      <rect x="40" y="42" width="18" height="8" rx="1" fill={blue.pale} />
      <path
        d="M40 18l-8 10h16l-8-10Z"
        fill={blue.mid}
        stroke={blue.deep}
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </>
  ),
  "protected-shipping": (
    <>
      <rect x="22" y="24" width="36" height="32" rx="4" fill={blue.white} stroke={blue.mid} strokeWidth="1.5" />
      <path
        d="M40 30v14M34 36h12"
        stroke={blue.mid}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="40" cy="40" r="14" stroke={blue.light} strokeWidth="1.5" strokeDasharray="3 3" />
      <path d="M30 56h20" stroke={blue.deep} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  "research-support": (
    <>
      <circle cx="40" cy="32" r="10" fill={blue.white} stroke={blue.mid} strokeWidth="1.5" />
      <path d="M40 42v10M32 56h16" stroke={blue.mid} strokeWidth="2" strokeLinecap="round" />
      <path
        d="M36 28h8v6h-8v-6Z"
        fill={blue.pale}
        stroke={blue.mid}
        strokeWidth="1.5"
      />
      <circle cx="52" cy="24" r="6" fill={blue.mid} />
      <path d="M50 24h4M52 22v4" stroke={blue.white} strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
};
