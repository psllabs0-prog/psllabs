"use client";

import { useEffect, useId, useRef, useState } from "react";
import Script from "next/script";

type AuthNetConfig = {
  enabled: boolean;
  apiLoginId: string | null;
  clientKey: string | null;
  environment: "sandbox" | "production" | null;
  acceptUiScriptUrl: string | null;
};

type OpaqueData = {
  dataDescriptor: string;
  dataValue: string;
};

type AcceptUiMessage = { code?: string; text?: string };

type AcceptUiResponse = {
  messages: {
    resultCode: string;
    message: AcceptUiMessage[];
  };
  opaqueData?: OpaqueData;
};

declare global {
  interface Window {
    __pslAuthNetAcceptHandler?: (response: AcceptUiResponse) => void;
  }
}

export function useAuthNetConfig() {
  const [config, setConfig] = useState<AuthNetConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/authnet-config")
      .then((res) => res.json() as Promise<AuthNetConfig>)
      .then((data) => {
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) {
          setConfig({
            enabled: false,
            apiLoginId: null,
            clientKey: null,
            environment: null,
            acceptUiScriptUrl: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}

/**
 * Authorize.net Accept UI lightbox — card data is entered on Auth.net's
 * hosted form (SAQ A). Returns opaqueData for our /api/checkout-card charge.
 */
export function AcceptUiLauncher({
  config,
  disabled,
  onToken,
  onError,
  onBeforeOpen,
}: {
  config: AuthNetConfig;
  disabled?: boolean;
  onToken: (opaque: OpaqueData) => void;
  onError: (message: string) => void;
  /** Return false to cancel opening the hosted payment form. */
  onBeforeOpen?: () => boolean;
}) {
  const handlerName = "__pslAuthNetAcceptHandler";
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const instanceId = useId();

  useEffect(() => {
    window[handlerName] = (response: AcceptUiResponse) => {
      if (response.messages.resultCode === "Error") {
        const text =
          response.messages.message
            ?.map((m) => m.text)
            .filter(Boolean)
            .join(" ") || "Unable to tokenize card.";
        onError(text);
        return;
      }
      if (!response.opaqueData?.dataDescriptor || !response.opaqueData?.dataValue) {
        onError("Payment tokenization returned incomplete data.");
        return;
      }
      onToken(response.opaqueData);
    };
    return () => {
      delete window[handlerName];
    };
  }, [onError, onToken]);

  if (
    !config.enabled ||
    !config.apiLoginId ||
    !config.clientKey ||
    !config.acceptUiScriptUrl
  ) {
    return null;
  }

  return (
    <>
      <Script
        src={config.acceptUiScriptUrl}
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />
      {/* Accept UI binds to .AcceptUI; keep in DOM but visually hidden as a launcher. */}
      <button
        ref={buttonRef}
        type="button"
        id={`accept-ui-btn-${instanceId}`}
        className="AcceptUI sr-only"
        tabIndex={-1}
        aria-hidden
        disabled={disabled || !scriptReady}
        data-billingAddressOptions='{"show":false, "required":false}'
        data-apiLoginID={config.apiLoginId}
        data-clientKey={config.clientKey}
        data-acceptUIFormBtnTxt="Continue"
        data-acceptUIFormHeaderTxt="Card details"
        data-paymentOptions='{"showCreditCard":true, "showBankAccount":true}'
        data-responseHandler={handlerName}
      >
        Open Accept UI
      </button>
      <button
        type="button"
        disabled={disabled || !scriptReady}
        onClick={() => {
          if (onBeforeOpen && !onBeforeOpen()) return;
          buttonRef.current?.click();
        }}
        className="mt-5 inline-flex w-full items-center justify-center rounded-pill bg-ink px-6 py-3.5 text-base font-medium text-lab-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled
          ? "Processing payment…"
          : scriptReady
            ? "Pay securely with card or bank"
            : "Loading secure payment…"}
      </button>
    </>
  );
}
