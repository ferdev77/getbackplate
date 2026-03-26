# Plan de Implementación: Recurrencia Avanzada (Checklists y Avisos)

Este documento detalla la arquitectura para soportar programación avanzada (cron, días específicos, trimestral, anual) tanto para la generación de checklists como para el envío recurrente de avisos, centralizando la lógica en un motor de tareas programadas (Job Scheduler).

## Objetivo

Actualmente `checklists` tiene un campo de texto básico (`repeat_every`) sin ejecución real, y `announcements_deliveries` se basa en un pull de cola manual o en background aislado.
El objetivo es crear un motor de recurrencia real impulsado por PostgreSQL (`pg_cron`) o un servicio externo simple (Vercel Cron) que orqueste la creacion de instancias y envios basandose en una configuracion detallada (RRULE / Expresiones Cron).

**Decisión Arquitectónica:** Avanzar con **Vercel Cron Jobs** (1 ping por hora a un endpoint seguro) porque es gratis, agnóstico a la red local de DB, más fácil de debugear (logs de Vercel) y no requiere habilitar extensiones en Postgres.

---

## Propuesta Arquitectónica

### 1. Modelo de Datos Unificado de Tareas (Job Queue)

Crearemos una tabla central `scheduled_jobs` para manejar cualquier tarea diferida o recurrente (Checklists, Avisos, o futuros reportes).

#### Nueva Tabla `scheduled_jobs`
```sql
create table scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) not null,
  job_type text not null, -- 'checklist_generator', 'announcement_delivery'
  target_id uuid not null, -- ID del checklist_template o announcement
  cron_expression text, -- ej: '0 9 * * 1,5' (Lunes y Viernes 9am)
  recurrence_type text not null, -- 'daily', 'weekly', 'monthly', 'yearly', 'custom_days'
  custom_days integer[], -- [1, 5] para Lunes y Viernes
  metadata jsonb default '{}',
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 2. Checklists (Generación de Instancias)

Actualmente solo existe el *Template*. Necesitamos que el usuario lo complete instanciando tareas.

#### Cambios en UI
- Modificar el selector "Frecuencia" en `checklist-upsert-modal.tsx` para incluir:
  - Personalizada (Días específicos: Lunes, Martes, etc.)
  - Trimestral
  - Semestral
  - Anual
- Al guardar el Checklist, generar un registro en `scheduled_jobs` asociado al `template_id`.

#### Proceso Backend
- El Cron Job procesará todos los `scheduled_jobs` de tipo `checklist_generator` cuyo `next_run_at <= now()`.
- Por cada uno, se genera una *Instancia Vacía* (Submission Pending) asignada a los usuarios correspondientes.
- Notificaciones (Email/SMS) se envían avisando "Tienes un checklist pendiente hoy".
- Se actualiza el `next_run_at` usando la expresión cron.

### 3. Avisos (Envío Recurrente)

Actualmente los avisos se envian una sola vez al crearse (pasan a `announcement_deliveries` como `queued`).

#### Cambios en UI
- Agregar en el modal de Nuevo Aviso un toggle: "Enviar periódicamente".
- Si se activa, mostrar el mismo selector de frecuencia que Checklists.
- Guardar el aviso y registrar en `scheduled_jobs` con tipo `announcement_delivery`.

#### Proceso Backend
- El Cron Job tomará los de tipo `announcement_delivery` cuyo `next_run_at <= now()`.
- Insertará un nuevo batch en `announcement_deliveries` con estado `queued` hacia la audiencia calculada al momento.
- Se actualiza el `next_run_at`.
- El servicio de deliveries actual (`processAnnouncementDeliveries`) se despacha justo después, consumiendo esa cola.

### 4. Flujo del Scheduler (Endpoint Seguro)

#### Nuevo Endpoint `web/src/app/api/webhooks/cron/process-recurrence/route.ts`
- Ruta GET/POST expuesta.
- Protegida requerir el HEADER `Authorization: Bearer <CRON_SECRET>`.
- Orquesta las lecturas y escrituras atómicas (Transactions) usando `createSupabaseAdminClient()`.

---

## Roadmap de Implementacion (Checklist)

### Fase 1: Motor y Base de Datos
- [ ] M1. Crear migración SQL para tabla `scheduled_jobs` e índices.
- [ ] M2. Habilitar y validar RLS sobre `scheduled_jobs`.
- [ ] M3. Configurar endpoint de webhook protegido para el disparo de Vercel Cron.
- [ ] M4. Instalar y configurar librería `cron-parser` para cálculo de `next_run_at`.

### Fase 2: Módulo Avisos (Announcements)
- [ ] A1. Extender `announcements_actions.ts` y servicio para upsert de jobs.
- [ ] A2. Modificar modal de creación/edición de UI con selector de frecuencias cron/custom.
- [ ] A3. Implementar handler en el endpoint del cron para despachar avisos recurrentes a la tabla `announcement_deliveries`.
- [ ] A4. Conectar la ejecución del cron al servicio de `processAnnouncementDeliveries()`.

### Fase 3: Módulo Checklists (Generación de Tareas)
- [ ] C1. Extender base de datos (si aplica) para soportar estado `pending` en checklists instanciados sin enviar.
- [ ] C2. Extender el servicio de templates (`checklist-template.service.ts`) para sincronizar `scheduled_jobs` cuando cambie la periocidad.
- [ ] C3. Modificar UI de creación/edición de plantillas con el selector avanzado.
- [ ] C4. Implementar handler en el cron para generar instancias pre-asignadas a los usuarios y notificarles (Mails/SMS de aviso de tarea pendiente).

### Fase 4: QA y Documentación
- [ ] Q1. Escribir tests de aislamientos `npm run verify:` si es posible.
- [ ] Q2. Testear ejecución "forced" en entorno local simulando tiempos.
- [ ] Q3. Actualizar `DOCUMENTACION_TECNICA.md` con arquitectura del Scheduler.
- [ ] Q4. Registrar hito en `CHECKLIST_MAESTRO_PRODUCTO.md`.
