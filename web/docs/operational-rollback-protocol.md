# Operational Rollback Protocol

Protocolo de rollback operativo para releases con regresion.
Enfocado en reducir impacto sin cambios destructivos innecesarios.

## 1) Cuándo activar rollback

- error funcional critico en flujo core
- degradacion severa de seguridad o permisos
- falla sistemica en API/servicios
- smoke tests o verificaciones de aislamiento fallando en produccion

## 2) Estrategia de rollback (orden)

1. `Feature rollback` (preferido): desactivar comportamiento nuevo por bandera/modulo.
2. `Application rollback`: volver a build/version estable previa.
3. `Data rollback`: solo con plan validado y evidencia; evitar operaciones irreversibles.

## 3) Checklist de ejecucion

1. Confirmar version estable objetivo.
2. Anunciar ventana y responsable de ejecucion.
3. Aplicar rollback en entorno afectado.
4. Verificar salud post-rollback:
   - `npm run verify:smoke-modules`
   - `npm run verify:role-permissions`
   - `npm run verify:rls-isolation`
5. Monitorear 30-60 min tras rollback.

## 4) Reglas de seguridad durante rollback

- no forzar comandos destructivos sin autorizacion explicita
- no alterar RLS ni estructura DB como "atajo" de mitigacion
- mantener trazabilidad en `audit_logs` y reporte de incidente

## 5) Evidencia minima

- version previa y version revertida
- hora UTC de inicio/fin
- validaciones ejecutadas y resultado
- tenants afectados y estado final

## 6) Cierre

Se considera rollback exitoso cuando:

- flujo critico recuperado
- checks tecnicos en verde
- monitoreo estable sin nuevas alertas
- ticket/incidente actualizado con evidencia
