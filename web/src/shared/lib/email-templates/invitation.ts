type ReminderProps = {
  fullName: string;
  loginUrl: string;
  recoveryUrl: string;
};

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
