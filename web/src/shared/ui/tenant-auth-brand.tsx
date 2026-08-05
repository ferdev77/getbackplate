import { ThemeAwareGetBackplateLogo } from "@/shared/ui/theme-aware-getbackplate-logo";
import { BRAND_SCALE } from "@/shared/ui/brand-scale";

/**
 * El encabezado de marca de las pantallas de autenticacion.
 *
 * Muestra el logo de la empresa cuando tiene marca propia, y el de GetBackplate
 * cuando no. Vive aparte porque lo necesitan varias pantallas del mismo
 * recorrido -- entrar, verificar el codigo, recuperar la clave -- y cuando cada
 * una lo escribia por su cuenta, alguna se quedaba atras: la verificacion en dos
 * pasos mostraba GetBackplate en medio del login de una empresa con marca
 * propia, justo despues de una pantalla que si mostraba la suya.
 */

export type TenantAuthBranding = {
  companyName: string;
  logoUrl: string;
  logoDarkUrl: string;
};

export function TenantAuthBrand({
  branding,
  /** Que dice debajo del logo de la empresa. */
  caption = "Company access",
}: {
  branding: TenantAuthBranding | null;
  caption?: string;
}) {
  if (!branding) {
    return (
      <div className="mb-5 flex justify-center">
        <ThemeAwareGetBackplateLogo
          width={230}
          height={42}
          className={`${BRAND_SCALE.authHeight} w-auto`}
          priority
        />
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-col items-center justify-center text-center">
      <div className="grid min-h-[92px] min-w-[240px] place-items-center rounded-[var(--gbp-radius-xl)] border border-[var(--gbp-border)] bg-[linear-gradient(160deg,var(--gbp-surface)_0%,var(--gbp-bg)_100%)] px-4 py-4">
        {branding.logoUrl ? (
          <picture>
            {branding.logoDarkUrl ? (
              <source media="(prefers-color-scheme: dark)" srcSet={branding.logoDarkUrl} />
            ) : null}
            <img
              src={branding.logoUrl}
              alt={`${branding.companyName} logo`}
              className="block h-auto max-h-14 w-auto max-w-[190px] object-contain"
            />
          </picture>
        ) : (
          <span className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--gbp-text)]">
            {branding.companyName}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-[var(--gbp-text2)]">{caption}</p>
    </div>
  );
}
