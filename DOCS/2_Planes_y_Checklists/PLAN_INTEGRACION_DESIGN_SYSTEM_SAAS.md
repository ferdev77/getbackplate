# Plan de Integracion: Design System en SaaS GetBackplate

Fecha: 2026-03-29
Estado: En ejecucion (Fase 1 completa + Fase 2 completa + Fase 3 completa)
Fuente visual/tokens: `Mockups/design system/Design System/`

## 1) Objetivo

Integrar el design system nuevo al SaaS productivo de forma gradual, sin romper flujos de negocio ni estabilidad visual en produccion.

Resultados buscados:

- unificar tipografia, colores, espaciado y radios en toda la app,
- estandarizar componentes base reutilizables,
- reducir estilos hardcodeados por modulo,
- habilitar evolucion UI mas rapida y consistente.

## 2) Alcance

Incluye:

- capa de tokens (`CSS variables` + extension Tailwind),
- componentes UI base (`Button`, `TagPill`, `ThemeToggle`),
- migracion visual por dominios criticos (auth, shells, settings),
- validacion responsive desktop/tablet/mobile,
- checklist QA por roles (superadmin/company/employee).

No incluye (fuera de alcance):

- cambios de reglas de negocio,
- cambios en permisos, RLS o billing logic,
- re-arquitectura de modulos backend.

## 3) Artefactos de origen (a consumir)

- `Mockups/design system/Design System/design-tokens.ts`
- `Mockups/design system/Design System/globals.css`
- `Mockups/design system/Design System/tailwind.config.ts`
- `Mockups/design system/Design System/components/ui/button.tsx`
- `Mockups/design system/Design System/components/ui/tag-pill.tsx`
- `Mockups/design system/Design System/components/ui/theme-toggle.tsx`
- `Mockups/design system/Design System/DESIGN-SYSTEM.md`
- `Mockups/design system/Design System/colors.md`
- `Mockups/design system/Design System/typography.md`

## 4) Estrategia de implementacion (sin big-bang)

Se aplica rollout por fases con feature hardening visual progresivo. Primero infraestructura de estilo, luego migracion de componentes y pantallas.

### Fase 0 - Baseline y guardrails

Objetivo: medir estado actual antes de tocar UI.

Entregables:

- snapshot visual de rutas clave (auth/company/employee/superadmin),
- inventario de clases/hex hardcodeadas por prioridad,
- definicion de matriz de regresion visual minima.

Checklist:

- [ ] inventario de colores hardcodeados en `web/src/**`.
- [x] lista de componentes de alto impacto visual a migrar primero.
- [ ] baseline responsive (mobile 390, tablet 768, desktop 1440).

### Fase 1 - Foundation (tokens + theme)

Objetivo: montar la capa base sin cambiar masivamente pantallas.

Entregables:

- tokens en `web/src/shared/design/` (TS + CSS),
- sincronizacion de `globals.css` actual con variables del DS,
- extension de Tailwind con alias y escalas del DS,
- provider/theme strategy alineada a `data-theme` y coexistencia con tema actual.

Checklist:

- [x] crear `web/src/shared/design/tokens.ts` (adaptado del mockup).
- [x] incorporar variables DS en `web/src/app/globals.css` sin romper estilos actuales.
- [x] extender capa `@theme` (Tailwind v4) con alias/tokens DS.
- [x] validar compatibilidad con dark mode actual (`dark-pro`/`dark`).

Avance registrado (2026-03-29):

- Se creo `web/src/shared/design/tokens.ts` como base central de tokens.
- Se extendio `web/src/app/globals.css` con variables DS light/dark coexistiendo con tema legacy.
- Se mapearon alias de color/sombra/radius en `@theme inline` (en este repo Tailwind v4 vive en CSS, no en `tailwind.config.*`).
- Se habilitaron utilidades base de gradientes (`.grad-orange`, `.grad-violet`, `.grad-mixed`) para adopcion progresiva.

### Fase 2 - UI primitives

Objetivo: estandarizar primitives para dejar de repetir estilos.

Entregables:

- `Button` unificado en `web/src/shared/ui/button.tsx`,
- `TagPill` unificado en `web/src/shared/ui/tag-pill.tsx`,
- `ThemeToggle` version SaaS en `web/src/shared/ui/theme-toggle.tsx`,
- guia de uso minima para equipos.

Checklist:

- [x] mapear variantes actuales -> variantes DS (tabla de equivalencias).
- [x] reemplazar usos criticos de botones en auth/settings/shells.
- [x] quitar duplicaciones de estilos equivalentes.
- [x] documentar patrones de uso y anti-patrones.

Avance registrado (2026-03-29):

