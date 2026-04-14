# DOC_ID: COMP_F1_PHASE2_DOCUMENTS_ALERTS_DOCUSEAL_CHECKLIST
# DOC_LEVEL: COMPLEMENTO
# PHASE_NAMESPACE: COMP_F1_SUBPHASE
# SOURCE_OF_TRUTH_FOR: ejecucion y cierre de Fase 2 Mis Documentos + Alertas + DocuSeal

# Checklist Fase 2 - Mis Documentos + Vencimientos + DocuSeal

Estado inicial: pendiente
Dependencia para abrir fase: Fase 1 cerrada

## Objetivo de fase

Completar el flujo de compliance documental de empleado end-to-end: carga desde portal, revision con circuito formal, alertas de vencimiento y firma legal remota con DocuSeal.

## Decision funcional cerrada (owner)

- El acceso principal de empleado para su perfil/documentacion sera desde el sidebar del portal: click en avatar + nombre.
- Ese click abre un modal de perfil de empleado en estilo/estructura equivalente al modal de RRHH (alta/edicion), pero en modo empleado.
- En modo empleado:
  - datos personales/laborales: solo lectura.
  - contrato: solo lectura.
  - documentos: lectura de estado + acciones de ver/descargar + carga de archivos permitidos.
- El empleado no puede editar campos sensibles de perfil; solo puede cargar/reemplazar su documentacion.
- Los 6 documentos base se mantienen como canonicos y se muestran aunque esten pendientes.

## Estado real de partida (segun codigo actual)

- Ya implementado: portal empleado lista/descarga documentos visibles y existe base contractual + generacion de PDF.
- Pendiente de cierre: upload desde portal empleado, review loop completo con comentario de rechazo/resubida, motor de vencimientos con alertas, integracion DocuSeal y webhook legal.

## A) Modelo de datos y migraciones

- [ ] A1. Definir cambios de esquema para upload portal empleado (si falta metadata/estados).
- [ ] A2. Agregar `expires_at` y configuracion de alertas en documentos de empleado.
- [ ] A3. Definir estados contractuales para firma remota (`pending_signature`, `signed`, `rejected`).
- [ ] A4. Crear migraciones y validar compatibilidad con datos existentes.
- [ ] A5. Verificar politicas RLS para employee/company_admin en cada tabla impactada.

## B) Mis Documentos (portal empleado)

- [ ] B1. Implementar trigger de perfil desde sidebar (avatar + nombre) que abra modal de perfil empleado.
- [ ] B2. Reutilizar/extraer estructura del modal de RRHH para modo empleado (read-only en datos/contrato).
- [ ] B3. Renderizar 6 slots base canonicos en modal empleado con estado visual: cargado/pending/no cargado.
- [ ] B4. Implementar endpoint de subida/reemplazo desde modal empleado con validaciones de seguridad.
- [ ] B5. Definir estado inicial del documento subido por empleado (`pending_review`).
- [ ] B6. Confirmar feedback inmediato en UI (sin reload manual).

## C) Review loop documental (empresa)

- [ ] C1. Implementar acciones de aprobar/rechazar/solicitar resubida.
- [ ] C2. Incluir comentario obligatorio al rechazar o pedir resubida.
- [ ] C3. Reflejar historico basico de revision por documento (quien/cuando/resultado).
- [ ] C4. Confirmar notificacion interna al empleado ante decision.

## C.1) Reglas de UX y permisos para el modal empleado

- [ ] C1.1. En modo empleado ocultar/bloquear controles de edicion de identidad, locacion, puesto y cuenta.
- [ ] C1.2. Permitir solo acciones documentales autorizadas: subir/reemplazar/ver/descargar.
- [ ] C1.3. Mostrar en cada slot ultimo estado de revision y comentario de rechazo (si existe).
- [ ] C1.4. Mantener trazabilidad de origen en auditoria (`source: employee.portal.profile_modal`).

## D) Vencimientos y alertas

- [ ] D1. Configurar ventanas de alerta soportadas: 45, 30, 15, 7, 3, 1 dia.
- [ ] D2. Implementar job de negocio diario para proximos a vencer y vencidos.
- [ ] D3. Actualizar estatus documental del empleado segun vencimiento.
- [ ] D4. Exponer vista/riesgo para admin con casos proximos y vencidos.

## E) DocuSeal end-to-end

- [ ] E1. Integrar envio de contrato a DocuSeal desde flujo de empresa.
- [ ] E2. Implementar webhook DocuSeal para firmado/rechazado.
- [ ] E3. Archivar contrato final automaticamente en Documentos del empleado.
- [ ] E4. Registrar auditoria legal minima (evento, timestamp, actor externo, resultado).
- [ ] E5. Notificar resultado a admin y empleado.

## F) QA y evidencia

- [ ] F1. Ejecutar `npm run lint`.
- [ ] F2. Ejecutar `npm run build`.
- [ ] F3. Ejecutar `npm run verify:smoke-modules`.
- [ ] F4. Ejecutar `npm run verify:document-guardrails`.
- [ ] F5. Ejecutar `npm run verify:rls-isolation`.
- [ ] F6. Ejecutar casos funcionales minimos:
  - [ ] click avatar/nombre abre modal perfil empleado
  - [ ] datos y contrato bloqueados en solo lectura
  - [ ] slots base visibles aunque no haya archivos
  - [ ] upload empleado exitoso
  - [ ] rechazo con comentario y resubida
  - [ ] alerta pre-vencimiento
  - [ ] cambio a vencido
  - [ ] contrato firmado por DocuSeal
  - [ ] contrato rechazado por DocuSeal

## G) Documentacion de cierre

- [ ] G1. Actualizar `DOCS/1_Arquitectura_y_Contexto/DOCUMENTACION_TECNICA.md`.
- [ ] G2. Actualizar `DOCS/4_Operaciones_y_Guias/GUIA_BASICA_SISTEMA.md`.
- [ ] G3. Actualizar flujo operativo de documentos/firma en guias de operaciones.
- [ ] G4. Registrar avance de fase en `DOCS/3_Actualizaciones_Sprints/ACTUALIZACION_2.2_SAAS.md` o nuevo archivo vigente.

## Definition of Done (Fase 2)

- [ ] DoD1. Empleado abre su modal de perfil desde sidebar y puede cargar/re-cargar documentos desde ahi.
- [ ] DoD2. Admin completa revision con trazabilidad y comentarios.
- [ ] DoD3. Alertas y vencimientos funcionan de forma automatica y visible.
- [ ] DoD4. Contrato recorre DocuSeal completo hasta archivado/notificacion.
- [ ] DoD5. Evidencia tecnica + documentacion cerradas.
