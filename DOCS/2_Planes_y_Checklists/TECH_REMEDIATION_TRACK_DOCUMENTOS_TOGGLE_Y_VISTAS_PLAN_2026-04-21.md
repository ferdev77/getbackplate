# DOC_ID: TECH_REMEDIATION_TRACK_DOCUMENTS_TOGGLE_AND_VIEWS_PLAN_2026_04_21
# DOC_LEVEL: TECH_REMEDIATION_TRACK
# PHASE_NAMESPACE: TECH_REMEDIATION_TRACK
# SOURCE_OF_TRUTH_FOR: auditoria y plan senior de mejoras en toggle/vistas de Documentos (empresa + empleado)

# Plan Ultra Pro Senior - Documentos (Toggle y Vistas)

Fecha: 2026-04-21
Estado: propuesto para ejecucion
Priorizacion: de menor complejidad a mayor complejidad

## 1) Contexto auditado (README + documentacion + codigo)

### 1.1 Documentos base auditados

- `README.md`
- `web/README.md`
- `DOCS/00_START_HERE.md`
- `DOCS/01_DOC_GOVERNANCE_AND_NAMING.md`
- `DOCS/1_Arquitectura_y_Contexto/DOCUMENTACION_TECNICA.md`
- `DOCS/1_Arquitectura_y_Contexto/ESTRUCTURA_PROYECTO.md`
- `DOCS/1_Arquitectura_y_Contexto/ESTADO_Y_AUDITORIA_ACTUAL.md`
- `DOCS/1_Arquitectura_y_Contexto/MATRIZ_COBERTURA_REALTIME.md`
- `DOCS/4_Operaciones_y_Guias/GUIA_FLUJO_DOCUMENTOS_CUSTOM_EMPLEADOS.md`
- `DOCS/4_Operaciones_y_Guias/GUIA_SEPARACION_DOCUMENTOS_LABORALES_OPERATIVOS.md`
- `DOCS/2_Planes_y_Checklists/COMP_F1_FASE_2_DOCUMENTOS_ALERTAS_DOCUSEAL_CHECKLIST.md`
- `DOCS/2_Planes_y_Checklists/COMP_F1_FASE_3_STRIPE_BRANDING_COLUMNAS_CHECKLIST.md`
- `DOCS/3_Actualizaciones_Sprints/ACTUALIZACION_2.2_SAAS.md`
- `DOCS/4_Operaciones_y_Guias/REPORTE_EJECUCION_ULTRA_PASADA_ARQUITECTURA_2026-04-19.md`

### 1.2 Codigo auditado (foco Documentos)

- `web/src/modules/documents/ui/documents-page-workspace.tsx`
- `web/src/modules/documents/ui/documents-tree-workspace.tsx`
- `web/src/modules/documents/ui/employee-documents-tree.tsx`
- `web/src/modules/documents/hooks/use-employee-documents-preferences.ts`
- `web/src/shared/ui/assigned-created-toggle.tsx`
- `web/src/app/(company)/app/documents/page.tsx`
- `web/src/app/(employee)/portal/documents/page.tsx`
- `web/e2e/documents-view-mode.spec.ts`

### 1.3 Estado del pedido puntual (toggle)

- Pedido original: replicar comportamiento visual del toggle de documentos empleado en panel empresa, especialmente fondo del estado activo.
- Estado actual: implementado en `web/src/modules/documents/ui/documents-page-workspace.tsx`.
- Resultado: activo con `bg-[var(--gbp-accent-glow)]`, borde de acento y texto de acento, alineado con portal empleado.

## 2) Auditoria profunda: que esta mal, que falta, y riesgo real

## 2.1 Hallazgos cerrados

1. **Consistencia visual del selector de vista empresa**
   - Antes: estado activo distinto al portal empleado.
   - Ahora: corregido y consistente.

## 2.2 Hallazgos abiertos (importantes)

1. **Bug de persistencia en portal empleado (orden de `useEffect`)**
   - Archivo: `web/src/modules/documents/hooks/use-employee-documents-preferences.ts`.
   - Problema: se escribe `localStorage` antes de leer valor previo, pudiendo pisar preferencia existente en primer render.
   - Impacto: el modo de vista y carpeta en columnas puede no restaurarse correctamente tras recarga.