- Primitives creadas en `web/src/shared/ui/`:
  - `button.tsx`
  - `tag-pill.tsx`
  - `theme-toggle.tsx`
- `submit-button` alineado a tokens DS (`--gbp-*`) manteniendo API existente.
- Auth migrado a foundation/primitives:
  - `web/src/app/auth/login/page.tsx`
  - `web/src/app/auth/forgot-password/page.tsx`
  - `web/src/app/auth/change-password/page.tsx`
- Shells migrados a tokens DS (gradual):
  - `web/src/shared/ui/company-shell.tsx`
  - `web/src/shared/ui/employee-shell.tsx`
- Settings principal migrado a tokens/primitives DS:
  - `web/src/app/(company)/app/settings/page.tsx`
  - `web/src/modules/settings/ui/company-contact-settings-card.tsx`
- Superadmin migrado a tokens DS (core + internos):
  - `web/src/app/(superadmin)/superadmin/layout.tsx`
  - `web/src/shared/ui/superadmin-topbar.tsx`
  - `web/src/shared/ui/superadmin-form-fields.tsx`
  - `web/src/app/(superadmin)/superadmin/dashboard/page.tsx`
  - `web/src/app/(superadmin)/superadmin/organizations/page.tsx`
  - `web/src/app/(superadmin)/superadmin/plans/page.tsx`
  - `web/src/app/(superadmin)/superadmin/modules/page.tsx`
  - `web/src/app/(superadmin)/superadmin/feedback/page.tsx`
  - `web/src/app/(superadmin)/superadmin/guide/page.tsx`
  - `web/src/app/(superadmin)/superadmin/trash/page.tsx`
  - `web/src/modules/trash/ui/superadmin-document-trash-list.tsx`
- Vistas operativas company alineadas (core):
  - `web/src/app/(company)/app/employees/page.tsx`
  - `web/src/app/(company)/app/users/page.tsx`
  - `web/src/app/(company)/app/announcements/page.tsx`
  - `web/src/app/(company)/app/checklists/page.tsx`
  - `web/src/app/(company)/app/documents/page.tsx`
  - `web/src/app/(company)/app/trash/page.tsx`
  - `web/src/app/(company)/app/dashboard/location/page.tsx`
  - `web/src/modules/employees/ui/new-employee-modal.tsx`
  - `web/src/modules/employees/ui/new-user-modal.tsx`
  - `web/src/modules/employees/ui/employees-table-workspace.tsx`
  - `web/src/modules/employees/ui/users-table-workspace.tsx`
  - `web/src/modules/settings/ui/inline-branch-form.tsx`
  - `web/src/modules/settings/ui/inline-department-form.tsx`
  - `web/src/modules/settings/ui/inline-position-form.tsx`
- Patron de migracion aplicado:
  1) reemplazar hex hardcodeados por `var(--gbp-*)`,
  2) reemplazar CTA repetidos por primitives (`Button`/`SubmitButton`),
  3) preservar estructura funcional y server actions existentes.

### Fase 3 - Migracion por dominios

Objetivo: migrar UI por bloques funcionales para minimizar riesgo.

Orden recomendado:

1. Auth (`/auth/login`, `/auth/forgot-password`, `/auth/change-password`).
2. Shells (`company-shell`, `employee-shell`, nav lateral, topbar).
3. Settings (especialmente branding y billing visual).
4. Superadmin superficies principales.
5. Vistas operativas restantes (employees, documents, checklists, reports).

Checklist:

- [x] auth migrado completo.
- [x] shells migrados completo.
- [x] settings migrado completo.
- [x] superadmin migrado completo.
- [x] resto de vistas core migradas y unificadas con tokens DS.

Avance registrado (2026-03-29, tanda portal empleado y modales):

- Migracion visual a tokens DS en portal empleado:
  - `web/src/app/(employee)/portal/home/page.tsx`
  - `web/src/app/(employee)/portal/checklist/page.tsx`
- Migracion visual en modales/checklists onboarding:
  - `web/src/modules/checklists/ui/employee-checklist-preview-modal.tsx`
  - `web/src/modules/onboarding/ui/employee-welcome-modal.tsx`
- Migracion visual en vistas operativas internas:
  - `web/src/modules/documents/ui/documents-tree-workspace.tsx`
  - `web/src/modules/employees/ui/employees-table-workspace.tsx`
  - `web/src/modules/employees/ui/new-employee-modal.tsx`
- Validacion tecnica ejecutada post-cambios:
  - `npm run lint -- <archivos tocados>` OK.
  - `npm run build` OK.
  - Warning conocido y preexistente de Next.js sobre deprecacion `middleware` -> `proxy`.

### Fase 4 - Hardening visual y cierre

Objetivo: cerrar consistencia y calidad final.

