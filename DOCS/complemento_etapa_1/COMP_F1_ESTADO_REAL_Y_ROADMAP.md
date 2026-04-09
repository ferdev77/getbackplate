# DOC_ID: COMP_F1_STATE_AND_EXECUTION_PLAN
# DOC_LEVEL: COMPLEMENTO
# PHASE_NAMESPACE: COMP_F1_SUBPHASE (no PRODUCT_PHASE)
# SOURCE_OF_TRUTH_FOR: estado real vs gaps + orden de implementacion de Complemento Fase 1

# Evolucion - Complemento Etapa 1 (alineado a codigo real)

## 1) Contexto real de la plataforma (estado actual)

Esta devolucion esta basada en implementacion real de `web/` + `supabase/migrations/` y no en supuestos.

- Roles reales en produccion/dev: `superadmin`, `company_admin`, `manager`, `employee`.
- **No existe rol `owner`** en modelo de datos ni en flujos de acceso.
- El panel empresa usa permisos de gestion para `company_admin` y `manager`.
- El portal empleado opera separado para `employee`.
- Multi-tenant activo con `organization_id`, RLS y validacion por membership.

Referencias clave:
- `supabase/seed.sql`
- `web/src/shared/lib/access.ts`
- `web/src/app/(company)/app/layout.tsx`

---

## 2) Alcance comercial solicitado (ajustado)

Se toma el paquete completo de Complemento Etapa 1, con dos ajustes acordados:

1. Se excluye el modulo de soporte con AI.
2. Se elimina cualquier referencia a `owner` y se mapea a roles reales (`company_admin` / `manager` segun accion).

---

## 3) Matriz veridica: requerimiento vs estado real

### 3.1 Shift Communication Log (nuevo)
**Estado real:** no iniciado.

- No hay tablas/rutas/componentes para bitacora de turnos.
- Solo existe metadata de `shift` en checklists (no cubre comunicacion entre turnos).

Impacto tecnico esperado:
- DB nueva (`shift_logs`, `shift_log_entries`, categorias, estados).
- API company + notificaciones in-app.
- UI empresa/empleado con filtros por locacion y turno.

### 3.2 Supplier & Vendor Directory (nuevo)
**Estado real:** no iniciado.

- No hay modelo de proveedores ni asignacion por locacion.
- No hay auditoria especifica para proveedores.

Impacto tecnico esperado:
- DB nueva (`vendors`, `vendor_locations`, `vendor_audit`).
- CRUD en panel empresa.
- Vista lectura para empleado.

### 3.3 Portal empleado - upload de documentos (mejora)
**Estado real:** parcial.

Lo que ya existe:
- Vínculo empleado-documento con estados `pending|approved|rejected`.
- Flujo robusto de carga desde panel empresa (admin/manager) en altas/edicion de empleado.
- Portal empleado ya lista y descarga documentos visibles.

Lo que falta para requerimiento:
- Endpoint de subida desde portal empleado.
- UI "Mis Documentos" con slots y custom docs para subida directa.
- Flujo de revision con comentario de rechazo/solicitud de resubida (hoy no esta completo).

Referencias:
- `supabase/migrations/20260311000100_base_saas.sql`
- `web/src/app/api/company/employees/route.ts`
- `web/src/app/(employee)/portal/documents/page.tsx`

### 3.4 Vencimiento de documentos y alertas (mejora)
**Estado real:** no iniciado para employee docs.

Lo que hay:
- Cron maestro diario activo.
- Motor de jobs de documentos (post-proceso tecnico, no vencimientos legales).

Gap real:
- No hay `expires_at` ni configuracion de alerta en `employee_documents`.
- No hay job de negocio para "proximo a vencer / vencido".
- No hay notificaciones in-app para este caso.
- No hay estatus automatico de empleado por vencimiento documental.

Referencias:
- `web/src/app/api/internal/cron/daily/route.ts`
- `web/src/app/api/internal/cron/documents/process/route.ts`

### 3.5 Vista de columnas en Documentos (mejora)
**Estado real:** no iniciado (solo vista arbol).

Lo que hay:
- Workspace y arbol documental funcional con acciones de subir/crear carpeta/eliminar/compartir/descargar.

Gap real:
- Falta toggle arbol/columnas.
- Falta componente de navegacion por columnas tipo Finder.
- Falta persistencia de preferencia por usuario para esta vista.

Referencias:
- `web/src/modules/documents/ui/documents-page-workspace.tsx`
- `web/src/modules/documents/ui/documents-tree-workspace.tsx`

### 3.6 Firmas digitales de contratos con DocuSeal (mejora)
**Estado real:** base de contratos existe, firma digital externa no.

