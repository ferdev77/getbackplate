# CHECKLIST ETAPA 2 - ANALISIS GAP (IMPLEMENTADO VS PENDIENTE)

Fecha: 2026-03-20

Este documento compara el estado real del proyecto contra el texto objetivo de "Etapa 2" compartido por producto.

## Resumen ejecutivo

- Cumplido: 18
- Parcial: 7
- Pendiente: 0
- Fuera de alcance por definicion (bloque futuro): 1

## Reglas vigentes (fuente de verdad operativa)

- Emails de Avisos:
  - se envian solo al crear aviso, nunca al editar
  - dependen del toggle `Email` del modal (ON envia / OFF no envia)
  - destinatarios: usuarios dentro del alcance del aviso
- Emails de Checklists:
  - se envian solo al crear checklist, nunca al editar
  - dependen del toggle `Email` del modal (ON envia / OFF no envia)
  - destinatarios: usuarios dentro del alcance del checklist
- Mensajeria UX en creacion:
  - al crear aviso/checklist se informa cantidad de emails enviados
- Documentos:
  - compartir por email es manual por documento, fuera del alcance automatico

---

## BLOQUE 1 - UX/UI

- [x] Dashboard: hover interactivo en metricas
  - Estado: **Cumplido**
  - Evidencia: cards con hover y panel de microdetalle por metrica en `web/src/shared/ui/company-dashboard-workspace.tsx`.

- [x] Dashboard: mostrar detalle (usuarios / empleados)
  - Estado: **Cumplido**
  - Evidencia: desagregacion visible de empleados/usuarios y detalles auxiliares en tarjetas de dashboard en `web/src/shared/ui/company-dashboard-workspace.tsx`.

- [x] Invitaciones: "Enviar invitacion" en creacion de organizacion
  - Estado: **Cumplido**
  - Evidencia: boton en modal create de superadmin y flujo server action en `web/src/app/(superadmin)/superadmin/organizations/page.tsx` y `web/src/modules/organizations/actions.ts`.

- [x] Invitaciones: "Reenviar invitacion" en edicion de cliente
  - Estado: **Cumplido**
  - Evidencia: boton "Reenviar invitación" en modal edit + endpoint `POST /api/superadmin/organizations/invitations/resend` con feedback inline sin recarga en `web/src/modules/organizations/ui/resend-invitation-button.tsx`.

- [x] Sidebar: filtro por locacion solo si hay multiples locaciones
  - Estado: **Cumplido**
  - Evidencia: selector de locacion en sidebar condicionado a `branchOptions.length > 1` en `web/src/shared/ui/company-shell.tsx`.

- [x] Dashboard por locacion con metricas filtradas
  - Estado: **Cumplido**
  - Evidencia: ruta dedicada `web/src/app/(company)/app/dashboard/location/page.tsx` reutilizando dashboard con filtro por locacion.

- [x] Renombrar "Reportes" -> "Reportes Checklists"
  - Estado: **Cumplido**
  - Evidencia: label actualizado en sidebar de `web/src/shared/ui/company-shell.tsx`.

- [x] Mover settings de locaciones/departamentos fuera de modal
  - Estado: **Cumplido**
  - Evidencia: gestion en pagina dedicada de ajustes en `web/src/app/(company)/app/settings/page.tsx`.

- [x] Dark Mode: toggle + persistencia
  - Estado: **Cumplido**
  - Evidencia: preferencias de tema en `web/src/shared/ui/company-shell.tsx`, persistencia en `web/src/app/api/company/settings/route.ts`.

---

## BLOQUE 2 - ESTRUCTURA DEL SISTEMA

- [x] Usuarios -> Administradores (naming funcional)
  - Estado: **Cumplido**
  - Evidencia: labels y flujos de admin en `web/src/app/(company)/app/users/page.tsx`, `web/src/shared/ui/company-shell.tsx`.

