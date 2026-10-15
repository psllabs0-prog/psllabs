"use client";

import { useEffect, useState } from "react";
import { confirmResearcherVerification } from "@/lib/privacy/researcher-verification";
import styles from "./research-account.module.css";

/** Mounted only inside the server-authenticated store. This copies the stated
 * age/RUO declaration for existing consent UI; it never grants cookie permission. */
export function ResearchAccountDeclarationBridge() {
  useEffect(() => { confirmResearcherVerification(); }, []);
  return null;
}

export function ResearchAccountSignOut() {
  const [busy,setBusy] = useState(false), [error,setError] = useState<string | null>(null);
  return <><button className={styles.button} disabled={busy} onClick={async () => {
    setBusy(true);setError(null);
    try {
      const response = await fetch("/api/research-auth/sign-out", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error("Sign-out could not be confirmed. Please try again.");
      window.location.replace("/research-account/sign-in");
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Please try again.");setBusy(false); }
  }}>{busy ? "Signing out…" : "Sign out"}</button>{error && <p className={styles.notice} role="alert">{error}</p>}</>;
}
