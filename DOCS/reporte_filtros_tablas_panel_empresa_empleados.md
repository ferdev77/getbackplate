# Reporte de comportamiento de filtros en tablas/listados

Fecha: 2026-04-23  
Alcance revisado: panel empresa (`/app/*`) y panel empleado (`/portal/*`) en frontend `web/src`.

## 1) Inventario revisado

### Panel empresa
- `web/src/modules/employees/ui/employees-table-workspace.tsx` (`/app/employees`)
- `web/src/modules/employees/ui/users-table-workspace.tsx` (`/app/users`)
- `web/src/modules/checklists/ui/checklists-list-workspace.tsx` (`/app/checklists`)
- `web/src/modules/documents/ui/documents-tree-workspace.tsx` (`/app/documents`)
- `web/src/modules/vendors/ui/vendors-table-workspace.tsx` (`/app/vendors`)
- `web/src/modules/reports/ui/checklist-reports-dashboard.tsx` (`/app/reports`)

### Panel empleado
- `web/src/modules/documents/ui/employee-documents-tree.tsx` (`/portal/documents`)
- `web/src/modules/checklists/ui/employee-checklist-created-section.tsx` (tab "Creados" en `/portal/checklist`)
- `web/src/modules/vendors/ui/vendors-table-workspace.tsx` (`/portal/vendors`)

### Vistas tabulares/listado sin filtros visibles
- `web/src/modules/checklists/ui/employee-checklist-assigned-section.tsx` (tab "Asignados" en `/portal/checklist`)
- `web/src/modules/trash/ui/document-trash-list.tsx` (`/app/trash`, `/portal/trash`)

---

## 2) Tipos de comportamiento encontrados

### Tipo A - `FilterBar` estandar con "Limpiar filtros"
Usan componente comun `web/src/shared/ui/filter-bar.tsx`.

Presente en:
- Empleados empresa
- Usuarios empresa
- Checklists empresa
- Documentos empresa
- Documentos empleado
- Checklists creados empleado

Comportamiento comun:
- Input de busqueda + `select` de filtros.
- Opcion "todos" por filtro con `value=""`.
- Boton "Limpiar filtros" cuando hay filtros activos.

### Tipo B - toolbar custom (sin `FilterBar`)
Presente en:
- Proveedores (empresa y empleado)
- Reportes (empresa)

Comportamiento comun:
- Input de busqueda y selects propios.
- No tienen boton unificado de "Limpiar filtros".

### Tipo C - listado sin filtros
Presente en:
- Checklists asignados empleado
- Papelera empresa/empleado

---

## 3) Detalle por tabla/listado con filtros

## 3.1 Empleados (empresa)
Archivo: `web/src/modules/employees/ui/employees-table-workspace.tsx`

Filtros:
- Busqueda: nombre completo y puesto.
- Tipo de registro: `employee | user`.
- Locacion (por `branchName`).
- Departamento (por `departmentName`).
- Estado laboral (`active`, `inactive`, `vacation`, `leave`).

Notas de comportamiento:
- Matching exacto en selects.
- Busqueda en minusculas, sin normalizacion de acentos.
- Boton "Limpiar filtros" resetea todos los campos.

## 3.2 Usuarios administradores (empresa)
Archivo: `web/src/modules/employees/ui/users-table-workspace.tsx`

Filtros:
- Busqueda: nombre o email.
- Locacion (por `branchName`).
- Estado de acceso (`active`, `inactive`).

Notas:
- Igual patron al anterior (busqueda simple lowercase, sin quitar acentos).
- "Limpiar filtros" disponible.

## 3.3 Checklists (empresa)
Archivo: `web/src/modules/checklists/ui/checklists-list-workspace.tsx`

Filtros:
- Busqueda por nombre de checklist.
- Tipo (`opening`, `closing`, `prep`, `custom`).
- Locacion (`branch_id` o incluido en `target_scope.locations`).

Notas:
- **Si normaliza acentos** y lowercase en busqueda (`normalize("NFD")`).
- Opciones de locacion se derivan solo de locaciones usadas en templates activos (`activeBranches`).
- "Limpiar filtros" disponible.

## 3.4 Documentos (empresa)
Archivo: `web/src/modules/documents/ui/documents-tree-workspace.tsx`

Filtros:
- Busqueda.
- Carpeta.
- Locacion.
- Departamento.

