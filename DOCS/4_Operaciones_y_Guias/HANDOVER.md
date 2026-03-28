# 🚀 Proyecto SaaS Resto - Estado Actual y Handover (Versión 2.2)

¡Hola! Si sos un nuevo desarrollador o un Asistente de IA (Claude, Gemini, ChatGPT) tomando este proyecto, **LEÉ ESTO PRIMERO**.

## 📍 Estado Actual del Proyecto (Marzo 2026)

Acabamos de finalizar con éxito la **Versión 2.2 (Estabilización, Performance y Consistencia)**.
El sistema es estable, rápido y cuenta con reglas de arquitectura estrictas que **no debes romper**.

### 🛠️ Las 4 Reglas de Oro de nuestra Arquitectura

1. **RPCs y Base de Datos antes que Node.js:**
   - Si una operación involucra múltiples tablas o conteos grandes (ej. contar documentos o insertar jerarquías complejas), **SIEMPRE se usan PostgreSQL RPCs** ejecutados a través de Supabase (`rpc('nombre_funcion')`).
   - *Nunca* iteres grandes arrays en memoria dentro de Node.js/Next.js. La carga pesada la hace la base de datos (Postgres).
2. **Mutaciones Optimiastas y Formularios (Server Actions + `useTransition`):**
   - Todos los modales y tablas que mutan datos usan `startTransition` junto con `router.refresh()` o directamente el hook `useActionState` con Server Actions. Esto garantiza que la UI responda instantáneamente ("Optimistic UI") mientras el backend trabaja.
3. **Consistencia de UI:**
   - Usamos `sonner` para los Toasts de éxito y error. Nada de librerías viejas o custom.
   - Usamos modales estandarizados (como `ConfirmDeleteDialog`) para todas las acciones destructivas.
   - Los "Empty States" (tablas vacías) tienen un componente gráfico dedicado.
4. **Caché Inteligente (Next.js App Router):**
   - Utilizamos `React.cache()` para llamadas repetitivas (como averiguar los módulos habilitados de un Tenant en `getEnabledModules()`) para asegurar un solo viaje a Supabase por cada ciclo de renderizado de la página.

## 📁 Documentos Operativos Clave (Tu GPS)

Si hay problemas técnicos en producción o debés operar el negocio, revisá estos manuales antes de tocar el código:

- `ACTUALIZACION_2.2_SAAS.md`: Contiene el registro detallado de todo lo que se refactorizó en la versión actual. Útil como historial.
- `OPS_RUNBOOK.md`: **Manual de Supervivencia L1/L2**. Qué hacer si Supabase se satura (picos de CPU), cómo leer los logs de Vercel y cómo hacer rollbacks de migraciones SQL sin romper la inmutabilidad de la base de datos.
- `TENANT_OPS_GUIDE.md`: **SOP de Negocios**. Cómo dar de alta (Onboarding) y dar de baja (Offboarding) de manera segura a empresas clientes y sus facturaciones.
- `DOCUMENTACION_TECNICA.md`: Diccionario de Arquitectura Core (Supabase + Next.js Server Components).

## ⏭️ Siguientes Pasos (A dónde ir ahora)

El trabajo de refactorización "técnica" y estabilización ya está al 100%. Las bases son sólidas como una roca.

A partir de acá, tu responsabilidad es continuar con la **Construcción de Nuevas Características (Features) de Negocio**. 
Para saber qué programar a continuación, debés abrir y leer estrictamente el archivo:
👉 **`IMPLEMENTACIONES_FUTURAS.md`**

Ese archivo contiene los nuevos requerimientos (ej. Nuevas pantallas de Onboarding de empleados, tableros de control avanzados, etc.).

---
*Fin del Handover. Buena suerte y a codear limpio.* 💻☕
