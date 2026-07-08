"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "psl_researcher_verified_v1";

export function ResearcherVerificationGate() {
  const [ageChecked, setAgeChecked] = useState(false);
  const [ruoChecked, setRuoChecked] = useState(false);

  const [isVerified, setIsVerified] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const canEnter = useMemo(
    () => ageChecked && ruoChecked,
    [ageChecked, ruoChecked]
  );

  useEffect(() => {
    if (!isVerified) return;
    // If verification is already set, allow the user through immediately.
    return;
  }, [isVerified]);

  useEffect(() => {
    if (isVerified) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isVerified]);

  function handleEnter() {
    if (!canEnter) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore; in private mode localStorage may not be available.
    }
    setIsVerified(true);
  }

  if (isVerified) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="researcher-verification-title"
      className="fixed inset-0 z-[100] flex min-h-dvh items-center justify-center bg-paper/95 px-6 py-10 backdrop-blur-sm"
    >
      <div className="w-full max-w-[560px]">
        <div className="premium-card p-6 md:p-8">
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-4 h-10 w-36">
              <Image
                src="/logo.png"
                alt="PSL Labs"
                fill
                className="object-contain"
                priority
              />
            </div>

            <p className="mono text-ash">RESEARCHER VERIFICATION</p>
            <h1
              id="researcher-verification-title"
              className="mt-3 font-display text-2xl font-bold text-ink md:text-3xl"
            >
              Researcher Verification
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-ash md:text-base">
              Access is restricted. Confirm eligibility to enter PSL Labs.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <label className="flex items-start gap-3 rounded-xl border border-linen bg-lab-white px-4 py-3">
              <input
                type="checkbox"
                checked={ageChecked}
                onChange={(e) => setAgeChecked(e.target.checked)}
                className="mt-1 size-4 accent-primary-blue"
              />
              <span className="text-sm leading-relaxed text-ink">
                I am at least 21 years of age
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-linen bg-lab-white px-4 py-3">
              <input
                type="checkbox"
                checked={ruoChecked}
                onChange={(e) => setRuoChecked(e.target.checked)}
                className="mt-1 size-4 accent-primary-blue"
              />
              <span className="text-sm leading-relaxed text-ink">
                I confirm products are for research and laboratory use only, not
                for human or veterinary use
              </span>
            </label>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleEnter}
              disabled={!canEnter}
              className="inline-flex w-full items-center justify-center rounded-pill bg-ink px-6 py-3.5 text-base font-medium text-lab-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Enter Site
            </button>

            <a
              href="https://google.com"
              className="text-center text-sm font-medium text-ash underline underline-offset-4 transition-opacity hover:opacity-80"
              rel="nofollow"
            >
              Exit
            </a>
          </div>
        </div>

        <p className="mt-4 text-center text-xs leading-relaxed text-ash">
          You may be asked again if you clear your site data.
        </p>
      </div>
    </div>
  );
}

