# Arquitectura — SaaSResto

## Estructura de módulos

```
web/src/
├── app/           Next.js App Router (páginas y API routes)
├── modules/       Módulos de feature — aquí vive la lógica de negocio
├── shared/        Utilidades cross-módulo (auth, audit, scope, access)
└── infrastructure/  Adaptadores de servicios externos (Supabase, Stripe, Brevo, Twilio, DocuSeal)
```

### Regla: shared/ es solo para código cross-módulo real
Si un archivo en `shared/lib/` solo lo usa un módulo, muévelo a `modules/<feature>/lib/`. Los archivos en `shared/lib/` deberían ser necesarios por al menos 2 módulos distintos.

---

## Estrategia de caché (cuándo usar qué)

### Regla de decisión

| Cuándo usar | Herramienta | Ejemplo |
|-------------|-------------|---------|
| Deduplicar la misma query dentro del mismo request (árbol de componentes) | `cache()` de React | `getCurrentUser()`, `getCurrentTenant()` |
| Datos que no cambian frecuentemente, compartidos entre requests | `unstable_cache()` de Next.js con tag | `getEnabledModulesCached()`, `getOrganizationSettingsCached()` |
| Datos frescos que cambian con cada acción del usuario | Sin caché — query directa | Listas de empleados, anuncios, documentos |

### Cuándo usar `cache()` (React)
```typescript
import { cache } from "react";

// Una sola DB call aunque 10 componentes lo llamen en el mismo render
export const getCurrentUser = cache(async () => { ... });
```
- Scope: un solo request/render
- Se limpia automáticamente entre requests
- Ideal para datos de sesión (usuario actual, tenant activo)

### Cuándo usar `unstable_cache()` (Next.js)
```typescript
import { unstable_cache } from "next/cache";

export const getEnabledModulesCached = unstable_cache(
  async (orgId: string) => { ... },
  ["enabled-modules"],
  { revalidate: 300, tags: ["org-modules"] }
);
```
- Scope: cross-request, persiste en el servidor
- Se invalida manualmente con `revalidateTag()` o por TTL
- Usar solo para datos que cambian con acciones administrativas (settings, módulos)
- TTL recomendado: 60s para datos semi-estáticos, 300s para datos muy estáticos

### Cuándo NO usar caché
- Listas que el usuario modifica frecuentemente (empleados, documentos, anuncios)
- Datos que deben reflejar el estado actual sin delay
- En páginas que ya reciben revalidación explícita via `revalidatePath()`

### Invalidación de caché
Siempre usar `revalidateTag()` o `revalidatePath()` en las server actions que modifican datos:
```typescript
// En una action que modifica módulos de la organización:
revalidateTag(`org-modules-${organizationId}`);
```

---

## Patrones de API routes

### Acceso protegido
Todos los routes deben comenzar con la guardia correspondiente:
```typescript
// Para company admin:
const moduleAccess = await assertCompanyAdminModuleApi("module-name");
if (!moduleAccess.ok) return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });

// Para empleados:
const moduleAccess = await assertEmployeeModuleApi("module-name");
if (!moduleAccess.ok) return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
```

### Auditoría
Toda operación de escritura debe loguear un evento de auditoría:
```typescript
await logAuditEvent({
  action: "entity.operation",
  entityType: "table_name",
  entityId: recordId,
  organizationId: tenant.organizationId,
  eventDomain: "module-name",
  outcome: "success" | "error" | "denied",
  severity: "low" | "medium" | "high",
  actorId,
  metadata: { ... },
});
```

---

## Resolución de audiencias (anuncios y checklists)

La función `resolveAudienceContacts()` en `shared/lib/audience-resolver.ts` es la única implementación para resolver a qué usuarios/empleados enviar notificaciones dado un scope.

Los módulos `announcements` y `checklists` la usan como thin wrapper. No duplicar esta lógica.

---

## Middleware / Proxy

**IMPORTANTE:** Este proyecto usa Next.js 16+. En esta versión el archivo de middleware convencional cambió de nombre:

| Versión Next.js | Archivo correcto |
|---|---|
| ≤ 15 | `src/middleware.ts` |
| 16+ | `src/proxy.ts` |

El archivo de entrada es **`src/proxy.ts`** — no crear `src/middleware.ts`. Si ambos existen al mismo tiempo, Next.js lanza este error y el servidor no arranca:

```
Error: Both middleware file "./src/middleware.ts" and proxy file "./src/proxy.ts" are detected.
Please use "./src/proxy.ts" only.
```

`proxy.ts` maneja:
1. Rate limiting global (20 req/10s por IP via Upstash)
2. Redirección de auth callbacks
3. Resolución de custom domains a organizationId
4. Cookie de tenant activo

Si Upstash no está configurado, el rate limiting se desactiva silenciosamente.

---

## Estrategia de testing

**Baseline validado el 2026-07-26:** 405 tests Vitest, 129 tests criticos, RLS real aprobado y 192 migraciones sincronizadas en dev/prod.

### Capas

| Capa | Comando | Proposito |
|---|---|---|
| Unit/integration mock | `npm test` | Logica y rutas con dependencias simuladas |
| Critical coverage | `npm run test:critical` | Gate para QBO-R365, planes, billing y scopes |
| PostgreSQL RLS/RPC | `npm run verify:rls-isolation:dev` | Policies y grants reales con rollback |
| Migration history | `npm run verify:migrations:dev` | Archivos locales vs historial de dev |
| Static analysis | `npx tsc --noEmit --incremental false` | Contratos TypeScript sin cache incremental |
| Lint/guardrails | `npm run lint` | ESLint y layout canonico |

### Aislamiento

- Vitest usa `envDir: false`; no carga ningun archivo `.env`.
- `test/network-guard.ts` bloquea fetch, HTTP/S, TCP, TLS, HTTP/2 y UDP.
- Las pruebas unitarias deben mockear Supabase, Stripe, Intuit y FTP.
- El runner RLS acepta exclusivamente Supabase dev `uubdslmtfxwraszinpao`.
- Todos los fixtures RLS viven en una transaccion y se eliminan con rollback verificado.
- Prodel y cualquier dato productivo estan prohibidos como fixtures.

### Invariantes cubiertos

- aislamiento entre tenants;
- PII, contratos y salarios propios;
- delegacion HR limitada por locaciones;
- usuarios directos como grant de scope;
- OR dentro de una dimension y AND entre dimensiones;
- documentos legacy por branch y herencia de carpetas;
- RPC privilegiados service-role only;
- checkout, webhooks, allowance y dual-plan;
- cifrado, OAuth, firma, parsing, CSV, dedupe y retry QBO-R365.

### Playwright

Los specs en `web/e2e/` requieren revision antes de ejecutarse. Algunos flujos legacy dependen de credenciales y fixtures persistentes. No ejecutar `e2e:all` contra produccion ni usar `.env.production.local`.

La guia operativa completa y actualizada es `DOCS/4_Operaciones_y_Guias/GUIA_TESTING_Y_CI.md`.