- [x] Empleados con tipo empleado/usuario + campos condicionales
  - Estado: **Cumplido**
  - Evidencia: modal con toggle "Es empleado?" y comportamiento condicional en `web/src/modules/employees/ui/new-employee-modal.tsx` + persistencia en `web/src/modules/employees/actions.ts`.

- [~] Permisos por locacion/departamento
  - Estado: **Parcial**
  - Evidencia: validacion de scopes en modulos (checklists/docs/anuncios) via `web/src/shared/lib/scope-validation.ts`; falta consolidacion global de autorizacion por todos los endpoints/consultas de negocio.

- [x] Archivos: eliminar reglas redundantes y usar jerarquia de carpetas como fuente unica
  - Estado: **Cumplido**
  - Evidencia: modelo folder-first aplicado en APIs de documentos/carpetas y descarga/export con scope efectivo en `web/src/app/api/company/documents/route.ts`, `web/src/app/api/company/document-folders/route.ts`, `web/src/app/api/documents/[documentId]/download/route.ts`, `web/src/app/api/company/documents/export/route.ts`.

---

## BLOQUE 3 - FUNCIONALIDADES NUEVAS

- [x] "Entrar a la organizacion" con impersonacion segura
  - Estado: **Cumplido**
  - Evidencia: boton de ingreso en acciones de superadmin + sesion dedicada de impersonacion + banner y salida segura en `web/src/app/(superadmin)/superadmin/organizations/page.tsx`, `web/src/modules/organizations/actions.ts`, `web/src/shared/lib/impersonation.ts`, `web/src/app/auth/impersonation/stop/route.ts` y migracion `supabase/migrations/202603200002_superadmin_impersonation_sessions.sql`.

- [x] Notificaciones email integradas reutilizando avisos
  - Estado: **Cumplido**
  - Evidencia: canal `email` habilitado en `announcement_deliveries`, envio via Brevo al crear avisos/checklists segun toggle, deduplicacion de cola y feedback de cantidad enviada en `web/src/modules/announcements/services/deliveries.ts`, `web/src/modules/announcements/actions.ts`, `web/src/modules/checklists/actions.ts`, `web/src/shared/ui/announcement-create-modal.tsx`, `web/src/modules/checklists/ui/checklist-upsert-modal.tsx`.

- [~] Recurrencia (diario, semanal, mensual, trimestral, anual, dias especificos)
  - Estado: **Parcial**
  - Evidencia: checklist soporta `daily/weekly/monthly`; no se observa trimestral/anual/dias especificos.

- [x] Archivos: compartir por email
  - Estado: **Cumplido**
  - Evidencia: endpoint `POST /api/company/documents/share-email` + modal UI de envio en `web/src/modules/documents/ui/documents-tree-workspace.tsx`.

- [~] Evento primer login cliente + notificacion automatica
  - Estado: **Parcial**
  - Evidencia: se implemento primer ingreso con cambio obligatorio de contraseña (`force_password_change`) y pantalla dedicada `web/src/app/auth/change-password/page.tsx`; aun falta trigger de notificacion automatica.

---

## BLOQUE 4 - TESTING

- [x] Cliente mock con 7 locaciones y validaciones de permisos/dashboards/filtros/multi-tenant
  - Estado: **Cumplido**
  - Evidencia: scripts `web/scripts/setup-tenant-qa-7-locations.mjs` y `web/scripts/verify-tenant-7-locations.mjs` + npm scripts dedicados.

---

## BLOQUE 5 - FUTURO (NO IMPLEMENTAR AHORA)

- [x] EDI / QuickBooks / Restaurant365
  - Estado: **Correctamente no implementado (fuera de alcance actual)**.

---

## Requisitos tecnicos transversales

- [~] TypeScript estricto
  - Estado: **Parcial**
  - Evidencia: aun hay `any` y deuda de tipado en modulos legacy.

