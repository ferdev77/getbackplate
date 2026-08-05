"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Boton de Google que abre una ventana emergente en vez de sacar al usuario de
 * la pagina.
 *
 * Es el camino para los dominios propios. Con el boton clasico, entrar desde
 * juans.com obliga a saltar al dominio canonico, autenticar alla y traer la
 * sesion de vuelta con un token puente: ocho pasos y dos formularios
 * invisibles, porque Google solo puede volver a un dominio. Aca Google entrega
 * el token en la misma pagina y la sesion se crea donde el usuario ya estaba.
 *
 * Requiere que el dominio este declarado como origen autorizado en la
 * credencial de Google, y NEXT_PUBLIC_GOOGLE_CLIENT_ID en el entorno. Sin
 * cualquiera de las dos cosas hay que seguir usando GoogleSignInButton.
 */

const GSI_SRC = "https://accounts.google.com/gsi/client";

type CredentialResponse = { credential?: string };

/**
 * Google avisa por aca cuando la ventana no llega a abrirse o el origen no
 * esta autorizado. Es la unica forma de enterarse: renderButton dibuja igual
 * aunque el dominio no este declarado, y el problema recien aparece al tocar.
 */
type GoogleErrorResponse = { type?: string };

type GoogleIdApi = {
  initialize: (config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    error_callback?: (error: GoogleErrorResponse) => void;
    nonce: string;
    ux_mode: "popup";
    auto_select: boolean;
    itp_support: boolean;
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

/** 32 bytes al azar, en la misma forma que espera el servidor. */
function createNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * A Google se le da el hash del nonce y al servidor el valor original: Supabase
 * hashea el que recibe y lo compara con el que viene dentro del token. Asi un
 * id_token robado no sirve en otro intento.
 */
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function loadGoogleScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("gsi")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("gsi"));
    document.head.appendChild(script);
  });
}

export function GooglePopupSignInButton({
  clientId,
  organizationHint,
  billingTrack,
  fallbackHref,
}: {
  clientId: string;
  organizationHint?: string;
  billingTrack: "integracion" | "plataforma";
  /** Adonde mandar si el navegador no puede con la ventana emergente. */
  fallbackHref: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Si Google no carga, no se deja al usuario sin forma de entrar: se muestra
  // el boton de siempre, que hace el recorrido largo pero funciona.
  const [degraded, setDegraded] = useState(false);

  const handleCredential = useCallback(
    async (credential: string, nonce: string) => {
      setError(null);
      try {
        const response = await fetch("/api/auth/google/popup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            credential,
            nonce,
            org: organizationHint ?? "",
            desde: billingTrack,
          }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          redirectTo?: string;
          error?: string;
        };
        if (!response.ok || !result.redirectTo) {
          setError(result.error || "Unable to complete sign-in.");
          return;
        }
        window.location.assign(result.redirectTo);
      } catch {
        setError("Unable to complete sign-in.");
      }
    },
    [billingTrack, organizationHint],
  );

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        await loadGoogleScript();
        if (cancelled) return;
        const api = window.google?.accounts?.id;
        const container = containerRef.current;
        if (!api || !container) {
          setDegraded(true);
          return;
        }

        const nonce = createNonce();
        api.initialize({
          client_id: clientId,
          nonce: await sha256(nonce),
          ux_mode: "popup",
          auto_select: false,
          itp_support: true,
          callback: (response) => {
            if (response.credential) void handleCredential(response.credential, nonce);
          },
          error_callback: (googleError) => {
            // Cerrar la ventana a proposito no es una falla: se deja el boton
            // como esta para que pueda volver a intentar.
            if (googleError?.type === "popup_closed") return;
            // Cualquier otra cosa -- tipicamente el dominio sin declarar como
            // origen autorizado -- deja al usuario sin poder entrar. Se cae al
            // camino largo, que da la vuelta por el dominio canonico pero
            // funciona siempre.
            setDegraded(true);
          },
        });
        container.innerHTML = "";
        api.renderButton(container, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          logo_alignment: "center",
          width: 320,
        });
      } catch {
        if (!cancelled) setDegraded(true);
      }
    }

    void setup();
    return () => {
      cancelled = true;
    };
  }, [clientId, handleCredential]);

  if (degraded) {
    return (
      <a
        href={fallbackHref}
        aria-label="Sign in with Google"
        className="flex h-10 w-full items-center justify-center gap-3 rounded-[var(--gbp-radius-lg)] border border-[var(--gbp-border2)] bg-white px-4 text-sm font-medium text-[#3c4043] shadow-sm transition hover:bg-gray-50"
      >
        Sign in with Google
      </a>
    );
  }

  return (
    <div>
      <div ref={containerRef} className="flex justify-center" />
      {error ? (
        <div className="mt-2 text-center">
          <p className="text-xs text-[var(--gbp-danger)]">{error}</p>
          {/* Siempre queda una salida: si el canje falla por algo que no
              previmos, el camino largo sigue disponible a un clic. */}
          <a href={fallbackHref} className="mt-1 inline-block text-[11px] underline text-[var(--gbp-text2)]">
            Probar con el método tradicional
          </a>
        </div>
      ) : null}
    </div>
  );
}
