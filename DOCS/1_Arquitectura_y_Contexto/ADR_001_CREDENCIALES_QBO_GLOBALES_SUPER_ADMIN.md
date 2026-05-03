# ADR-001: Credenciales Intuit globales y OAuth por empresa

## Estado
Aceptado

## Fecha
2026-05-02

## Contexto
El modulo de integracion QuickBooks Online -> Restaurant365 se implemento inicialmente con `clientId` y `clientSecret` configurables por empresa (tenant).

Aunque ese enfoque funciona, introduce friccion en onboarding y aumenta errores operativos:

- cada empresa necesita completar datos tecnicos de developer;
- crece el riesgo de configuraciones incompletas o incorrectas;
- soporte debe asistir mas casos de setup tecnico no funcional.

El objetivo definido por producto/operacion es que el proveedor final haga lo minimo posible: conectar su QuickBooks y operar el flujo.

## Decision
Se adopta el modelo:

- credenciales de developer Intuit (`client_id`, `client_secret`) como configuracion global de plataforma, administrada solo por Super Admin;
- conexion OAuth y tokens (`realmId`, `access_token`, `refresh_token`, expiracion, estado) mantenidos por empresa (tenant).

En consecuencia, la UI de tenant no debe solicitar ni editar `client_id`/`client_secret`.

## Alcance de la decision
Aplica al modulo QuickBooks Online -> Restaurant365 y a su operacion en dev/staging/produccion.

No aplica a casos enterprise con requerimiento explicito de BYO App (cliente aporta su propia app Intuit), que quedan como excepcion controlada.

## Datos globales vs por empresa

### Global (Super Admin)
- `qbo_client_id`
- `qbo_client_secret`
- `qbo_redirect_uri` (por entorno)
- `qbo_environment` (`sandbox`/`production`, segun entorno)
- scopes OAuth de la app

### Por empresa (tenant)
- `realm_id`
- `access_token`
- `refresh_token`
- `token_expires_at`
- `connection_status`
- `last_error`
- settings operativos de sync
- settings de entrega (FTP) si son propios por empresa

## Consecuencias

### Positivas
- menor friccion de onboarding;
- menos errores de configuracion por empresa;
- mejor gobernanza de secretos;
- operacion mas consistente y escalable.

### Trade-offs
- dependencia mayor de una sola app Intuit (blast radius);
- requiere controles robustos de seguridad y rotacion de secretos globales.

## Flujo funcional esperado
El flujo de negocio no cambia:

1. Empresa inicia `Conectar QuickBooks`.
2. Plataforma construye OAuth URL usando credenciales globales.
3. Usuario autoriza su company en Intuit.
4. Se guardan `realmId` y tokens por tenant.
5. Sync manual/cron usa tokens del tenant.
6. Transformacion, dedupe, export CSV y envio FTP se mantienen igual.

## Seguridad y cumplimiento
- `qbo_client_secret` se administra en secret manager/variables seguras de plataforma.
- no exponer secretos globales en endpoints o UI tenant.
- tokens por tenant cifrados en almacenamiento.
- auditoria de eventos de conexion, refresh y fallos.
- runbook de rotacion de secretos globales y respuesta a incidentes.

## Criterios de aceptacion (DoD)
- documentacion oficial actualizada con este modelo.
- interfaz tenant sin campos `client_id`/`client_secret`.
- configuracion de credenciales Intuit disponible solo en Super Admin.
- pruebas de regresion de OAuth, sync manual, sync cron y reconexion.
- sin perdida de cobertura de datos respecto al modelo anterior.

## Excepciones
Solo se permite BYO App por tenant cuando exista requerimiento contractual/compliance aprobado por producto y arquitectura.

## Referencias
- `web/src/modules/integrations/qbo-r365/service.ts`
- `web/src/modules/integrations/qbo-r365/types.ts`
- `web/src/modules/integrations/qbo-r365/qbo-client.ts`
- `web/src/app/api/company/integrations/qbo-r365/config/route.ts`
- `web/src/app/api/company/integrations/qbo-r365/oauth/start/route.ts`
- `web/src/app/api/company/integrations/qbo-r365/oauth/callback/route.ts`
- `web/src/app/api/company/integrations/qbo-r365/sync/route.ts`
- `web/src/app/api/webhooks/cron/qbo-r365-sync/route.ts`