Entregables:

- limpieza de legacy classes redundantes,
- ajuste de contrastes/accesibilidad,
- smoke responsive final,
- documentacion sincronizada.

Checklist:

- [ ] contrastes AA en componentes base y pantallas core.
- [ ] tests/smoke visual por rol.
- [ ] limpieza de tokens no usados.
- [ ] actualizacion final de docs de arquitectura y guia basica.

Avance registrado (2026-03-29, hardening residual DS):

- Limpieza de estilos legacy (hex/hardcoded) en modales, tablas y formularios inline:
  - `web/src/modules/employees/ui/users-table-workspace.tsx`
  - `web/src/modules/employees/ui/new-user-modal.tsx`
  - `web/src/modules/employees/ui/employees-table-workspace.tsx`
  - `web/src/modules/settings/ui/inline-branch-form.tsx`
  - `web/src/modules/settings/ui/inline-department-form.tsx`
  - `web/src/modules/settings/ui/inline-position-form.tsx`
  - `web/src/modules/checklists/ui/employee-checklist-preview-modal.tsx`
  - `web/src/modules/onboarding/ui/employee-welcome-modal.tsx`
  - `web/src/app/(employee)/portal/home/page.tsx`
- Validacion tecnica post-hardening:
  - `npm run lint -- <archivos tocados>` OK.
  - `npm run build` OK.
  - warning conocido y preexistente de Next.js sobre `middleware` -> `proxy`.

Avance registrado (2026-03-29, barrido integral adicional):

- Ajuste visual DS en superficies core restantes por rol:
  - Company: `announcements`, `checklists`, `documents`, `employees`, `users`, `trash`, `dashboard/location`, `settings`.
  - Employee: `portal/announcements`, `portal/documents`, `portal/onboarding`.
  - Superadmin: gradientes hero y ajustes de consistencia en `dashboard`, `organizations`, `plans`, `modules`, `guide`, `feedback`.
- Se mantuvieron flujos funcionales y server actions sin cambios de negocio.
- Validacion final de esta barrida:
  - `npm run lint -- <archivos tocados>` OK.
  - `npm run build` OK.

Avance registrado (2026-03-29, hardening complementario de modulos):

- Limpieza DS de hex hardcodeados y variantes legacy en modales/builders auxiliares:
  - `web/src/modules/checklists/ui/checklist-upsert-modal.tsx`
  - `web/src/modules/checklists/ui/checklist-delete-modal.tsx`
  - `web/src/modules/checklists/ui/checklist-items-builder.tsx`
  - `web/src/modules/employees/ui/user-department-position-fields.tsx`
  - `web/src/modules/trash/ui/document-trash-list.tsx`
- Ajustes de consistencia en estados de accion (restore/delete) y tipado de errores (`unknown`) sin tocar logica de negocio.
- Validacion tecnica de esta tanda:
  - `npm run lint -- <archivos tocados>` OK.

Avance registrado (2026-03-29, cierre visual en reportes):

- Migracion DS en dashboard de reportes para eliminar hex hardcodeados y unificar bordes/superficies/estados con tokens:
  - `web/src/modules/reports/ui/checklist-reports-dashboard.tsx`
- Se conservaron flujos de realtime, filtros y revision de reportes sin cambios funcionales.
- Validacion tecnica puntual:
  - `npm run lint -- src/modules/reports/ui/checklist-reports-dashboard.tsx` OK.

## 5) Riesgos y mitigacion

Riesgos:

- regresiones visuales en modulos con estilos legacy,
- diferencias de tema oscuro entre DS y tema actual,
- inconsistencia temporal durante migracion parcial.

Mitigacion:

- rollout por dominio (no global de una vez),
- snapshots visuales previos/post por ruta,
- fallback controlado por componente,
- PRs chicos por fase con QA acotado.

## 6) Criterios de aceptacion de la integracion

- al menos 90% de pantallas core sin hex hardcodeados nuevos,
- primitives DS usadas en auth/shells/settings,
- dark/light sin cortes visuales notorios,
- responsive consistente en mobile/tablet/desktop,
- documentacion sincronizada en `DOCUMENTACION_TECNICA.md` y `GUIA_BASICA_SISTEMA.md`.

## 7) Plan de ejecucion sugerido (sprint corto)

Sprint 1:

- Fase 0 + Fase 1 completas.

Sprint 2:

- Fase 2 + Auth + Shells.

Sprint 3:

- Settings + Superadmin + hardening.

## 8) Nota operativa para inicio de implementacion

Antes de ejecutar, crear branch dedicada:

- `feature/design-system-foundation`

Y avanzar con commits por fase para facilitar rollback selectivo si aparece regresion visual.
