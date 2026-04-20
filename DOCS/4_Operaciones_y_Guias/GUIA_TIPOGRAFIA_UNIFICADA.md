# Guia Tipografia Unificada

Fecha: 2026-04-20
Estado: Activa
Baseline: Panel Empresa (`web/src/app/(company)`)

## Objetivo

Mantener una escala tipografica unica en toda la plataforma para que los paneles (company, employee, superadmin) se vean consistentes y faciles de mantener.

## Escala oficial

- `Page title` -> `text-2xl`
- `Section title` -> `text-lg`
- `Body` -> `text-sm`
- `Secondary/meta` -> `text-xs`
- `Compact badge/caption` -> `text-[11px]`
- `Micro label` -> `text-[10px]` (solo casos puntuales)

## Reglas de uso

- Usar clases semanticas existentes cuando aplique (`OperationHeaderCard`, `.gbp-page-eyebrow`).
- Evitar nuevos tamanos arbitrarios `text-[12px]`, `text-[13px]`, `text-[14px]`, `text-[15px]`, etc.
- Permitir `text-[11px]` y `text-[10px]` solo para badges, chips y micro-metadatos.
- No mezclar jerarquias en la misma vista (ej: `title` en `text-xl` y `h1` en `text-lg`).
- Cuando un modulo necesite estilo editorial (ej: preview modal), respetar la escala oficial para texto funcional y usar excepciones minimas solo en elementos decorativos.

## Checklist rapido para PR

- [ ] Los `h1` de pagina usan `text-2xl`.
- [ ] Los `h2` de seccion usan `text-lg`.
- [ ] El texto descriptivo usa `text-sm`.
- [ ] Labels y metadatos usan `text-xs` o `text-[11px]`.
- [ ] No se agregaron nuevos `text-[Npx]` fuera de `10px` y `11px`.

## Nota operativa

Si una pantalla necesita cambiar su escala por un motivo de negocio (legibilidad legal, cumplimiento, etc.), registrar la excepcion en el PR con motivo y alcance.
