# Invitaciones - Variables de template

El flujo de creacion de organizacion envia metadata personalizada al email de invitacion de Supabase.

Variables enviadas en `inviteUserByEmail(..., { data })`:

- `full_name`
- `login_email`
- `login_password`

## Flujo vigente

- Alta inicial por superadmin:
  - se crea/asigna usuario con la contraseña del formulario
  - se envia email de `Invite user` mostrando usuario + contraseña temporal
  - en primer login se fuerza cambio de contraseña (`force_password_change = true`)
- Reenvio de invitacion:
  - se envia correo de acceso (magic link/recovery)
  - si no ingresa por enlace, usar `Olvide mi contrasena` en `/auth/login`

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
- Mantener `Site URL` y `Redirect URLs` de Supabase en `https://...` y con callback permitido.
