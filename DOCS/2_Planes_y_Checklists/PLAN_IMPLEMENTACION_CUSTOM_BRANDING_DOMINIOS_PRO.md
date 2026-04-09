# PLAN IMPLEMENTACION CUSTOM BRANDING + DOMINIOS PERSONALIZADOS (PRO)

Fecha: 2026-04-07  
Estado: En planificacion (listo para ejecucion)

## 1) Objetivo

Habilitar feature Pro para que cada tenant pueda usar su dominio propio con formato `app.dominioempresa.com`, manteniendo una unica app Next.js en Vercel, con resolucion segura por host, branding por tenant y login multi-dominio sin romper flujos actuales.

## 2) Definicion de producto (lo que se vende)

Feature comercial: `custom_domain_branding`

Incluye:

- Registro de dominio personalizado por empresa desde panel.
- Instrucciones DNS automáticas (CNAME) en UI.
- Verificacion de DNS/SSL y estado operativo (`pending`, `verifying`, `active`, `error`).
- Login/forgot-password/invitaciones con branding y contexto del tenant por host.
- Links transaccionales tenant-aware (emails y redirects) con dominio activo del tenant.

No incluye en MVP:

- Auto-edicion de DNS en proveedor del cliente (Cloudflare/GoDaddy API).
- Multi-dominio activo por tenant con routing avanzado (se habilita luego de MVP).

## 3) Pregunta clave resuelta: login

No se crean paginas nuevas de auth.

Se reutilizan las rutas existentes:

- `web/src/app/auth/login/page.tsx`
- `web/src/app/auth/forgot-password/page.tsx`

Estrategia:

1. Priorizar resolucion por `Host` (custom domain activo).
2. Fallback a `?org=`.
3. Fallback final a experiencia generica.

Beneficio: cero duplicacion de UI, menor deuda tecnica, menor riesgo de regresiones.

## 4) Arquitectura objetivo

### 4.1 Resolucion de tenant

- Fuente principal: host HTTP (`req.headers.host`).
- Tabla de mapeo dominio -> tenant en DB.
- Solo dominios `active` participan en resolucion.
- Si host no mapea, usar flujo actual por `org`/selector.

### 4.2 Integracion con Vercel

- Gestion de dominio en proyecto Vercel via API/CLI desde backend operativo.
- Obtencion de instrucciones DNS para mostrar al cliente.
- Verificacion periodica de estado DNS/SSL hasta `active`.

### 4.3 Base URL canonica por tenant

- `tenant_active_domain` (si existe y activo) -> base URL de links.
- Si no existe: `https://app.getbackplate.com`.

### 4.4 Seguridad

- Lista blanca estricta de hosts activos por tenant.
- Bloqueo de host no verificado.
- Auditoria en eventos de dominio (crear, validar, activar, desactivar, error).

## 5) Modelo de datos (MVP Pro)

Nueva tabla propuesta: `organization_domains`

Campos recomendados:

