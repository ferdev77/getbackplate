type ReminderProps = {
  fullName: string;
  loginUrl: string;
  recoveryUrl: string;
};

type InitialInviteProps = {
  fullName: string;
  loginEmail: string;
  loginPassword?: string;
  loginUrl: string;
  organizationName?: string;
};

export function initialInviteTemplate({ fullName, loginEmail, loginPassword, loginUrl, organizationName }: InitialInviteProps) {
  const orgText = organizationName ? ` a <strong>${organizationName}</strong>` : "";
  
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #171311; line-height: 1.6;">
      <h2>Hola ${fullName},</h2>
      <p>Has sido invitado${orgText} en la plataforma <strong>GetBackplate</strong>.</p>
      
      <p>Tu cuenta ya está lista. A continuación te detallamos tus credenciales de acceso temporal. Por tu seguridad, te solicitaremos que cambies la contraseña la primera vez que ingreses:</p>
      
      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0;"><strong>Usuario / Email:</strong> ${loginEmail}</p>
        ${loginPassword ? `<p style="margin: 0;"><strong>Contraseña Temporal:</strong> ${loginPassword}</p>` : `<p style="margin: 0;"><strong>Contraseña:</strong> (Ya la tienes configurada o usa la recuperación si la olvidaste)</p>`}
      </div>
      
      <div style="margin: 32px 0;">
        <a href="${loginUrl}" style="display: block; width: max-content; background-color: #171311; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; text-align: center;">
          Ingresá con tus credenciales
        </a>
      </div>

      <p style="font-size: 14px; color: #555;">
        Si tienes problemas para acceder, por favor contacta al administrador de tu empresa.
      </p>

      <hr style="border: none; border-top: 1px solid #eaeaea; margin: 24px 0;" />
      <p style="color: #888; font-size: 12px;">El equipo de GetBackplate</p>
    </div>
  `;
}

export function resendReminderTemplate({ fullName, loginUrl, recoveryUrl }: ReminderProps) {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #171311; line-height: 1.6;">
      <h2>Hola ${fullName},</h2>
      <p>Este es un mensaje recordatorio de que tu acceso a la plataforma <strong>GetBackplate</strong> ya está habilitado.</p>
      
      <p>Puedes ingresar directamente a tu cuenta o, si no recuerdas tu clave o no la configuraste, puedes restablecerla fácilmente mediante los siguientes accesos directos:</p>
      
      <div style="margin: 32px 0;">
        <a href="${loginUrl}" style="display: block; width: max-content; margin-bottom: 12px; background-color: #171311; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; text-align: center;">
          Ingresá con tus credenciales
        </a>
        <a href="${recoveryUrl}" style="display: block; width: max-content; background-color: #e5e7eb; color: #171311; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; text-align: center;">
          Olvidé mi contraseña
        </a>
      </div>

      <p style="font-size: 14px; color: #555;">
        Si tienes problemas para acceder, por favor contacta al administrador de tu empresa.
      </p>

      <hr style="border: none; border-top: 1px solid #eaeaea; margin: 24px 0;" />
      <p style="color: #888; font-size: 12px;">El equipo de GetBackplate</p>
    </div>
  `;
}
