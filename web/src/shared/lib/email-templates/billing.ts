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
