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

## Tests automáticos — estado actual y pendiente

### Tests unitarios (ya están)
Correr con `npm test`. Cubren lógica pura sin base de datos ni browser.

| Archivo de test | Qué verifica |
|---|---|
| `shared/lib/__tests__/supabase-compat.test.ts` | Detección de errores de columna faltante |
| `shared/lib/__tests__/audience-resolver.test.ts` | Resolución de audiencias por scope |
| `shared/lib/__tests__/plan-limits.test.ts` | Errores de límite de plan y mensajes |
| `shared/lib/__tests__/access.test.ts` | Detección de force_password_change |
| `shared/lib/__tests__/audit.test.ts` | Sanitización de datos sensibles en auditoría |
| `shared/ui/__tests__/company-shell-utils.test.ts` | Cache keys, rutas activas, temas, precios de planes |
| `modules/settings/services/__tests__/org-structure.test.ts` | Generación de slugs (toCode) |
| `modules/checklists/services/__tests__/checklist-template.test.ts` | Normalización de prioridades |
| `modules/documents/lib/__tests__/documents-tree-utils.test.ts` | Formateo de fechas, tamaños, MIME, scopes |
| `modules/employees/ui/__tests__/new-employee-modal-helpers.test.ts` | Formateo de fechas del modal de empleados |

### Tests E2E con Playwright (pendiente implementar)

Los tests E2E abren el browser real y usan la app como un usuario. Ya está instalado Playwright (`npm run e2e:install`).

**Flujos prioritarios para implementar:**

1. **Login / Logout**
   - Login con credenciales válidas → llega al dashboard
   - Login con credenciales inválidas → muestra error
   - Logout → redirige a página pública

2. **Crear empleado**
   - Abrir modal → completar datos básicos → guardar
   - Verificar que aparece en la lista

3. **Enviar aviso (announcement)**
   - Crear aviso con scope de locación
   - Verificar que aparece en el listado

4. **Cambiar configuración de organización**
   - Cambiar nombre → guardar → verificar que persiste

**Cómo agregar un test E2E nuevo:**

```typescript
// web/e2e/login.spec.ts
import { test, expect } from "@playwright/test";

test("login con credenciales válidas", async ({ page }) => {
  await page.goto("/login");
  await page.fill('[name="email"]', process.env.E2E_EMAIL!);
  await page.fill('[name="password"]', process.env.E2E_PASSWORD!);
  await page.click('[type="submit"]');
  await expect(page).toHaveURL(/\/app/);
});
```

**Variables de entorno necesarias** (agregar a `.env.local`):
```
E2E_EMAIL=tu-usuario-de-prueba@example.com
E2E_PASSWORD=la-contraseña
E2E_ORG_ID=el-id-de-la-org-de-prueba
```

**Comandos disponibles:**
```bash
npm run e2e:install          # instalar Playwright (una sola vez)
npx playwright test          # correr todos los E2E
npx playwright test --headed # correr con browser visible
npx playwright show-report   # ver reporte HTML del último run
```
