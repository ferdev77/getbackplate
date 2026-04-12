# DOC_ID: COMP_F1_PHASE4_SHIFTLOG_VENDORS_CHECKLIST
# DOC_LEVEL: COMPLEMENTO
# PHASE_NAMESPACE: COMP_F1_SUBPHASE
# SOURCE_OF_TRUTH_FOR: ejecucion y cierre de Fase 4 Bitacora + Proveedores

# Checklist Fase 4 - Bitacora + Proveedores

Estado inicial: pendiente
Dependencia para abrir fase: Fase 3 cerrada

## Objetivo de fase

Entregar los dos modulos operativos net-new de mayor impacto diario: Bitacora de turnos y Directorio de proveedores, con permisos correctos por rol y alcance por locacion/area.

## Estado real de partida (segun codigo actual)

- Bitacora: no iniciado (sin tablas/rutas/componentes dedicados).
- Proveedores: no iniciado (sin modelo DB ni CRUD por locacion).

## A) Descubrimiento funcional y diseno de dominio

- [ ] A1. Cerrar definicion funcional de Bitacora (tipos de nota, visibilidad, lectura, seguimiento).
- [ ] A2. Cerrar definicion funcional de Proveedores (categorias, contactos, locaciones, notas).
- [ ] A3. Definir entidades, relaciones y permisos por rol para ambos modulos.
- [ ] A4. Validar activacion/desactivacion por modulo por tenant.

## B) Bitacora de turnos

- [ ] B1. Crear esquema DB (logs, entradas, estados, categoria, destinatarios).
- [ ] B2. Implementar API/acciones para crear, listar y marcar leido/requiere accion.
- [ ] B3. Implementar reglas de visibilidad:
  - [ ] relevo directo
  - [ ] nota de area
  - [ ] nota critica
  - [ ] nota sensible admin
- [ ] B4. Implementar UI en panel empresa + vista empleado segun alcance.
- [ ] B5. Agregar auditoria de eventos clave de bitacora.

## C) Proveedores

- [ ] C1. Crear esquema DB (vendors, asignacion por locacion, auditoria minima).
- [ ] C2. Implementar CRUD company para admin/manager segun permiso.
- [ ] C3. Implementar vista de consulta para empleados segun alcance.
- [ ] C4. Implementar filtros utiles (categoria, locacion, disponibilidad/contacto).
- [ ] C5. Agregar auditoria para altas/ediciones/bajas.

## D) Integracion operativa

- [ ] D1. Conectar modulos al catalogo de modulos y navegacion por tenant.
- [ ] D2. Confirmar coherencia con estructura de sucursales/departamentos existente.
- [ ] D3. Confirmar consistencia de feedback (toasts, vacios, errores, confirmaciones destructivas).

## E) QA y evidencia

- [ ] E1. Ejecutar `npm run lint`.
- [ ] E2. Ejecutar `npm run build`.
- [ ] E3. Ejecutar `npm run verify:smoke-modules`.
- [ ] E4. Ejecutar `npm run verify:role-permissions`.
- [ ] E5. Ejecutar `npm run verify:rls-isolation`.
- [ ] E6. Casos funcionales minimos:
  - [ ] bitacora relevo directo visible solo a destinatarios + admin
  - [ ] nota critica visible a turno entrante + admin
  - [ ] proveedor asignado a locacion visible en alcance correcto
  - [ ] CRUD proveedores con permisos correctos

## F) Documentacion de cierre

- [ ] F1. Actualizar `DOCS/1_Arquitectura_y_Contexto/DOCUMENTACION_TECNICA.md`.
- [ ] F2. Actualizar `DOCS/4_Operaciones_y_Guias/GUIA_BASICA_SISTEMA.md`.
- [ ] F3. Actualizar runbook operativo si afecta SOP de tenant/company.
- [ ] F4. Registrar avance de fase en `DOCS/3_Actualizaciones_Sprints/ACTUALIZACION_2.2_SAAS.md` o nuevo archivo vigente.

## Definition of Done (Fase 4)

- [ ] DoD1. Bitacora operativa con visibilidad correcta y seguimiento.
- [ ] DoD2. Proveedores operativos con asignacion por locacion y consulta agil.
- [ ] DoD3. Seguridad/permisos/auditoria cumplen estandar del proyecto.
- [ ] DoD4. Evidencia tecnica + documentacion cerradas.