- [~] Separacion services/controllers/UI
  - Estado: **Parcial**
  - Evidencia: buena modularizacion en varias areas; aun hay logica pesada en algunas rutas/paginas.

- [~] Manejo de errores robusto
  - Estado: **Parcial**
  - Evidencia: mejoro mucho en RRHH/documentos; no uniforme en todo el dominio.

- [~] Logs de eventos importantes
  - Estado: **Parcial**
  - Evidencia: se agrego auditoria en endpoints clave; faltan coberturas puntuales y estandarizacion global.

- [~] Codigo documentado
  - Estado: **Parcial**
  - Evidencia: hay docs fuertes (incluye `ACTUALIZACION_2.0_SAAS.md`), falta completar cobertura para toda Etapa 2.

---

## Plan de implementacion por gap pendiente

## Fase A - UX/UI (alto impacto visible)

1. Dashboard cards con hover interactivo + detalle empleados/usuarios.
2. Renombrar navegacion/reporteria a "Reportes Checklists".
3. Sidebar con filtro de locacion visible solo cuando haya >1 locacion.
4. Vista dedicada "Dashboard por locacion" (ruta y persistencia de filtro).

## Fase B - Invitaciones y acceso avanzado

1. Modelo de invitaciones (tabla + estado + expiracion + token).
2. Boton "Enviar invitacion" en alta de organizacion.
3. Boton "Reenviar invitacion" en edicion de cliente.
4. Flujo "Entrar a la organizacion" (impersonacion segura con sesion secundaria auditada).

## Fase C - Notificaciones y recurrencia

1. Integrar proveedor email (resend/ses/etc) + plantillas.
2. Reusar eventos de anuncios/checklists para notificar por email.
3. Expandir recurrencia a trimestral, anual y dias especificos.
4. Cron/job dispatcher para ejecucion de recurrencias y reintentos.

## Fase D - Archivos (modelo de permisos)

1. Definir fuente unica de acceso (folder-first o document-only).
2. Migrar datos y eliminar regla redundante.
3. Implementar "Compartir por email" de documento.

## Fase E - Eventos de lifecycle y testing

1. Detectar primer login de cliente y emitir evento de dominio.
2. Disparar notificacion automatica (auditable).
3. Crear fixture tenant QA con 7 locaciones.
4. Checklist de validacion end-to-end multi-tenant (permiso, filtros, dashboards).

## Fase F - Hardening tecnico

1. Remover `any` en modulos core de Etapa 2.
2. Estandarizar error contracts y auditoria.
3. Consolidar separacion por capas (services/controllers/UI) en rutas con logica mezclada.

---

## Criterio de aprobacion para iniciar implementacion

Este checklist debe revisarse por producto/tecnico y marcar prioridad (P1/P2/P3) por item pendiente.
Una vez aprobado, se implementa por fases con PRs cortos y validacion funcional por bloque.

## Actualizacion de avance (2026-03-20)

- P1 implementado y validado (estado/acceso, catalogo unico de scope users, script de backfill, dashboard desagregado).
- P2 implementado en este ciclo:
  - rename `Reportes` -> `Reportes Checklists`
  - filtro de locacion en sidebar (solo cuando hay multiples locaciones)
  - ruta dedicada `dashboard/location`
  - mejora UX dashboard por locacion: accesos directos por nombre de locacion en sidebar, chips de contexto y eliminacion de navegacion redundante
  - invitaciones superadmin: `Enviar invitación` en creación y `Reenviar invitación` en edición
  - flujo de credenciales iniciales: contraseña temporal definida por superadmin + cambio obligatorio en primer ingreso
  - recuperación de contraseña habilitada desde login (`/auth/forgot-password`)
  - dashboard con hover interactivo y tarjetas con detalle operativo
  - permisos de documentos consolidado en modelo folder-first (fuente unica de acceso)
  - impersonacion segura de superadmin con hardening en acciones sensibles de billing/settings
  - notificaciones email operativas para avisos (canal email) y checklists enviados
  - compartir documento por email desde Documentos
  - suite QA de 7 locaciones con setup + verify automatizado



