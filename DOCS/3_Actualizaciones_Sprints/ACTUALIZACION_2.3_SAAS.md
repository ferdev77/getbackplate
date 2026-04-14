# ACTUALIZACION 2.3 SAAS - Migración SDK Oficial Anthropic en Asistente IA

---
**DOC_ID:** ACTUALIZACION_2.3_SAAS  
**DOC_LEVEL:** Sprint Update  
**PHASE_NAMESPACE:** TECH_REMEDIATION_TRACK  
**SOURCE_OF_TRUTH_FOR:** Integración Anthropic / Asistente IA

---

> **Tipo de cambio:** Refactorización técnica interna ("under the hood").  
> Sin impacto visible en la interfaz ni en la lógica de negocio.  
> Compatible 100% con el resto del stack existente.

---

## 📋 Contexto del cambio

El Asistente IA de GetBackplate (`/api/company/ai/chat`) utilizaba hasta esta versión una implementación manual mediante `fetch` para comunicarse con la API de Anthropic (Claude). Si bien funcionaba, ese enfoque carecía de manejo tipado de errores, de reintentos automáticos y de compatibilidad futura con funcionalidades avanzadas como streaming.

Este sprint documenta la migración al **SDK oficial de Anthropic** (`@anthropic-ai/sdk`), instalado como dependencia de producción.

---

## ✅ Cambios realizados

### 1. Nueva dependencia: `@anthropic-ai/sdk`

**Archivo:** `web/package.json`

Se instaló el SDK oficial como dependencia de producción:

```bash
npm install @anthropic-ai/sdk
```

Este paquete es el cliente oficial mantenido por Anthropic, compatible con TypeScript y con el runtime de Node.js de Next.js.

---

### 2. Refactorización de `callAnthropic()` — `web/src/app/api/company/ai/chat/route.ts`

**Antes (fetch manual):**
```typescript
// Se gestionaban cabeceras HTTP manualmente
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({ model, max_tokens: 700, ... }),
});

// Parseo manual del JSON sin tipos
if (!response.ok) return null;
const data = (await response.json()) as { ... };
const content = data.content?.find(...)?.text?.trim();
```

**Después (SDK oficial):**
```typescript
const client = new Anthropic({ apiKey });

const response = await client.messages.create({
  model,
  max_tokens: 700,
  temperature: 0.2,
  system: systemPrompt,
  messages,
});

// Respuesta completamente tipada por el SDK
const textBlock = response.content.find((block) => block.type === "text");
const content = textBlock?.text?.trim();
```

---

### 3. Manejo de errores mejorado

**Antes:** Un `if (!response.ok) return null` simple, sin diferenciar el tipo de fallo.

**Después:** El SDK lanza excepciones específicas y tipadas según el tipo de error:
- `Anthropic.APIError` — Error genérico de API
- `Anthropic.AuthenticationError` — API Key inválida
- `Anthropic.RateLimitError` — Límite de uso superado
- `Anthropic.NotFoundError` — Modelo no encontrado

Todos son capturados en un bloque `try/catch` que retorna `null`, accionando el fallback a OpenRouter sin interrumpir el flujo del usuario.

---

## 🏗 Arquitectura del flujo de IA (sin cambios funcionales)

La cascada de fallback del asistente sigue siendo la misma tras este cambio:

```
Pregunta del usuario
       ↓
[Rate Limit Check] ─── excedido ──→ 429
       ↓
[Sensitive Filter] ─── bloqueado ──→ respuesta de seguridad
       ↓
[FAQ Cache] ─────────── hit ───────→ respuesta cacheada ✅
       ↓ miss
[Collect Facts from Supabase]
       ↓
[callAnthropic() via SDK] ──── ok ──→ mode: "pro_ai" ✅
       ↓ fallo/null
[callOpenRouter() via fetch] ── ok ──→ mode: "basic_ai" ✅
       ↓ fallo/null
[answerWithRules() — sin IA] ────────→ mode: "basic" ✅
       ↓
[Audit Log + Session Memory + Cache]
       ↓
Respuesta al cliente
```

---

## 🤖 Modelo activo

| Variable de entorno   | Valor configurado       |
|----------------------|------------------------|
| `ANTHROPIC_API_KEY`  | Clave secreta de Anthropic (`.env.local`) |
| `ANTHROPIC_MODEL`    | `claude-sonnet-4-6`    |

El alias `claude-sonnet-4-6` es el nombre oficial y estable en la API de Anthropic para Claude Sonnet 4.6. La respuesta real del servidor incluye el campo `response.model` con el identificador completo (ej: `claude-sonnet-4-6-20260217`), que es el que queda registrado en el log de auditoría.

---

## 📦 Verificación

- ✅ `npx tsc --noEmit` completó sin errores de tipos
- ✅ Test manual con `node --env-file=.env.local scripts/test-anthropic.mjs` retornó conexión exitosa confirmando model `claude-sonnet-4-6`
- ✅ Sin cambios en la UI ni en los contratos de la API pública del endpoint (`/api/company/ai/chat`)
- ✅ Sin cambios en la lógica de negocio, caché, sesión o auditoría

---

*Cualquier funcionalidad nueva del Asistente IA (ej: streaming, thinking adaptativo, contexto extendido) debe ser documentada en una futura actualización independiente.*