- `id uuid pk`
- `organization_id uuid not null references organizations(id)`
- `domain text not null unique` (ej: `app.acme.com`)
- `subdomain_label text generated/derivado` (ej: `app`)
- `status text not null` (`pending_dns`, `verifying_ssl`, `active`, `error`, `disabled`)
- `verification_error text null`
- `is_primary boolean not null default false`
- `dns_target text null` (ej: `cname.vercel-dns.com`)
- `provider text null` (ej: `vercel`)
- `verified_at timestamptz null`
- `activated_at timestamptz null`
- `created_by uuid null`
- `updated_by uuid null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indices/constraints:

- `unique(domain)` global.
- `unique(organization_id) where is_primary = true` (un primary por tenant en MVP).
- indice por `organization_id, status`.

RLS:

- `company_admin/manager` del tenant: CRUD acotado a su `organization_id`.
- `superadmin`: lectura global y operaciones de soporte.

## 6) Contratos API (propuestos)

Base: `web/src/app/api/company/custom-domains/`

### 6.1 Crear dominio

- `POST /api/company/custom-domains`
- Input:
  - `domain` (ej: `app.acme.com`)
- Proceso:
  1. Validar formato y que no sea apex (`acme.com`) en MVP.
  2. Persistir `pending_dns`.
  3. Registrar dominio en Vercel.
  4. Guardar `dns_target` devuelto.
  5. Devolver instrucciones DNS y estado.

### 6.2 Listar dominios

- `GET /api/company/custom-domains`
- Output:
  - lista de dominios con `status`, `dns_target`, `is_primary`, `verification_error`, `last_checked_at`.

### 6.3 Revalidar

- `POST /api/company/custom-domains/recheck`
- Input:
  - `domain`
- Proceso:
  - Consulta Vercel y actualiza estado.

### 6.4 Activar primary

- `POST /api/company/custom-domains/set-primary`
- Input:
  - `domain`
- Regla:
  - Solo dominios `active` pueden ser `is_primary = true`.

### 6.5 Desactivar/eliminar

- `DELETE /api/company/custom-domains`
- Input:
  - `domain`
- Proceso:
  - Quitar alias en Vercel y marcar `disabled` (o delete logico).

## 7) Cambios de aplicacion

### 7.1 Runtime host-aware

Archivos a intervenir:

- `web/src/proxy.ts`
- `web/src/shared/lib/access.ts`
- `web/src/shared/lib/tenant-selection.ts`

Cambios:

- Resolver tenant por host antes de `org` query.
- Persistir tenant activo por host de forma deterministica.
- Mantener fallback actual para no romper comportamiento historico.

### 7.2 Auth branding

Archivos a intervenir:

- `web/src/shared/lib/tenant-auth-branding.ts`
- `web/src/app/auth/login/page.tsx`
- `web/src/app/auth/forgot-password/page.tsx`
- `web/src/modules/auth/actions.ts`

Cambios:

- Resolver branding por host activo.
- Mantener `organization_id_hint` en submits y errores.
- Fallback a `?org=` y a modo generico.

### 7.3 URLs canonicas tenant-aware

Archivos a intervenir:

- `web/src/shared/lib/app-url.ts`
- servicios de invitacion/email ya tenant-aware para reforzar prioridad por dominio primary activo.

Regla:

- Si tenant tiene dominio `active + is_primary`, usar ese host para links.
- Si no, usar `https://app.getbackplate.com`.

### 7.4 UI de empresa

Ruta sugerida:

- `web/src/app/(company)/app/settings/page.tsx` (seccion nueva: Dominio personalizado)

Componente sugerido:

- `web/src/modules/settings/ui/custom-domain-settings.tsx`

UX minima:

- Campo: `app.nombreempresa.com`
- Instrucciones auto:
  - Tipo `CNAME`
  - Host `app`
  - Destino `cname.vercel-dns.com` (o target devuelto por Vercel)
- Estado visual:
  - `Pendiente DNS`
  - `Verificando SSL`
  - `Activo`
  - `Error`
- Botones:
  - `Guardar`
  - `Revalidar`
  - `Activar como principal` (si hay multiples en fases futuras)

## 8) Operacion y soporte

### 8.1 Cron de reconciliacion

- Job interno cada X minutos para revisar dominios no activos.
- Actualiza estado desde Vercel y limpia errores transitorios.

### 8.2 Runbook de soporte

Agregar documento operativo dedicado:

- `DOCS/4_Operaciones_y_Guias/GUIA_CUSTOM_DOMAINS.md`

Debe cubrir:

- Error CNAME mal apuntado.
- Error SSL pendiente.
- Dominio ya tomado por otro proyecto.
- Rollback a dominio default.

## 9) Seguridad (obligatorio)

- Validar ownership del dominio via flujo de Vercel.
- Rechazar hosts no registrados/activos.
- No confiar en `x-forwarded-host` sin validacion.
- Auditar todos los eventos:
  - `custom_domain.create`
  - `custom_domain.verify`
  - `custom_domain.activate`
  - `custom_domain.disable`
  - `custom_domain.error`
