# CHECKLIST IMPLEMENTACION CORRECCIONES v2

Documento operativo para ejecutar correcciones por fases, sin cambios visuales de UI, priorizando seguridad, multi-tenant y consistencia de datos.

---

## Como usar este checklist

- Marcar `[x]` al terminar cada tarea.
- No avanzar de fase hasta cerrar criterios de salida.
- Si una tarea cambia alcance, documentar decision en `DOCUMENTACION_TECNICA.md`.

---

## Fase P0 (Critico) - Seguridad y multi-tenant

Objetivo: eliminar riesgos de cobro/permisos y desalineaciones criticas de estado.

- [x] `P0.1` Billing usa tenant activo correcto (cookie/contexto activo)
  - Problema actual: con multiples empresas, puede usar organizacion equivocada.
  - Arreglo: resolver `organization_id` desde tenant activo y validar pertenencia.
  - Resultado esperado: checkout/portal operan solo sobre la empresa seleccionada.

- [x] `P0.2` Billing restringido por rol (`company_admin|manager`)
  - Problema actual: usuarios no autorizados podrian iniciar flujo de billing.
  - Arreglo: control estricto de rol en endpoints de Stripe.
  - Resultado esperado: solo perfiles autorizados pueden pagar/gestionar suscripcion.

- [x] `P0.3` Sincronizar estado RRHH (`organization_user_profiles` <-> `memberships`)
  - Problema actual: estado visual y estado de acceso pueden divergir.
  - Arreglo: al cambiar estado de usuario no-empleado, sincronizar membership si existe.
  - Resultado esperado: estado consistente en todo el sistema.

- [x] `P0.4` Corregir metrica de empleados activos en superadmin
  - Problema actual: conteo usa campo incorrecto (`is_active`).
  - Arreglo: usar `status = 'active'` segun esquema real.
  - Resultado esperado: dashboard/alertas con datos confiables.

### Criterio de salida P0

- [x] Prueba multi-tenant de billing (usuario con 2 empresas) en verde.
- [x] Prueba por rol de billing (admin/manager permitido, empleado bloqueado) en verde.
- [x] Prueba RRHH de activar/desactivar usuario con acceso en verde.
- [x] Metrica superadmin coincide con consulta SQL real.

---

## Fase P1 (Alta) - Consistencia funcional de negocio

Objetivo: eliminar incoherencias que impactan operacion diaria y percepcion de calidad.

- [x] `P1.1` Registro publico habilita modulos core correctos
  - Problema actual: tenant nuevo arranca incompleto.
  - Arreglo: habilitar todos los modulos core definidos en catalogo.
  - Resultado esperado: empresa nueva operativa desde el primer ingreso.

- [x] `P1.2` Corregir `return_url` del billing portal
  - Problema actual: retorno a ruta inexistente.
  - Arreglo: apuntar a ruta valida del panel empresa.
  - Resultado esperado: regreso de Stripe sin 404.

- [x] `P1.3` Corregir lectura IA de ultimo documento (`title`)
  - Problema actual: IA reporta datos incompletos por columna incorrecta.
  - Arreglo: usar campos reales de tabla `documents`.
  - Resultado esperado: respuestas IA precisas y trazables.

- [x] `P1.4` Corregir deteccion de modulo anuncios en portal empleado
  - Problema actual: bandera booleana evaluada de forma incorrecta.
  - Arreglo: evaluar valor RPC real (`data`).
  - Resultado esperado: portal refleja habilitacion real del modulo.

- [x] `P1.5` Evitar updates parciales al cambiar plan de organizacion
  - Problema actual: si falla validacion de downgrade, quedan cambios parciales.
  - Arreglo: validar primero y aplicar update en orden seguro (idealmente atomico).
  - Resultado esperado: cambios de plan consistentes, sin estados intermedios.

### Criterio de salida P1

- [x] Alta publica crea tenant con modulos core esperados.
- [x] Billing portal vuelve a ruta valida.
- [x] IA responde ultimo documento correctamente en pruebas de smoke.
- [x] Portal empleado muestra estado correcto cuando anuncios esta deshabilitado.
- [x] Cambio de plan no deja datos parciales ante error.

---

## Fase P2 (Media) - Redundancia y robustez tecnica

Objetivo: reducir deuda tecnica que puede generar bugs futuros.

- [x] `P2.1` Unificar helper `findAuthUserByEmail` en modulo compartido
  - Problema actual: logica duplicada en multiples archivos.
  - Arreglo: extraer helper unico reutilizable.
  - Resultado esperado: mantenimiento mas simple y consistente.

- [x] `P2.2` Unificar flujo de avatar (API + Server Action)
  - Problema actual: dos implementaciones casi iguales con riesgo de drift.
  - Arreglo: centralizar servicio de avatar.
  - Resultado esperado: una sola fuente de verdad para validacion/upload/cleanup.

- [x] `P2.3` Mover rate-limit/cache de IA a store compartido
  - Problema actual: memoria local no es consistente en multiples instancias.
  - Arreglo: usar storage compartido (ej. Redis/Upstash).
  - Resultado esperado: limites y cache coherentes en produccion.

- [x] `P2.4` Reducir uso de admin client en portal checklist/documentos
  - Problema actual: superficie sensible mayor y firmados poco eficientes.
  - Arreglo: minimizar admin client y optimizar batch de signed URLs.
  - Resultado esperado: mejor seguridad y performance sin romper permisos.

- [x] `P2.5` Deprecar flujo legacy `auth/checkout-redirect`
  - Problema actual: doble camino de checkout.
  - Arreglo: consolidar en flujo API actual y dejar compatibilidad controlada si aplica.
  - Resultado esperado: un solo flujo oficial de cobro.

### Criterio de salida P2

- [x] Duplicaciones criticas removidas.
- [x] Flujo de avatar consolidado.
- [x] IA con rate-limit/cache compartido funcionando.
- [x] Flujo de checkout unico documentado.

---

## Fase P3 (Calidad y alineacion documental)

Objetivo: alinear negocio + implementacion y dejar base limpia para evolucion.

- [x] `P3.1` Alinear docs de IA (`ACTUALIZACION_2.1_SAAS.md` vs packaging oficial)
  - Problema actual: contradiccion sobre capacidad del plan basico.
  - Arreglo: definir politica unica y reflejarla en todos los docs.
  - Resultado esperado: reglas claras para producto, ventas y desarrollo.

- [x] `P3.2` Limpieza de warnings no usados (lint)
  - Problema actual: ruido tecnico y menor calidad percibida.
  - Arreglo: eliminar imports/variables sin uso o justificar excepciones.
  - Resultado esperado: base mas limpia para cambios futuros.

### Criterio de salida P3

- [x] Documentacion sin contradicciones de negocio.
- [x] Lint limpio o warnings justificados.
- [x] `DOCUMENTACION_TECNICA.md` actualizado con decisiones finales.

---

## Tablero rapido de avance

- Fase P0: `4/4` tareas
- Fase P1: `5/5` tareas
- Fase P2: `5/5` tareas
- Fase P3: `2/2` tareas
- Total: `16/16` tareas

---

## Nota de ejecucion

Este plan asume implementacion incremental, pruebas por fase y sin modificaciones visuales no solicitadas.