Notas destacadas:
- Busqueda avanzada: no solo titulo; incluye mime, nombres/ids de scope y roles derivados.
- **Normaliza acentos** + lowercase en busqueda.
- Filtro por carpeta es jerarquico: incluye descendientes del arbol.
- Opciones de locacion/departamento se derivan del scope real de documentos+carpetas (no de catalogo completo).
- "Limpiar filtros" tambien resetea seleccion de arbol/columnas (`selectedTreeFolderId`, `columnPath`).

## 3.5 Proveedores (empresa y empleado)
Archivo: `web/src/modules/vendors/ui/vendors-table-workspace.tsx`

Filtros:
- Busqueda: nombre, contacto, email, telefono, whatsapp.
- Categoria.
- Locacion (branch id).
- Checkbox "Mostrar inactivos".

Notas:
- No usa `FilterBar`; no hay boton de limpiar global.
- Busqueda lowercase, sin normalizacion de acentos.
- Regla especial de locacion: si un proveedor no tiene locaciones asignadas, **sigue apareciendo aunque filtres por una locacion** (se interpreta como proveedor global).
- Mismo comportamiento en empresa y empleado porque comparten componente.

## 3.6 Reportes de checklists (empresa)
Archivo: `web/src/modules/reports/ui/checklist-reports-dashboard.tsx`

Filtros:
- Busqueda: manager, locacion, nombre de template.
- Locacion (por `locationName`, texto).
- Estado (`ok` | `warn`).

Notas:
- No usa `FilterBar`.
- Sin boton "Limpiar filtros" general.
- Busqueda lowercase, sin normalizacion de acentos.

## 3.7 Documentos (empleado)
Archivo: `web/src/modules/documents/ui/employee-documents-tree.tsx`

Filtros:
- Busqueda por titulo.
- Carpeta (solo en modo `tree`).
- Locacion (`branch_id`).
- Departamento (desde scope efectivo de carpeta/doc).

Notas:
- Usa `FilterBar` con "Limpiar filtros".
- Adicionalmente tiene toggle de propiedad: `Asignados` vs `Cargados` (`ownershipView`).
- Filtro por carpeta es directo (`row.folder_id === folderFilter`) en el filtrado base.
- Busqueda lowercase simple, **sin** normalizacion de acentos.

## 3.8 Checklists creados (empleado)
Archivo: `web/src/modules/checklists/ui/employee-checklist-created-section.tsx`

Filtros:
- Busqueda por nombre.
- Locacion (en `target_scope.locations` o `location_scope`).
- Estado (activa/inactiva).

Notas:
- Usa `FilterBar` con "Limpiar filtros".
- Busqueda lowercase simple, sin normalizacion de acentos.
- Opciones de locacion salen del catalogo de sucursales completo recibido por props.

---

## 4) Diferencias relevantes detectadas

1. **Normalizacion de acentos inconsistente**
- Si normalizan: Checklists empresa, Documentos empresa.
- No normalizan: Empleados, Usuarios, Proveedores, Reportes, Documentos empleado, Checklists creados empleado.

2. **Patron de UI de filtros inconsistente**
- Vistas con `FilterBar` tienen UX consistente y boton "Limpiar filtros".
- Proveedores/Reportes usan toolbar custom y no tienen limpieza global equivalente.

3. **Origen de opciones de filtros no uniforme**
- Algunas tablas construyen opciones solo desde data visible/usable (ej. checklists empresa, documentos empresa).
- Otras usan catalogo completo (ej. documentos empleado, checklists creados empleado).

4. **Semantica de filtro de carpeta distinta entre documentos empresa vs empleado**
- Empresa: comportamiento jerarquico (incluye descendencia del arbol).
- Empleado: filtro directo por `folder_id` en el conjunto base.

5. **Semantica especial en proveedores por locacion**
- Con filtro de locacion activo, proveedores "globales" (sin locaciones asignadas) no se excluyen.
- Es intencional en codigo, pero se comporta diferente al patron habitual de "match exacto por locacion".

---

## 5) Resumen ejecutivo

- No hay un unico comportamiento de filtros en toda la plataforma; hay al menos **3 familias** (FilterBar estandar, toolbar custom, y listados sin filtros).
- Las mayores diferencias funcionales estan en:
  - normalizacion de busqueda (acentos),
  - semantica de carpeta en documentos,
  - regla de locacion global en proveedores,
  - presencia/ausencia de "Limpiar filtros".
- No se implementaron cambios en codigo; este documento es solo de relevamiento.
