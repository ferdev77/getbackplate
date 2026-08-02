# Plan — Estado "sin acceso" para documentos, carpetas, checklists y avisos

**Fecha:** 2026-08-02
**Estado:** Propuesto — no implementado, nada tocado
**Alcance:** modelo de alcance (`target_scope` / `access_scope`), selector de alcance, flujo de borrado de puesto / departamento / locación

---

## 1. Problema

El modelo de alcance sabe expresar dos cosas:

| Cómo se guarda | Qué significa |
|---|---|
| Alguna de las cuatro listas con contenido | Lo ven quienes cumplen esos filtros |
| Las cuatro listas vacías | Lo ve toda la organización |

No existe una tercera: **"no lo ve nadie"**.

Consecuencia concreta: al borrar un puesto, departamento o locación, cualquier documento
cuyo único filtro era esa entidad queda con las cuatro listas vacías, es decir **pasa de
privado a visible por toda la empresa**, sin que nadie lo haya pedido.

### Ocurrencia verificada

El 2026-08-01, al limpiar referencias huérfanas en PROD tras borrar el puesto
`Manager (FOH)` de Juans Restaurants, dos carpetas quedaron con alcance vacío:

```
document_folders "Carpetas de empleados"   users=1 -> 0   => abierta a toda la organización
document_folders "Empleado"                users=1 -> 0   => abierta a toda la organización
```

Ambas fueron restauradas en la misma sesión conservando el id muerto. La restauración
quedó verificada: 21 referencias quitadas, 0 agregadas, 0 carpetas abiertas de más.

### Frecuencia medida en PROD (2026-08-02)

Simulación de "qué se abriría si se borrara cada entidad referenciada en algún alcance":

| Organización | Ítems con alcance | Borrados que abrirían algo |
|---|---|---|
| Juans Restaurants | 49 | 0 |
| Puntos Cardinales | 19 | 3 carpetas (al borrar una locación) |

Es un caso poco frecuente pero reproducible, y su efecto es una exposición de contenido.

---

## 2. Auditoría del código — dónde se decide el alcance

Relevamiento hecho el 2026-08-02 sobre código y sobre las funciones vivas en PROD
(`mfhyemwypuzsqjqxtbjf`), no sobre archivos de migración.

### 2.1 En la aplicación

| Archivo | Qué decide |
|---|---|
| `web/src/shared/lib/scope-policy.ts` | Regla central: `hasScopeFilters`, `isUserOnlyScope`, `canSubjectAccessScope` |
| `web/src/shared/lib/document-access.ts` | `hasExplicitScopeValue` (compuerta de herencia) y acceso a documentos |
| `web/src/shared/lib/audience-resolver.ts` | Copia propia de "vacío = todos" (`isBroadcast`, línea 143) |
| `web/src/shared/lib/scope-selector-model.ts` | `deriveScopeMode`: cómo el selector relee el estado guardado |
| `web/src/modules/announcements/lib/access.ts` | Envoltorio sobre la regla central |
| `web/src/modules/checklists/lib/access.ts` | Envoltorio sobre la regla central |

### 2.2 En la base de datos (PROD)

**14 funciones vivas** contienen lógica de alcance. **11 policies RLS** dependen de ellas:

```
announcements                announcements_tenant_select                -> can_read_announcement
checklist_submission_items   checklist_submission_items_tenant_select   -> can_read_checklist_submission
checklist_submissions        checklist_submissions_tenant_select        -> can_read_checklist_submission
checklist_template_items     checklist_template_items_tenant_select     -> can_read_checklist_template
checklist_template_sections  checklist_template_sections_tenant_select  -> can_read_checklist_template
checklist_templates          checklist_templates_tenant_select          -> can_read_checklist_template
document_folders             document_folders_tenant_select             -> can_read_document_folder
documents                    documents_tenant_select                    -> can_read_document
employee_contracts           employee_contracts_tenant_select           -> can_read_employee_hr_record
employees                    employees_tenant_select                    -> can_read_employee_hr_record
vendors                      vendors_employee_select                    -> (inline)
```

Funciones con la decisión de alcance:
`announcement_scope_match`, `checklist_scope_match`, `current_user_matches_document_scope`,
`resolve_folder_effective_scope`, `can_read_document`, `can_read_document_folder`,
`can_read_announcement` (dos sobrecargas: la de 4 argumentos delega en la de 5),
`can_read_checklist_template`, `count_accessible_documents`.

### 2.3 Hallazgo que condiciona el diseño

La pregunta *"¿este ítem tiene alcance propio o hereda del padre?"* está escrita **tres veces**:

1. `document-access.ts` → `hasExplicitScopeValue`
2. SQL → `resolve_folder_effective_scope` (bloque `scoped`)
3. SQL → `can_read_document` (copia inline de la misma condición)

Las tres definen "tiene alcance propio" como **alguna de las cuatro listas no vacía**.

**Implicancia:** un estado "sin acceso" representado como *flag nuevo + listas vacías*
sería leído como "no tiene alcance propio" y el ítem **heredaría el alcance del padre**,
quedando visible. Además, omitir una de las tres copias produce divergencia silenciosa
entre lo que muestra la app y lo que permite la base.

---

## 3. Enfoque descartado

**Agregar un marcador nuevo al alcance** (por ejemplo `{"sin_acceso": true}`) y enseñarle
a leerlo a la aplicación y a la base.

Descartado por costo/riesgo:

- Requiere modificar las 3 copias de la compuerta de herencia y las funciones de lectura.
- Requiere migración sobre funciones de las que dependen 11 policies RLS.
- La regla de privacidad queda temporalmente distinta entre app y base durante el deploy.
- Un error en cualquiera de los puntos se manifiesta como contenido visible de más.

