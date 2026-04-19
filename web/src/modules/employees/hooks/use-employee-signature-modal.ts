/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";

type SignatureState = { open: boolean; slot: string | null; src: string | null };

export function useEmployeeSignatureModal(onCompleted: (slot: string) => void) {
  const [signatureModal, setSignatureModal] = useState<SignatureState>({
    open: false,
    slot: null,
    src: null,
  });
  const [docusealReady, setDocusealReady] = useState(false);
  const [docusealLoadFailed, setDocusealLoadFailed] = useState(false);

  const openSignatureInNewTab = () => {
    if (!signatureModal.src) return;
    window.open(signatureModal.src, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (!signatureModal.open || !signatureModal.src) return;
    if (typeof window === "undefined") return;

    const timeout = window.setTimeout(() => {
      setDocusealLoadFailed(true);
    }, 8000);

    const customElementReady =
      typeof window.customElements !== "undefined" && window.customElements.get("docuseal-form");
    if (customElementReady) {
      setDocusealReady(true);
      setDocusealLoadFailed(false);
      window.clearTimeout(timeout);
      return;
    }

    const existingScript = document.getElementById("docuseal-form-script") as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener(
        "load",
        () => {
          setDocusealReady(true);
          setDocusealLoadFailed(false);
          window.clearTimeout(timeout);
        },
        { once: true },
      );
      existingScript.addEventListener(
        "error",
        () => {
          setDocusealLoadFailed(true);
          window.clearTimeout(timeout);
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = "docuseal-form-script";
    script.src = "https://cdn.docuseal.com/js/form.js";
    script.async = true;
    script.onload = () => {
      setDocusealReady(true);
      setDocusealLoadFailed(false);
      window.clearTimeout(timeout);
    };
    script.onerror = () => {
      setDocusealLoadFailed(true);
      window.clearTimeout(timeout);
    };
    document.body.appendChild(script);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [signatureModal.open, signatureModal.src]);

  useEffect(() => {
    if (!signatureModal.open) return;

    const expectedOrigin = (() => {
      if (!signatureModal.src) return null;
      try {
        return new URL(signatureModal.src).origin;
      } catch {
        return null;
      }
    })();

    const handler = (event: MessageEvent) => {
      if (expectedOrigin && event.origin !== expectedOrigin) return;

      const isCompleted =
        event.data?.type === "docuseal:completed" ||
        event.data?.event === "completed" ||
        event.data?.completed === true;

      if (!isCompleted) return;

      const slotToRefresh = signatureModal.slot;
      setSignatureModal({ open: false, slot: null, src: null });
      setDocusealReady(false);
      setDocusealLoadFailed(false);

      if (slotToRefresh) {
        onCompleted(slotToRefresh);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onCompleted, signatureModal.open, signatureModal.slot, signatureModal.src]);

  return {
    signatureModal,
    setSignatureModal,
    docusealReady,
    setDocusealReady,
    docusealLoadFailed,
    setDocusealLoadFailed,
    openSignatureInNewTab,
  };
}
