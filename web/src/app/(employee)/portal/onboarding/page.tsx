import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireEmployeeModule } from "@/shared/lib/access";

export default async function EmployeeOnboardingPage() {
  await requireEmployeeModule("onboarding");
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) return null;

  return (
    <>
      <article className="mb-5 rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-8 py-7">
        <div className="mb-5 flex items-center gap-3.5">
          <span className="text-[26px]">📖</span>
          <h2 className="font-serif text-[18px] font-bold text-[var(--gbp-text)]">Como usar este portal?</h2>
        </div>
        <p className="mb-6 border-b border-[var(--gbp-border)] pb-6 text-[14px] leading-7 text-[var(--gbp-text2)]">
          Este portal te permite consultar y descargar los documentos importantes para tu puesto. Es muy sencillo - no necesitas conocimientos tecnicos. Sigue los pasos y en menos de un minuto tendras acceso a todo lo que necesitas.
        </p>

        <div className="mb-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--gbp-muted)]">
          <span>Pasos para acceder a tus documentos</span>
          <span className="h-px flex-1 bg-[var(--gbp-border)]" />
        </div>

        <div className="mb-6 flex flex-col gap-[18px]">
          <div className="flex items-start gap-4">
            <div className="mt-[1px] grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[var(--gbp-text)] text-[12px] font-bold text-white">1</div>
            <div>
              <p className="mb-1 text-[14px] font-bold text-[var(--gbp-text)]">Inicia sesion con tu usuario y contrasena</p>
              <p className="text-[13px] leading-6 text-[var(--gbp-text2)]">Tu gerente te entrego credenciales unicas. Tu usuario suele ser tu correo corporativo.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="mt-[1px] grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[var(--gbp-text)] text-[12px] font-bold text-white">2</div>
            <div>
              <p className="mb-1 text-[14px] font-bold text-[var(--gbp-text)]">Ve a la pestana &quot;Mis Documentos&quot;</p>
              <p className="text-[13px] leading-6 text-[var(--gbp-text2)]">Ahi encontraras unicamente los archivos asignados a tu puesto y sucursal. No veras documentos de otras areas - eso es intencional.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="mt-[1px] grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[var(--gbp-text)] text-[12px] font-bold text-white">3</div>
            <div>
              <p className="mb-1 text-[14px] font-bold text-[var(--gbp-text)]">Usa &quot;Vista previa&quot; antes de descargar</p>
              <p className="text-[13px] leading-6 text-[var(--gbp-text2)]">Puedes revisar el documento rapidamente desde tu telefono sin necesidad de descargarlo.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="mt-[1px] grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[var(--gbp-text)] text-[12px] font-bold text-white">4</div>
            <div>
              <p className="mb-1 text-[14px] font-bold text-[var(--gbp-text)]">Descarga si necesitas tenerlo guardado</p>
              <p className="text-[13px] leading-6 text-[var(--gbp-text2)]">Haz clic en &quot;Descargar&quot; y el archivo se guardara en tu dispositivo en PDF. Puedes abrirlo despues sin internet.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="mt-[1px] grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[var(--gbp-text)] text-[12px] font-bold text-white">5</div>
            <div>
              <p className="mb-1 text-[14px] font-bold text-[var(--gbp-text)]">Revisa &quot;Inicio&quot; regularmente</p>
              <p className="text-[13px] leading-6 text-[var(--gbp-text2)]">Ahi publicaremos avisos importantes, actualizaciones y comunicados de la direccion.</p>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-[10px] border-[1.5px] border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] px-[18px] py-4">
          <span className="text-[18px]">💡</span>
          <p className="text-[13px] leading-6 text-[var(--gbp-text2)]"><strong className="text-[var(--gbp-success)]">Tip:</strong> Puedes entrar desde tu celular, tablet o computadora. No necesitas instalar nada - solo abre el navegador y entra con tu usuario.</p>
        </div>
      </article>

      <article className="rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-8 py-7">
        <div className="mb-5 flex items-center gap-3.5">
          <span className="text-[26px]">📜</span>
          <h2 className="font-serif text-[18px] font-bold text-[var(--gbp-text)]">Reglas de uso</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[10px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-[18px]">
            <p className="mb-2 text-[22px]">🔐</p>
            <p className="mb-1 text-[13px] font-bold text-[var(--gbp-text)]">Credenciales personales</p>
            <p className="text-[12px] leading-6 text-[var(--gbp-text2)]">Tu usuario y contrasena son solo tuyas. No las compartas con nadie.</p>
          </div>
          <div className="rounded-[10px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-[18px]">
            <p className="mb-2 text-[22px]">📵</p>
            <p className="mb-1 text-[13px] font-bold text-[var(--gbp-text)]">No compartir documentos</p>
            <p className="text-[12px] leading-6 text-[var(--gbp-text2)]">Los archivos son para uso interno. No los envies por WhatsApp ni redes sociales.</p>
          </div>
          <div className="rounded-[10px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-[18px]">
            <p className="mb-2 text-[22px]">🔄</p>
            <p className="mb-1 text-[13px] font-bold text-[var(--gbp-text)]">Versiones actualizadas</p>
            <p className="text-[12px] leading-6 text-[var(--gbp-text2)]">Siempre descarga la version mas reciente. Las anteriores pueden estar desactualizadas.</p>
          </div>
          <div className="rounded-[10px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-[18px]">
            <p className="mb-2 text-[22px]">🆘</p>
            <p className="mb-1 text-[13px] font-bold text-[var(--gbp-text)]">Problemas de acceso?</p>
            <p className="text-[12px] leading-6 text-[var(--gbp-text2)]">Contacta a tu gerente o al equipo de soporte interno de tu empresa.</p>
          </div>
        </div>
      </article>
    </>
  );
}