---

## 4. Enfoque elegido

Representar "no lo ve nadie" **con el modelo actual**, usando un valor reservado en la
lista `users`: un identificador que nunca corresponde a una persona real.

### Por qué funciona sin tocar ninguna regla

| Requisito | Mecanismo existente que ya lo cumple |
|---|---|
| No heredar de la carpeta padre | `users` no vacío ⇒ las 3 compuertas lo tratan como alcance propio |
| Ser privado y no público | Alcance de solo personas ⇒ `isUserOnlyScope` / `announcement_scope_match` lo tratan como privado |
| Que ningún empleado lo abra | Nadie coincide con el valor reservado |
| Que el `company_admin` lo siga viendo | Los `can_read_*` y los helpers de módulo cortocircuitan antes por rol |
| Que el resolvedor de notificaciones no lo difunda | `isBroadcast` es falso (hay `users`), y nadie matchea |

Verificado contra: `scope-policy.ts`, `document-access.ts`, `audience-resolver.ts`,
`announcement_scope_match`, `checklist_scope_match`, `resolve_folder_effective_scope`,
`can_read_document`.

### Diferencia con la reparación de urgencia del 2026-08-01

Aquella conservó *el id muerto que hubiera quedado*: opaco, distinto en cada caso y sin
forma de distinguirlo de un dato viejo. Acá el valor es **uno solo, reservado, con nombre
en el código y con prueba que lo protege**.

### Único bloqueo identificado

`web/src/shared/lib/scope-validation.ts` → `validateTenantScopeReferences` (líneas 126-147)
valida que **cada id de `users` pertenezca a la organización**. Rechazaría el valor
reservado al guardar. Es **el único lugar** que hay que contemplar en la capa de reglas.

---

## 5. Etapas

### Etapa 1 — El estado existe

- Definir la constante reservada en un único archivo, con su explicación.
- Exceptuarla en `validateTenantScopeReferences`.
- Helpers `esSinAcceso(scope)` y `alcanceSinAcceso()` junto a la regla central.
- Tests: que ningún sujeto acceda, que un `company_admin` sí, que una carpeta con este
  alcance **no** herede del padre.
- Test guardián: que la constante no pueda eliminarse de un alcance por una limpieza
  automática.

Sin cambios visibles en pantalla al terminar esta etapa.

### Etapa 2 — Es visible que está así

Precede a cualquier escritura del estado: un ítem que nadie ve y que nadie sabe que
existe es contenido perdido.

- Marca en listados de documentos, carpetas, checklists y avisos.
- Selector: banner de estado al abrir un ítem en "sin acceso", con fecha y motivo,
  las tres opciones habituales sin preselección, y guardado bloqueado hasta elegir.
- El selector **no ofrece** "sin acceso" como cuarta opción: no es una elección de
  autoría, es un estado al que se llega.

### Etapa 3 — Se puede salir del estado

- Reasignar alcance desde el listado y desde el selector.
- Filtro "solo los que quedaron sin acceso" para resolverlos en una pasada.

### Etapa 4 — El flujo de borrado lo usa

Al borrar puesto / departamento / locación:

- Se calculan los ítems afectados.
- **Si ninguno queda sin filtros:** se limpia la referencia y se borra, sin interrumpir.
- **Si alguno queda sin filtros:** se listan y se ofrece
  `sin acceso` (preseleccionada) / `visible para toda la organización` / `cancelar`.
- Se registra fecha y motivo para el banner de la Etapa 2.

---

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| Una limpieza futura de "ids colgados" borra el valor reservado y abre todo | Test guardián + constante con nombre explícito + comentario en el archivo de la regla |
| Ítems existentes cambian de significado | El enfoque es puramente aditivo: ningún alcance actual contiene el valor reservado. Conteo antes/después en DEV y PROD |
| El valor reservado se muestra crudo como si fuera una persona | Etapa 2 lo contempla en selector y listados; sin ella el estado no se escribe |
| Divergencia app/base | No aplica: no se modifica ninguna función ni policy |

---

## 7. Verificación

- `tsc`, `eslint --max-warnings=0`, suite completa, `next build`.
- Tests negativos: romper cada regla nueva y confirmar que el test corta.
- En DEV y PROD, antes y después: cantidad de ítems por estado de alcance
  (público / filtrado / privado por personas / sin acceso), confirmando que solo se
  mueven los que se decidieron mover.

---

## 8. Decisiones abiertas

1. **¿"Sin acceso" es elegible a mano?** Propuesta: no. Si el objetivo es retirar algo de
   circulación sin borrarlo, corresponde una función de archivado propia, no un estado
   dentro de permisos.
2. **Semántica por módulo.** El efecto difiere: en documentos y carpetas el contenido
   queda guardado sin lectores; en checklists nadie completa la tarea; en avisos el envío
   ya ocurrió y solo se afecta el listado. Definir si checklists requiere tratamiento
   distinto (por ejemplo, exigir reasignación en el momento en vez de permitir el estado).
3. **Visibilidad para `company_admin`.** Propuesta: mantenerla. Sin ella el contenido
   queda irrecuperable desde la interfaz.

---

## 9. Estado de ejecución

| Etapa | Estado |
|---|---|
| 1 — El estado existe | No iniciada |
| 2 — Es visible | No iniciada |
| 3 — Se puede salir | No iniciada |
| 4 — Borrado lo usa | No iniciada |

Nada de este plan fue implementado al 2026-08-02.