2. **Bug equivalente en seleccion de carpeta de columnas (empresa)**
   - Archivo: `web/src/modules/documents/ui/documents-tree-workspace.tsx`.
   - Problema: persiste/remueve key de carpeta antes de hidratar valor guardado.
   - Impacto: perdida de contexto de carpeta al refrescar.

3. **Cobertura E2E debil para modo de vista**
   - Archivo: `web/e2e/documents-view-mode.spec.ts`.
   - Problema: assertions actuales (`Carpetas`) no validan realmente arbol vs columnas; pueden pasar en estados no deseados.
   - Impacto: falso verde CI sobre un flujo critico UX.

4. **Duplicacion de implementacion de selector de vista**
   - Archivos: `documents-page-workspace.tsx` y `employee-documents-tree.tsx`.
   - Problema: estilos y estados replicados manualmente.
   - Impacto: drift visual/funcional futuro y mas costo de mantenimiento.

5. **Hotspots de complejidad alta en workspaces**
   - `documents-tree-workspace.tsx`: ~1393 lineas.
   - `employee-documents-tree.tsx`: ~1051 lineas.
   - Impacto: mas riesgo de regresion, mayor tiempo de onboarding, baja testabilidad unitaria.

6. **Gap de contrato de comportamiento en docu tecnica especifica de toggle**
   - Hay mencion funcional del toggle en varias guias, pero falta contrato tecnico unificado de:
     - clases/estados activos,
     - persistencia y precedencia URL vs `localStorage`,
     - selectores estables para QA automatizado.

## 3) Plan de implementacion senior (menor complejidad -> mayor complejidad)

## Fase 1 - Hardening rapido de persistencia (Complejidad: Baja)

- **Que esta mal/no hecho:** orden de efectos en portal (y seleccion de carpeta en empresa) puede pisar preferencias guardadas.
- **Que se va a hacer:** hidratar primero (read), persistir despues (write) con flag de hidratacion.
- **Como se va a hacer:**
  - introducir `hasHydrated` por hook/componente;
  - bloquear `setItem/removeItem` hasta completar lectura inicial;
  - conservar contrato de keys actuales para no romper usuarios existentes.
- **Como va a quedar:** recarga restaura correctamente vista/carpeta previa en empresa y portal.
- **Criterio de aceptacion:** dos recargas consecutivas mantienen vista `columns` y carpeta seleccionada.

## Fase 2 - Cerrar hueco de testing E2E real (Complejidad: Baja)

- **Que esta mal/no hecho:** test actual no prueba modo visual real.
- **Que se va a hacer:** agregar aserciones de estado exactas por `data-testid` y `aria-pressed`.
- **Como se va a hacer:**
  - validar `aria-pressed=true` en boton correcto;
  - validar presencia de marcador exclusivo de columnas (ej. `data-testid="documents-columns-root"`);
  - validar ausencia/presencia de marcador exclusivo de arbol.
- **Como va a quedar:** pruebas detectan regresiones reales de comportamiento.
- **Criterio de aceptacion:** fallo garantizado si se rompe persistencia o si no cambia de modo.

## Fase 3 - Contrato UI unificado del selector de vista (Complejidad: Baja-Media)

- **Que esta mal/no hecho:** selector duplicado entre empresa y portal.
- **Que se va a hacer:** crear componente compartido `DocumentViewModeToggle` en `shared/ui`.
- **Como se va a hacer:**
  - extraer markup/clases/`aria-pressed`/tooltips a un unico componente;
  - parametrizar `testIdPrefix` para empresa y portal;
  - mantener iconos y tokens actuales (`--gbp-accent`, `--gbp-accent-glow`).
- **Como va a quedar:** un solo punto de mantenimiento visual/funcional del selector.
- **Criterio de aceptacion:** ambos contextos consumen mismo componente y snapshot visual consistente.

## Fase 4 - Especificacion tecnica en documentacion canonica (Complejidad: Media)

- **Que esta mal/no hecho:** no existe especificacion tecnica central de precedence y QA del toggle.
- **Que se va a hacer:** documentar contrato unico en guia de documentos.
- **Como se va a hacer:** ampliar `DOCS/4_Operaciones_y_Guias/GUIA_FLUJO_DOCUMENTOS_CUSTOM_EMPLEADOS.md` (o guia tecnica hermana) con:
  - maquina de estados de vista (`tree|columns`),
  - prioridad de fuente (`URL` > `localStorage` > default server),
  - selectores E2E canonicos,
  - matriz de regresion minima.
