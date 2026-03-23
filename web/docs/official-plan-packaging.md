# Official Plan Packaging

Definicion oficial de planes comerciales para GetBackplate.
No modifica UI ni rutas; sirve como contrato de negocio para enforcement backend.

## Planes oficiales vigentes

- `basico` (plan basico)
  - max sucursales: 30
  - max usuarios: 50
  - max empleados: 200
  - max storage: 200 MB
- `pro` (plan pro)
  - max sucursales: 50
  - max usuarios: 50
  - max empleados: 500
  - max storage: 400 MB

## Modulo 2.1 - ai_assistant

- modulo: `ai_assistant`
- habilitado en `basico` y `pro`
- comportamiento por plan:
  - `basico`: modo asistente estructurado (sin IA generativa)
  - `pro`: IA real (OpenAI) con fallback estructurado
