import type { TenantEmailBranding } from "@/shared/lib/email-branding";

type RenewalReminderProps = { orgName: string; renewalDate: string; amount: string };
export function planRenewalReminderTemplate({ orgName, renewalDate, amount }: RenewalReminderProps) {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #171311;">
      <h2>Hola ${orgName},</h2>
      <p>Queríamos recordarte que tu plan actual se renovará pronto, el próximo <strong>${renewalDate}</strong>.</p>
      <p>El importe de la renovación será de <strong>${amount}</strong>.</p>
      <br />
      <p>Si deseas realizar algún cambio en tu suscripción, puedes hacerlo desde tu panel de administración.</p>
      <br />
      <p>Gracias por confiar en GetBackplate.</p>
      <p style="color: #666; font-size: 12px;">El equipo de GetBackplate</p>
    </div>
  `;
}

type PlanChangeDecisionProps = {
  orgName: string;
  actorName: string;
  actorEmail: string;
  previousPlanName: string;
  targetPlanName: string;
  targetPlanPrice: string;
  targetPlanLimits: Array<{ label: string; value: string }>;
  modulesToEnable: string[];
  modulesToDisable: string[];
  direction: "upgrade" | "downgrade";
  happenedAt: string;
  branding?: TenantEmailBranding;
};

function renderBrandingHeader(branding?: TenantEmailBranding) {
  const defaultLogo = `${(process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://getbackplate.com").replace(/\/$/, "")}/getbackplate-logo-light.svg`;

  if (!branding?.isCustom) {
    return `
      <div style="margin:0 0 10px 0;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;display:inline-block;">
        <img src="${defaultLogo}" alt="GetBackplate" style="max-height:42px;width:auto;display:block;" />
      </div>
    `;
  }

  const logo = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="Logo ${branding.companyName}" style="max-height:42px;width:auto;display:block;" />`
    : `<p style="margin:0;font-size:12px;font-weight:700;color:#374151;">${branding.companyName}</p>`;

  return `
    <div style="margin:0 0 10px 0;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;display:inline-block;">
      ${logo}
    </div>
  `;
}

function resolveBillingBrandName(branding?: TenantEmailBranding) {
  return branding?.isCustom ? branding.companyName : "GetBackplate";
}

function renderModuleList(items: string[], emptyLabel: string, accentColor: string, bgColor: string) {
  if (!items.length) {
    return `<p style="margin:0;color:#6b7280;font-size:12px;">${emptyLabel}</p>`;
  }

  return `
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
      ${items
        .map(
          (item) =>
            `<span style="display:inline-block;border:1px solid ${accentColor};background:${bgColor};color:${accentColor};padding:5px 10px;border-radius:999px;font-size:11px;font-weight:700;">${item}</span>`,
        )
        .join("")}
    </div>
  `;
}

export function planChangeDecisionTemplate({
  orgName,
  actorName,
  actorEmail,
  previousPlanName,
  targetPlanName,
  targetPlanPrice,
  targetPlanLimits,
  modulesToEnable,
  modulesToDisable,
  direction,
  happenedAt,
  branding,
}: PlanChangeDecisionProps) {
  const isDowngrade = direction === "downgrade";
  const title = isDowngrade ? "Se solicito un downgrade de plan" : "Se solicito un upgrade de plan";
  const subtitle = isDowngrade
    ? "Revisa los modulos que pueden quedar desactivados con el nuevo plan."
    : "Tu organizacion desbloquea nuevas capacidades con el nuevo plan.";
  const accent = isDowngrade ? "#d97706" : "#059669";
  const accentSoft = isDowngrade ? "#fff7ed" : "#ecfdf5";

  const limitsHtml = targetPlanLimits
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:12px;">${item.label}</td>
          <td style="padding:8px 0;color:#111827;font-size:12px;font-weight:700;text-align:right;">${item.value}</td>
        </tr>
      `,
    )
    .join("");

  const brandName = resolveBillingBrandName(branding);

  return `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto;background:#f5f6f8;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.06);">
        <div style="height:6px;background:${accent};"></div>

        <div style="padding:24px 24px 8px 24px;">
          ${renderBrandingHeader(branding)}
          <h2 style="margin:0;font-size:24px;line-height:1.2;color:#111827;">${title}</h2>
          <p style="margin:10px 0 0 0;color:#4b5563;font-size:14px;line-height:1.5;">${subtitle}</p>
        </div>

        <div style="padding:16px 24px 0 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;background:#fafafa;">
            <p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Resumen del cambio</p>
            <p style="margin:0;color:#111827;font-size:14px;"><strong>${previousPlanName}</strong> -> <strong>${targetPlanName}</strong></p>
            <p style="margin:6px 0 0 0;color:#111827;font-size:14px;">Nuevo costo: <strong>${targetPlanPrice}</strong></p>
          </div>
        </div>

        <div style="padding:16px 24px 0 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;">
            <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Solicitado por</p>
            <p style="margin:0;color:#111827;font-size:14px;"><strong>${actorName}</strong> (${actorEmail})</p>
            <p style="margin:6px 0 0 0;color:#6b7280;font-size:12px;">Fecha: ${happenedAt}</p>
          </div>
        </div>

        <div style="padding:16px 24px 0 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;background:${accentSoft};">
            <p style="margin:0 0 10px 0;font-size:12px;color:#374151;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Modulos que se activan</p>
            ${renderModuleList(modulesToEnable, "No se detectaron nuevos modulos para este cambio.", "#047857", "#d1fae5")}
            <div style="height:12px;"></div>
            <p style="margin:0 0 10px 0;font-size:12px;color:#374151;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Modulos que se desactivan</p>
            ${renderModuleList(modulesToDisable, "No se detectaron modulos a desactivar.", "#b45309", "#ffedd5")}
          </div>
        </div>

        <div style="padding:16px 24px 8px 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;">
            <p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Limites del nuevo plan</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tbody>
                ${limitsHtml}
              </tbody>
            </table>
          </div>
        </div>

        <div style="padding:12px 24px 24px 24px;">
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">
            Esta notificacion confirma que el cambio de plan fue solicitado desde la cuenta administradora de <strong>${orgName}</strong>.
            Si no reconoces esta accion, revisa de inmediato los accesos en tu panel.
          </p>
          <p style="margin:10px 0 0 0;color:#9ca3af;font-size:11px;">${brandName} Billing</p>
        </div>
      </div>
    </div>
  `;
}

type PlanChangeAppliedProps = {
  orgName: string;
  actorName: string;
  actorEmail: string;
  previousPlanName: string;
  targetPlanName: string;
  targetPlanPrice: string;
  targetPlanLimits: Array<{ label: string; value: string }>;
  modulesToEnable: string[];
  modulesToDisable: string[];
  direction: "upgrade" | "downgrade";
  appliedAt: string;
  branding?: TenantEmailBranding;
};

export function planChangeAppliedTemplate({
  orgName,
  actorName,
  actorEmail,
  previousPlanName,
  targetPlanName,
  targetPlanPrice,
  targetPlanLimits,
  modulesToEnable,
  modulesToDisable,
  direction,
  appliedAt,
  branding,
}: PlanChangeAppliedProps) {
  const isDowngrade = direction === "downgrade";
  const title = isDowngrade ? "Cambio de plan aplicado: downgrade completado" : "Cambio de plan aplicado: upgrade completado";
  const accent = isDowngrade ? "#d97706" : "#059669";
  const accentSoft = isDowngrade ? "#fff7ed" : "#ecfdf5";

  const limitsHtml = targetPlanLimits
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:12px;">${item.label}</td>
          <td style="padding:8px 0;color:#111827;font-size:12px;font-weight:700;text-align:right;">${item.value}</td>
        </tr>
      `,
    )
    .join("");

  const brandName = resolveBillingBrandName(branding);

  return `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto;background:#f5f6f8;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.06);">
        <div style="height:6px;background:${accent};"></div>

        <div style="padding:24px 24px 8px 24px;">
          ${renderBrandingHeader(branding)}
          <h2 style="margin:0;font-size:24px;line-height:1.2;color:#111827;">${title}</h2>
          <p style="margin:10px 0 0 0;color:#4b5563;font-size:14px;line-height:1.5;">El cambio fue confirmado por Stripe y ya esta activo para ${orgName}.</p>
        </div>

        <div style="padding:16px 24px 0 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;background:#fafafa;">
            <p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Resultado final</p>
            <p style="margin:0;color:#111827;font-size:14px;"><strong>${previousPlanName}</strong> -> <strong>${targetPlanName}</strong></p>
            <p style="margin:6px 0 0 0;color:#111827;font-size:14px;">Costo actual: <strong>${targetPlanPrice}</strong></p>
          </div>
        </div>

        <div style="padding:16px 24px 0 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;">
            <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Administrador responsable</p>
            <p style="margin:0;color:#111827;font-size:14px;"><strong>${actorName}</strong> (${actorEmail})</p>
            <p style="margin:6px 0 0 0;color:#6b7280;font-size:12px;">Aplicado: ${appliedAt}</p>
          </div>
        </div>

        <div style="padding:16px 24px 0 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;background:${accentSoft};">
            <p style="margin:0 0 10px 0;font-size:12px;color:#374151;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Modulos activados</p>
            ${renderModuleList(modulesToEnable, "Sin nuevas activaciones de modulos.", "#047857", "#d1fae5")}
            <div style="height:12px;"></div>
            <p style="margin:0 0 10px 0;font-size:12px;color:#374151;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Modulos desactivados</p>
            ${renderModuleList(modulesToDisable, "Sin desactivaciones de modulos.", "#b45309", "#ffedd5")}
          </div>
        </div>

        <div style="padding:16px 24px 8px 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;">
            <p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Limites vigentes del plan</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tbody>
                ${limitsHtml}
              </tbody>
            </table>
          </div>
        </div>

        <div style="padding:12px 24px 24px 24px;">
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">Este email confirma que el plan ya fue sincronizado en la plataforma. Puedes validar el estado actual desde el panel de empresa.</p>
          <p style="margin:10px 0 0 0;color:#9ca3af;font-size:11px;">${brandName} Billing</p>
        </div>
      </div>
    </div>
  `;
}

type PlanChangedProps = { orgName: string; planName: string };
export function planChangedTemplate({ orgName, planName }: PlanChangedProps) {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #171311;">
      <h2>Hola ${orgName},</h2>
      <p>Tu suscripción ha sido actualizada exitosamente.</p>
      <p>Ahora tienes activo el plan: <strong>${planName}</strong>.</p>
      <br />
      <p>Ya puedes disfrutar de todos los beneficios y nuevos límites de la plataforma de inmediato.</p>
      <br />
      <p>Gracias por confiar en GetBackplate.</p>
      <p style="color: #666; font-size: 12px;">El equipo de GetBackplate</p>
    </div>
  `;
}

type PaymentFailedProps = { orgName: string; retryLink: string };
export function paymentFailedTemplate({ orgName, retryLink }: PaymentFailedProps) {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #171311;">
      <h2>Hola ${orgName},</h2>
      <p style="color: #b91c1c;">Hemos detectado un inconveniente al procesar tu último pago de suscripción.</p>
      <p>Para evitar interrupciones en tu servicio, por favor actualiza tu método de pago correspondiente.</p>
      <br />
      <a href="${retryLink}" style="display: inline-block; background-color: #171311; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold;">
        Actualizar Método de Pago
      </a>
      <br />
      <br />
      <p>Si ya solucionaste este problema, ignora este mensaje.</p>
      <p style="color: #666; font-size: 12px;">El equipo de GetBackplate</p>
    </div>
  `;
}

type SubscriptionActivatedProps = {
  orgName: string;
  planName: string;
  trialDays: number;
};

export function subscriptionActivatedTemplate({ orgName, planName, trialDays }: SubscriptionActivatedProps) {
  const trialCopy =
    trialDays > 0
      ? `Tu prueba gratis de <strong>${trialDays} dias</strong> ya esta corriendo. El primer cobro se realizara al finalizar el periodo de prueba.`
      : "Tu plan se activo correctamente y ya tienes acceso completo a la plataforma.";

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #171311;">
      <h2>Hola ${orgName},</h2>
      <p>¡Felicitaciones! Tu suscripcion fue activada correctamente.</p>
      <p>Plan activo: <strong>${planName}</strong>.</p>
      <p>${trialCopy}</p>
      <br />
      <p>Desde este momento tu panel de empresa queda habilitado.</p>
      <p style="color: #666; font-size: 12px;">El equipo de GetBackplate</p>
    </div>
  `;
}