- Enforce plan:
  - solo tenants con feature Pro activa.

## 10) Plan de rollout

Fase 1 (interna):

- Solo superadmin habilita dominios en tenants piloto.

Fase 2 (controlada):

- Self-service para tenants Pro seleccionados.

Fase 3 (general):

- Self-service para todos los tenants Pro.
- Dashboard de salud de dominios en superadmin.

## 11) QA y criterios de aceptacion

Casos criticos:

1. Tenant con dominio activo ve login co-branded en su host.
2. Tenant sin dominio activo usa host default sin errores.
3. Invitaciones y reset password salen con host correcto del tenant.
4. Host no registrado no accede a contexto tenant indebido.
5. Cambio de primary no rompe sesiones ni links.
6. Fallback a dominio default funciona ante desactivacion.

Comandos de verificacion sugeridos:

- `npm run lint`
- `npm run build`
- smoke auth + settings + emails

## 12) Checklist de implementacion (marcar al completar)

### A. Datos y seguridad

- [x] A1. Crear migracion `organization_domains` con constraints e indices.
- [x] A2. Definir RLS para `organization_domains` (tenant + superadmin).
- [ ] A3. Registrar feature flag/plan gate `custom_domain_branding`.

### B. Backend dominio

- [x] B1. Implementar servicio `custom-domain.service.ts` (alta/estado/recheck/baja).
- [x] B2. Integrar Vercel Domains API (add/inspect/alias/remove).
- [x] B3. Implementar endpoints `POST/GET/recheck/set-primary/DELETE`.
- [x] B4. Agregar auditoria en eventos de dominio.

### C. Runtime y auth

- [x] C1. Resolver tenant por host en runtime de acceso (sin romper fallback actual).
- [x] C2. Adaptar `tenant-auth-branding.ts` a prioridad por host.
- [x] C3. Confirmar login/forgot-password sin paginas nuevas.
- [x] C4. Ajustar links de invitacion/recovery a dominio primary activo.

### D. UI panel empresa

- [x] D1. Crear seccion `Dominio personalizado` en settings.
- [x] D2. Mostrar instrucciones DNS auto (`CNAME`, `Host`, `Target`).
- [x] D3. Mostrar estado (`pending/verifying/active/error`).
- [x] D4. Agregar acciones `Revalidar` y feedback unificado.

### E. Operacion

- [ ] E1. Crear reconciliacion periodica de estados de dominio.
- [ ] E2. Crear `GUIA_CUSTOM_DOMAINS.md` (soporte L1/L2).
- [ ] E3. Definir rollback operativo a dominio default.

### F. QA y release

- [ ] F1. Ejecutar `npm run lint` sin errores bloqueantes.
- [x] F2. Ejecutar `npm run build` OK.
- [ ] F3. Validar matriz de casos criticos de dominio/login/emails.
- [ ] F4. Piloto con 1 tenant real Pro y evidencia.
- [ ] F5. Go-live general para plan Pro.

## 13) Riesgos y mitigacion

- Riesgo: propagacion DNS lenta.
  - Mitigacion: estado claro + boton revalidar + texto de espera hasta 24h.

- Riesgo: dominio ya usado en otro proyecto/team Vercel.
  - Mitigacion: mensaje explicito + SOP de transferencia.

- Riesgo: links de email inconsistentes entre hosts.
  - Mitigacion: una sola funcion canonica para base URL tenant-aware.

- Riesgo: fuga de contexto tenant por host spoofing.
  - Mitigacion: whitelist + estado `active` + validaciones server-side.

## 14) Definicion de terminado (DoD)

Se considera terminado cuando:

- tenant Pro puede autoconfigurar `app.dominioempresa.com` desde settings.
- estado llega a `active` sin intervencion manual de desarrollo.
- login y recovery funcionan co-branded por host.
- invitaciones y emails usan el host correcto del tenant.
- existe evidencia de QA + runbook de soporte + auditoria en produccion.
