"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";

/**
 * El signo de pregunta que acompaña a la etiqueta de un campo y explica para
 * que sirve.
 *
 * Se abre al pasar el mouse y tambien al tocarlo. Lo segundo no es un adorno:
 * en un telefono no existe el hover, asi que sin el clic la ayuda seria
 * invisible justo donde mas cuesta leer un formulario.
 *
 * A diferencia de TooltipLabel -- que es de una linea y sirve para nombrar un
 * boton -- este admite un parrafo, porque lo que explica es como funciona el
 * campo.
 */
export function FieldHelp({
  text,
  /** Hacia donde se abre. Cerca del borde derecho conviene "left". */
  align = "right",
}: {
  text: string;
  align?: "right" | "left";
}) {
  const [open, setOpen] = useState(false);
  // Hacia donde se abre verticalmente. El modal tiene scroll propio, asi que un
  // globo que se sale por arriba queda cortado: en el primer campo, que esta
  // pegado al borde, se perdia la primera linea del texto.
  const [abreHaciaAbajo, setAbreHaciaAbajo] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  /**
   * Elige el lado antes de mostrar el globo.
   *
   * Se mira el espacio libre por arriba dentro del contenedor que recorta --
   * el que tiene scroll, no la ventana -- porque es ese el que corta. Si no
   * entra, se abre hacia abajo.
   */
  function acomodar() {
    const boton = wrapperRef.current;
    if (!boton) return;

    const caja = boton.getBoundingClientRect();
    let limiteSuperior = 0;
    for (let padre = boton.parentElement; padre; padre = padre.parentElement) {
      const overflow = getComputedStyle(padre).overflowY;
      if (overflow === "auto" || overflow === "scroll" || overflow === "hidden") {
        limiteSuperior = padre.getBoundingClientRect().top;
        break;
      }
    }

    // Alto estimado del globo mas su separacion. Es una cota holgada: si no
    // entra comodo arriba, abajo siempre hay lugar porque el modal scrollea.
    const ALTO_ESTIMADO = 96;
    setAbreHaciaAbajo(caja.top - limiteSuperior < ALTO_ESTIMADO);
  }

  // Tocar fuera cierra la ayuda: en un telefono, sin esto queda abierta tapando
  // el campo siguiente.
  useEffect(() => {
    if (!open) return;
    function alTocarFuera(event: MouseEvent | TouchEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function alEscapar(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", alTocarFuera);
    document.addEventListener("touchstart", alTocarFuera);
    document.addEventListener("keydown", alEscapar);
    return () => {
      document.removeEventListener("mousedown", alTocarFuera);
      document.removeEventListener("touchstart", alTocarFuera);
      document.removeEventListener("keydown", alEscapar);
    };
  }, [open]);

  return (
    <span ref={wrapperRef} className="relative ml-1.5 inline-flex align-middle">
      <button
        type="button"
        aria-label={text}
        aria-expanded={open}
        onClick={() => {
          acomodar();
          setOpen((previo) => !previo);
        }}
        onMouseEnter={() => {
          acomodar();
          setOpen(true);
        }}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => {
          acomodar();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--gbp-muted)] transition hover:text-[var(--gbp-accent)] focus:text-[var(--gbp-accent)] focus:outline-none"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      {open ? (
        <span
          role="tooltip"
          className={`absolute z-[120] w-64 rounded-lg bg-[var(--gbp-text)] px-3 py-2 text-[11px] font-normal leading-[1.5] text-[var(--gbp-bg)] shadow-[0_8px_20px_rgba(0,0,0,0.18)] ${
            align === "left" ? "right-0" : "left-0"
          } ${abreHaciaAbajo ? "top-full mt-2" : "bottom-full mb-2"}`}
        >
          {text}
          <span
            className={`absolute border-[5px] border-transparent ${
              align === "left" ? "right-1" : "left-1"
            } ${
              abreHaciaAbajo
                ? "bottom-full border-b-[var(--gbp-text)]"
                : "top-full border-t-[var(--gbp-text)]"
            }`}
          />
        </span>
      ) : null}
    </span>
  );
}
