# Reporte de validacion - all_locations + multi-puesto (2026-04-29)

## Objetivo

Validar en produccion que un empleado con `all_locations = true` y multiple coincidencia de puestos en scope:

- pueda ser creado con acceso coherente,
- vea recursos positivos por alcance,
- no vea recursos negativos fuera de alcance,
- y que el flujo deje limpieza completa al finalizar.

## Script agregado

- Ruta: `web/scripts/verify-employee-all-locations-multi-position.mjs`
- Comando npm: `npm run verify:employee-all-locations-multi-position`
- Alta en indice operativo: `DOCS/4_Operaciones_y_Guias/GUIA_SCRIPTS_PLATAFORMA.md`

## Entorno probado

- Supabase produccion: `mfhyemwypuzsqjqxtbjf`
- Organizacion objetivo: `Puntos Cardinales`
- Org ID: `8da3a42f-c16e-4b31-96aa-d1fab4ec996f`

## Ejecucion

```bash
cd web
npm run verify:employee-all-locations-multi-position
```

## Qué valida el script

1. Crea usuario Auth temporal de prueba.
2. Crea empleado + membership + profile con `all_locations = true` y `branch_id = null`.
3. Genera 2 puestos con mismo nombre (en distintos departamentos) para forzar resolucion multi-puesto por nombre.
4. Crea datasets positivos/negativos para:
   - avisos (`announcements`),
   - documentos (`documents`),
   - checklists (`checklist_templates`).
5. Evalua reglas de alcance esperadas para empleado con multiple locaciones y multiple `position_ids`.
6. Hace cleanup completo (DB + Auth user temporal).

## Resultado de la corrida (PASS)

- `all_locations activo en membership`: PASS
- `multi-puesto resuelto (>=2 position_ids)`: PASS
- `aviso scope positivo visible`: PASS
- `aviso scope negativo bloqueado`: PASS
- `documento scope positivo visible`: PASS
- `documento scope negativo bloqueado`: PASS
- `checklist scope positivo visible`: PASS
- `checklist scope negativo bloqueado`: PASS
- `cleanup_executed`: `true`

## Observaciones tecnicas

- El script corre con variables de `.env.production.local`.
- Se diseño con `CLEANUP_TEST_DATA=true` por defecto (solo conserva datos si se fuerza `CLEANUP_TEST_DATA=false`).
- El test usa `RUN_TAG` para trazabilidad y evitar colisiones en nombres/codigos.