- **Como va a quedar:** menos ambiguedad funcional y menor riesgo de drift entre equipo dev/QA.
- **Criterio de aceptacion:** doc con seccion de contrato tecnico aprobada y referenciada en `00_START_HERE`.

## Fase 5 - Modularizacion de workspaces de documentos (Complejidad: Media-Alta)

- **Que esta mal/no hecho:** componentes de 1000+ lineas con demasiadas responsabilidades.
- **Que se va a hacer:** dividir por dominios internos (filtros, DnD, columnas, preview, acciones).
- **Como se va a hacer:**
  - extraer hooks: `useDocumentsDnd`, `useDocumentsFilters`, `useDocumentsColumns`;
  - extraer subcomponentes presentacionales puros;
  - mantener APIs y UX actuales sin romper flujos.
- **Como va a quedar:** codigo mas testeable y con menor costo de cambio.
- **Criterio de aceptacion:** reduccion sustancial de LOC por archivo y sin regresion funcional.

## Fase 6 - Performance de arbol/columnas para volumen alto (Complejidad: Alta)

- **Que esta mal/no hecho:** render y recomputos in-memory pueden escalar mal con arboles/carpetas grandes.
- **Que se va a hacer:** optimizar derivaciones y render incremental.
- **Como se va a hacer:**
  - memorizar selectivamente por dependencias finas;
  - evaluar virtualizacion de listas largas en columnas;
  - reducir trabajo en cada `dragover` (throttle/debounce liviano);
  - perf budget con medicion local.
- **Como va a quedar:** UX fluida en tenants con alto volumen documental.
- **Criterio de aceptacion:** mejora medible de tiempo de interaccion y menos repaints en escenarios grandes.

## Fase 7 - Telemetria y observabilidad de UX documental (Complejidad: Alta)

- **Que esta mal/no hecho:** no hay visibilidad fina de uso/falla del selector de vista y persistencia.
- **Que se va a hacer:** instrumentar eventos de uso y fallos no sensibles.
- **Como se va a hacer:**
  - eventos auditables de `documents.view_mode.changed`;
  - eventos de fallback cuando falla restauracion de preferencias;
  - tablero operativo simple para tasa de uso tree vs columns.
- **Como va a quedar:** decisiones de UX basadas en datos reales y deteccion temprana de regresiones.
- **Criterio de aceptacion:** eventos visibles y trazables por tenant/usuario sin exponer datos sensibles.

## Fase 8 - Cierre de arquitectura y politica de no drift (Complejidad: Alta)

- **Que esta mal/no hecho:** mejoras puntuales no quedan blindadas para futuras iteraciones.
- **Que se va a hacer:** cerrar con guardrails tecnicos y de PR.
- **Como se va a hacer:**
  - checklist de PR especifico para documentos (toggle, persistencia, E2E, accesibilidad);
  - regla: todo cambio de vista debe tocar componente compartido y tests;
  - actualizacion de docs de referencia en `00_START_HERE`.
- **Como va a quedar:** gobernanza tecnica estable para evitar regresiones repetidas.
- **Criterio de aceptacion:** guardrails en doc + evidencia de pipeline verde.

## 4) Plan de ejecucion sugerido (sprints)

- **Sprint 1 (corto):** Fases 1, 2 y 3.
- **Sprint 2 (corto):** Fase 4 y parte inicial de Fase 5.
- **Sprint 3 (medio):** cierre Fase 5 + Fase 6.
- **Sprint 4 (medio):** Fases 7 y 8 + reporte final.

## 5) Validacion minima por fase

- `npm run lint`
- `npm run build`
- `npm run verify:smoke-modules`
- `npm run e2e:documents`
- Validacion manual puntual:
  - empresa `/app/documents` conserva vista tras reload,
  - empleado `/portal/documents` conserva vista tras reload,
  - estado visual activo del toggle igual en ambos contextos.

## 6) Resultado esperado de negocio y tecnico

- Menos bugs de preferencia de vista percibidos por usuarios.
- Menor tiempo de mantenimiento del modulo documentos.
- Menor riesgo de drift entre panel empresa y portal empleado.
- Mayor confianza en releases por E2E con aserciones reales.
- Base lista para evolucionar documentos sin reabrir deuda estructural.
