"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useRef, useState, useSyncExternalStore } from "react";

import { PSLLogo } from "@/components/branding/psl-logo";
import {
  confirmResearcherVerification, readResearcherVerification,
  serverResearcherVerification, subscribeResearcherVerification,
} from "@/lib/privacy/researcher-verification";

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function ResearcherVerificationGate() {
  const [ageChecked, setAgeChecked] = useState(false);
  const [ruoChecked, setRuoChecked] = useState(false);
  const isVerified = useSyncExternalStore(
    subscribeResearcherVerification, readResearcherVerification, serverResearcherVerification
  );
  const ageCheckbox = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    clientSnapshot,
    serverSnapshot
  );
  const canEnter = ageChecked && ruoChecked;

  function handleEnter() {
    if (!canEnter) return;
    confirmResearcherVerification();
  }

  if (!mounted) return null;

  return (
    <Dialog.Root
      open={!isVerified}
      disablePointerDismissal
      onOpenChange={(open, details) => {
        // Eligibility must still be confirmed before entering the site.
        if (!open) details.cancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[100] bg-paper/95 backdrop-blur-sm" />
        <Dialog.Popup
          className="fixed inset-0 z-[101] flex min-h-dvh flex-col items-center overflow-y-auto px-6 py-10 outline-none"
          initialFocus={() => {
            previousFocus.current = document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
            return ageCheckbox.current;
          }}
          finalFocus={() => {
            const previous = previousFocus.current;
            return previous?.isConnected && previous !== document.body
              ? previous
              : document.querySelector<HTMLElement>("header a[href='/']");
          }}
        >
          <div className="my-auto w-full max-w-[560px]">
            <div className="premium-card p-6 md:p-8">
              <div className="flex flex-col items-center text-center">
                <div className="mb-5 flex justify-center">
                  <PSLLogo height={48} eager />
                </div>

                <p className="mono text-ash">RESEARCHER VERIFICATION</p>
                <Dialog.Title
                  className="mt-3 font-display text-2xl font-bold text-ink md:text-3xl"
                >
                  Researcher Verification
                </Dialog.Title>
                <Dialog.Description className="mt-3 text-sm leading-relaxed text-ash md:text-base">
                  Access is restricted. Confirm eligibility to enter PSL Labs.
                </Dialog.Description>
              </div>

              <div className="mt-6 space-y-4">
                <label className="flex items-start gap-3 rounded-xl border border-linen bg-lab-white px-4 py-3">
                  <input
                    ref={ageCheckbox}
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
                  className="inline-flex w-full items-center justify-center rounded-pill bg-accent px-6 py-3.5 text-base font-medium text-page transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
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
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