Plan inteligente de implementación (quirúrgico)
- [x] P1. Unificar “estado laboral” vs “acceso dashboard” (cerrar semántica)
  - Qué: separar completamente ambos conceptos en UI/API/DB donde aún se crucen.
  - Cómo: mantener status laboral en employees/organization_user_profiles; manejar acceso solo por memberships.status; agregar badges/filtros claros en tablas.
  - Riesgo: bajo; cambio incremental por pantalla.
- [x] P1. Catálogo único de personas seleccionables (scope users)
  - Qué: centralizar la construcción de lista de usuarios/empleados para todos los modales.
  - Cómo: crear helper de servidor buildScopeUsersCatalog(organizationId) que combine employees + organization_user_profiles + memberships employee, dedupe y etiquete.
  - Riesgo: medio-bajo; evita divergencias futuras.
- [x] P1. Normalizar registros “huérfanos” históricos
  - Qué: migración/backfill para membresías employee sin perfil visible.
  - Cómo: script idempotente que crea organization_user_profiles faltantes con nombre/email de Auth; marca source='backfill'.
  - Riesgo: bajo si se ejecuta por tenant con preview dry-run.
- [x] P1. Dashboard: desagregación real Usuarios vs Empleados
  - Qué: cards y hover con detalle real.
  - Cómo: extender query del dashboard con conteos separados y tooltip/popover; no tocar layout principal.
  - Riesgo: bajo.
- [x] P2. Renombre funcional “Reportes” -> “Reportes Checklists”
  - Qué: copy consistente en menú, header y breadcrumbs.
  - Cómo: cambio de labels únicamente, sin cambiar rutas.
  - Riesgo: mínimo.
- [x] P2. Filtro por locación en sidebar (solo si >1)
  - Qué: quick-filter global por sucursal.
  - Cómo: agregar selector en company-shell; persistir en query param (branch) y propagar en páginas compatibles.
  - Riesgo: medio; hacer por opt-in de páginas.
- [x] P2. Dashboard por locación (vista dedicada)
  - Qué: ruta nueva /app/dashboard/location con métricas filtradas.
  - Cómo: reutilizar componentes existentes; compartir queries con dashboard general + parámetro obligatorio.
  - Riesgo: medio-bajo.
- [x] P2. Invitaciones (enviar/reenviar)
  - Qué: flujo formal de invitación en alta/edición de organización.
  - Cómo: tabla organization_invitations, token, expiración, estado; botones en UI superadmin; endpoint de reenvío.
  - Riesgo: medio; requiere correo y seguridad de token.
- P3. Recurrencia avanzada checklists
  - Qué: sumar trimestral, anual y días específicos.
  - Cómo: ampliar esquema repeat_every + repeat_config; job scheduler incremental.
  - Riesgo: medio-alto; requiere motor de programación.
- [x] P3. Notificaciones email reales
  - Qué: envío email para avisos/checklists/eventos.
  - Cómo: provider (Resend/SES), servicio notifications, plantillas, cola/reintentos, auditoría.
  - Riesgo: medio.
- [x] P3. Compartir documento por email
  - Qué: acción desde documentos.
  - Cómo: endpoint POST /api/company/documents/share-email, selección documento+destinatario, registro de delivery.
  - Riesgo: medio.
- P3. Evento “primer login cliente”
  - Qué: detectar y notificar automáticamente.
  - Cómo: flag/evento en auth lifecycle (primer last_sign_in_at), crear audit event + notificación.
  - Riesgo: medio-bajo.
- [x] P3. Suite QA tenant 7 locaciones
  - Qué: dataset y checklist de pruebas multi-tenant.
  - Cómo: seed controlado + script verify (permisos, filtros, dashboards).
  - Riesgo: bajo.
