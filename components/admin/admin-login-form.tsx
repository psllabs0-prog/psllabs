"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";

export function AdminLoginForm({ redirectTo }: { redirectTo?: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          const seconds = Number(res.headers.get("Retry-After"));
          const minutes = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds / 60) : null;
          setError(`Too many sign-in attempts. ${minutes ? `Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` : "Please wait before trying again."}`);
        } else if (res.status === 401) {
          setError("Incorrect password.");
        } else if (res.status === 403) {
          setError("Sign in from this website directly. Reload this page and try again.");
        } else {
          setError("Sign-in protection is temporarily unavailable. Please try again later.");
        }
        return;
      }

      if (redirectTo) {
        const destination = new URL(redirectTo, window.location.origin);
        if (destination.origin === window.location.origin) {
          window.location.href = destination.href;
        } else {
          window.location.reload();
        }
      } else {
        window.location.reload();
      }
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="premium-card mx-auto flex max-w-md flex-col gap-4 p-6"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-password" className="text-sm font-medium text-ink">
          Password
        </label>
        <Input
          id="admin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="h-11 rounded-lg border-linen bg-lab-white px-3"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-signal">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full items-center justify-center rounded-pill bg-accent px-6 py-3.5 text-base font-medium text-page transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
