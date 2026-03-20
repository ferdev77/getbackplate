# Invitaciones - Variables de template

El flujo de creacion de organizacion envia metadata personalizada al email de invitacion de Supabase.

Variables enviadas en `inviteUserByEmail(..., { data })`:

- `full_name`
- `login_email`
- `login_password`

## Configurar template en Supabase

1. Ir a `Authentication` -> `Email Templates`.
2. Editar template `Invite user`.
3. Incluir variables en el HTML/texto:

```html
<p>Hola {{ .Data.full_name }},</p>
<p>Tu acceso fue creado.</p>
<p>Usuario: <strong>{{ .Data.login_email }}</strong></p>
<p>Contraseña: <strong>{{ .Data.login_password }}</strong></p>
<p><a href="{{ .ConfirmationURL }}">Ingresar a la plataforma</a></p>
```

## Importante

- Si el usuario ya existia, Supabase puede no reenviar invitacion con el mismo endpoint.
- Para esos casos, el sistema ahora intenta fallback automatico con link de recovery.
- Evitar almacenar contraseñas en tablas propias o logs.