Lo que ya existe:
- Perfil contractual en `employee_contracts`.
- Generacion de PDF de contrato desde flujo de empleados.
- Archivado de documento en repositorio y linkage a empleado.

Gap real:
- No hay integracion DocuSeal.
- No hay envio remoto para firma del empleado.
- No hay webhook de firma/rechazo con auditoria legal externa.
- `contract_status` actual no contempla explicitamente "pending_signature" / "rejected_by_employee".

Referencias:
- `supabase/migrations/202603110010_employee_profile_contracts.sql`
- `supabase/migrations/202603110011_employee_contract_signing_fields.sql`
- `web/src/app/api/company/employees/route.ts`

### 3.7 Custom Domain por empresa (mejora)
**Estado real:** avanzado (ya implementado en gran parte).

Lo que ya existe:
- Tabla `organization_domains` con RLS e indices.
- API de alta, recheck, set-primary y delete.
- Integracion Vercel API para verificar estado DNS/SSL.
- Resolucion tenant por host activo + fallback a base URL.
- UI en ajustes empresa para gestionar dominios.
- Links tenant-aware de auth/invitacion recuperan dominio activo.

Pendientes/ajustes sugeridos:
- Homologar etiquetas de estado comercial (`Pendiente/Verificando/Activo/Error`) con estados tecnicos (`pending_dns/verifying_ssl/...`).
- Definir politica funcional para dominios secundarios/deshabilitados y mensajes UX.
- Validar cobertura E2E de links de invitacion/recuperacion en dominio custom.

Referencias:
- `supabase/migrations/20260407000000_organization_domains.sql`
- `web/src/app/api/company/custom-domains/route.ts`
- `web/src/shared/lib/custom-domains.ts`
- `web/src/shared/lib/tenant-auth-branding.ts`
- `web/src/modules/settings/ui/custom-domain-settings-card.tsx`

### 3.8 Estilos de Stripe (checkout + billing portal) (mejora)
**Estado real:** parcial.

Lo que ya existe:
- Flujo de checkout y billing portal funcionando.
- Integracion webhook y sincronizacion de plan.

Gap real:
- No hay personalizacion aplicada desde codigo para marca en checkout/portal.
- En Stripe Checkout hosted, el branding principal se define en Dashboard/Branding de Stripe (o por cuenta conectada), no como theming libre por request.

Referencias:
- `web/src/app/api/stripe/checkout/route.ts`
- `web/src/app/api/stripe/billing-portal/route.ts`

---

## 4) Norte recomendado (implementable y con bajo retrabajo)

### Fase 1 - Cerrar rapido lo parcialmente listo
1. Stripe branding (operativo y QA mobile/desktop).
2. Ajustes finales de Custom Domain (etiquetas, UX de estados, pruebas E2E).

### Fase 2 - Valor operativo nuevo (modulos net-new)
3. Shift Communication Log.
4. Supplier & Vendor Directory.

### Fase 3 - Documentacion de empleado (compliance)
5. Upload desde portal empleado + review loop completo (aprobar/rechazar/resubida con comentario).
6. Vencimientos + alertas + estatus automatico + dashboard de riesgo.

### Fase 4 - Firma legal remota
7. Integracion DocuSeal end-to-end (envio, webhook, archivado, auditoria, estatus).

---

## 5) Definicion de roles para esta etapa (sin owner)

- `superadmin`: habilita modulos a nivel plataforma/tenant y soporte de operacion global.
- `company_admin`: gestion completa dentro de su empresa.
- `manager`: gestion operativa (segun reglas actuales del panel empresa y endpoints company).
- `employee`: uso de portal, lectura/ejecucion segun modulo.

Regla para comunicacion externa: no usar "owner" en alcance tecnico ni funcional porque no existe en RBAC actual.

---

## 6) Borrador de respuesta al owner (listo para enviar)

Hola Angelo, ya hice una revision profunda del sistema real (codigo + base + flujos) para aterrizar el Complemento Etapa 1 de forma veridica.

Confirmo que podemos avanzar con todo el paquete excepto AI, y ya lo ajustamos a los roles reales de la plataforma: `company_admin`, `manager`, `employee` (sin rol owner).

Tambien te marco que Custom Domain ya esta bastante avanzado, mientras que Bitacora/Proveedores y Firma DocuSeal son desarrollo nuevo. En documentos de empleado hay base fuerte, pero faltan upload desde portal, circuito completo de revision y vencimientos con alertas.

Para minimizar riesgo y cotizar mejor, recomiendo ejecutar por fases: (1) Stripe + cierre Custom Domain, (2) Bitacora + Proveedores, (3) Documentos/alertas, (4) DocuSeal.

Si te parece, en el siguiente paso te envio la cotizacion por fase con tiempos, dependencias y criterios de aceptacion.
