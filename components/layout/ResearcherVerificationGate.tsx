"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useRef, useState, useSyncExternalStore } from "react";

import { PSLLogo } from "@/components/branding/psl-logo";
import styles from "./entry-gate.module.css";
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
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup
          className={styles.popup}
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
          <div className={styles.wrapper}>
            <div className={styles.panel}>
              <div className={styles.intro}>
                <div className={styles.brand}>
                  <PSLLogo height={40} eager />
                  <span>Laboratory research materials</span>
                </div>

                <p className={styles.eyebrow}>AGE AND RESEARCH USE</p>
                <Dialog.Title
                  className={styles.title}
                >
                  Age and research-use confirmation
                </Dialog.Title>
                <Dialog.Description className={styles.description}>
                  Confirm your age and intended laboratory use to enter PSL Labs.
                </Dialog.Description>
              </div>

              <div className={styles.choices}>
                <label className={styles.choice}>
                  <input
                    ref={ageCheckbox}
                    type="checkbox"
                    checked={ageChecked}
                    onChange={(e) => setAgeChecked(e.target.checked)}
                    className={styles.checkbox}
                  />
                  <span>
                    I am at least 21 years of age
                  </span>
                </label>

                <label className={styles.choice}>
                  <input
                    type="checkbox"
                    checked={ruoChecked}
                    onChange={(e) => setRuoChecked(e.target.checked)}
                    className={styles.checkbox}
                  />
                  <span>
                    I confirm products are for research and laboratory use only, not
                    for human or veterinary use
                  </span>
                </label>
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  onClick={handleEnter}
                  disabled={!canEnter}
                  className={styles.enter}
                >
                  Enter Site
                </button>

                <a
                  href="https://google.com"
                  className={styles.exit}
                  rel="nofollow"
                >
                  Exit
                </a>
              </div>
            </div>

            <p className={styles.footnote}>
              You may be asked again if you clear your site data.
            </p>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

