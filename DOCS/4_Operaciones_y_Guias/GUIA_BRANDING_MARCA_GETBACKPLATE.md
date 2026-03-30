# Guia de Branding de Marca (GetBackplate)

Fecha: 2026-03-30  
Estado: Activo

---

## 1) Objetivo

Unificar el uso visual de la marca GetBackplate en toda la plataforma para que:

- la identidad sea consistente,
- se respete el branding custom por tenant cuando exista,
- y haya fallback oficial cuando no exista branding custom.

---

## 2) Assets oficiales de marca

Ubicacion:

- `web/public/getbackplate-logo-light.svg`
- `web/public/getbackplate-logo-dark.svg`
- `web/public/getbackplate-logo-footer.svg`

Estos SVG fueron extraidos del mockup oficial y son la referencia visual actual.

---

## 3) Componente reusable de marca

Se utiliza:

- `web/src/shared/ui/getbackplate-logo.tsx`

Variantes:

- `light`
- `dark`
- `footer`

Regla:

- No renderizar marca manual con texto/corchetes en nuevos componentes.
- Usar siempre este componente para mantener fidelidad visual.

---

## 4) Escala unificada de tamanos

Definida en:

- `web/src/shared/ui/brand-scale.ts`

Valores actuales:

- auth: `h-[36px]`
- sidebar desktop: `h-[28px]`
- sidebar collapsed: `h-[20px]`
- sidebar mobile: `h-[26px]`
- footer: `h-[22px]`
- superadmin topbar: `h-[24px]`

---

## 5) Reglas de fallback con branding custom

### Si tenant tiene custom branding

- mostrar logo y nombre del tenant.

### Si tenant NO tiene custom branding

- mostrar logo oficial GetBackplate (assets SVG).

---

## 6) Lugares ya implementados

### Shell Empresa

- `web/src/shared/ui/company-shell.tsx`

Aplicado en:

- sidebar (desktop + mobile)
- footer

### Shell Empleado

- `web/src/shared/ui/employee-shell.tsx`

Aplicado en:

- sidebar (desktop + mobile)
- footer

### Topbar Superadmin

- `web/src/shared/ui/superadmin-topbar.tsx`

### Auth

- `web/src/app/auth/login/page.tsx`
- `web/src/app/auth/forgot-password/page.tsx`
- `web/src/app/auth/change-password/page.tsx`
- `web/src/app/auth/register/page.tsx`
- `web/src/app/auth/select-organization/page.tsx`

### Landing

- `web/src/modules/landing/ui/landing-experience.tsx`

---

## 7) Branding de emails

Configuracion de branding default:

- `web/src/shared/lib/email-branding.ts`

Templates con header de marca (custom o default):

- `web/src/shared/lib/email-templates/invitation.ts`
- `web/src/shared/lib/email-templates/billing.ts`

Regla:

- si no hay custom branding, se usa logo oficial de plataforma como header.

---

## 8) Checklist para nuevos cambios de UI

Antes de mergear componentes nuevos:

- usar `GetBackplateLogo` (no texto manual de marca),
- respetar `brand-scale.ts`,
- validar light/dark,
- validar fallback custom branding vs default branding.
