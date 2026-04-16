# 🚨 Technical Runbook L1/L2 (SaaS Resto)

Este documento contiene los protocolos operativos estandarizados (SOPs) para la gestión de crisis, mitigación de caídas y diagnóstico de problemas técnicos en producción. 

## Nivel 1 (L1) - Monitoreo y Resolución Básica

### 1. Lectura de Logs en Vercel (Frontend/API)
**Síntoma:** Los usuarios reportan Pantallas Blancas, Errores 500, o timeouts.
**Acción:**
1. Ingresar al panel de Vercel del proyecto `saasresto`.
2. Navegar a la pestaña **Logs**.
3. Filtrar por nivel `Error`.
4. Buscar en la traza palabras clave relacionadas con Supabase (`PGRST`, `relation does not exist`, `timeout`).
   - *Si el error es de Supabase*, pasar al procedimiento L2 (Base de Datos).
   - *Si el error es "Function execution took too long"*, el Server Action o Route Handler superó el límite sin servidor (Serverless function timeout). Puede ser un cuello de botella solucionable en futuras optimizaciones L3.

### 2. Monitoreo de Uso de CPU y Memoria (Vercel)
Vercel no requiere escalar explícitamente el CPU, pero si detectas latencias altas en el P99 de la pestaña **Analytics**:
- Revisa llamadas bloqueantes en los Server Components.
- Confirma que la base de datos de Supabase no sea el verdadero cuello de botella.

---

## Nivel 2 (L2) - Resolución de Crisis de Base de Datos (Supabase)

### 1. Caída o Saturación de Base de Datos
**Síntoma:** Todo el sitio carga extremadamente lento o falla con errores `PGRST301` o `Failed to fetch`.
**Acción Inmediata:**
1. Ingresar al Dashboard de Supabase.
2. Navegar a **Database > Metrics**.
3. Revisar **Max CPU utilization** y **Memory usage**.
   - *Si el CPU está al 100%*: Hay un bloqueo de tabla (Lock) o una consulta muy pesada sin índice.
   - *Si hay picos de conexiones (Max active connections)*: El pool de conexiones se agotó. Asegúrate de que las variables de entorno en Vercel usan los enrutadores IPv4 de Pooler de Supabase (`aws-0-...pooler.supabase.com:5432`).

**Mitigación de Picos (Scaling):**
- Si el proyecto está en el plan gratuito/Pro y la memoria (ej. 1GB/8GB) se agotó repetidamente, temporalmente habilitar *Compute Add-ons* en la configuración del proyecto (Project Settings > Compute).
- Esto reiniciará la base de datos y proveerá más memoria (toma ~3 minutos).

### 2. Rollbacks de Migraciones
**Síntoma:** Una migración reciente rompió la lógica de RLS (Row Level Security) o esquemas, y los usuarios no pueden ingresar o hacer CRUD.
**Acción:**
1. Ubica el número de la última migración subida que funcionaba bien (ej. `20260325...`).
2. Nunca intentes "arreglar a mano" RLS en producción mediante el SQL Editor (rompe la Inmutabilidad de la DB).
3. **Rollback Local hacia Remoto:**
   ```bash
   # Restaura localmente si hace falta
   npx supabase db reset --local
   
   # Crea una nueva migración de "reversión"
   npx supabase migration new revert_broken_changes
   ```
4. En el archivo generado (`supabase/migrations/xxxx_revert_broken_changes.sql`), escribe el código inverso (`DROP TABLE`, `DROP FUNCTION`, `UNDO RLS`).
5. Aplica a producción:
   ```bash
    npx supabase db push --linked
    ```

### 3. Validacion operativa rapida de flujos core (Anuncios/Documentos/Checklists)
**Uso recomendado antes y despues de cambios sensibles en DB o endpoints:**

Desde `web/`:

```bash
npm run verify:flow:local
npm run verify:flow:prod:cleanup
```

Guia canónica:
- `DOCS/4_Operaciones_y_Guias/GUIA_VALIDACION_FLUJOS_LOCAL_PROD.md`

Reporte de referencia:
- `DOCS/4_Operaciones_y_Guias/REPORTE_VALIDACION_FLUJOS_LOCAL_PROD_2026-04-16.md`

### 4. Fuga de Datos o Modificación Errónea (Corrupción)
**Síntoma:** Datos críticos se borraron o alteraron por accidente.
**Acción:**
Supabase (plan Pro+) genera respaldos (Point in Time Recovery - PITR).
1. Navega a **Database > Backups** en Supabase.
2. Encuentra la instantánea más reciente *antes* del incidente.
3. Restaurar la base de datos (Nota: esto causará *downtime* temporal).

---

## Nivel 3 (L3) - Tareas Programadas (Crons) e Infraestructura

### 1. Límites de Vercel (Plan Hobby) y Arquitectura de Crons
**Contexto:** El plan gratuito de Vercel tiene límites estrictos para tareas programadas (Cron Jobs) definidos en `vercel.json`:
- **Máximo 2 cron jobs por proyecto.**
- **Frecuencia máxima:** 1 vez al día (no permite tareas por hora ni por minuto).

Si se excede alguno de estos límites, **Vercel rechaza el deployment instantáneamente** sin mostrar error en el dashboard (solo aparece una cruz roja en GitHub).

**Estrategia actual de bypass:**
1. **Consolidación Interna:** Los procesos de purga de papelera y reportes documentales se agruparon en un único "Master Cron" que corre 1 vez al día a la madrugada (08:00 UTC / 4:00 AM ET) llamando al endpoint `/api/internal/cron/daily`.
2. **Procesamiento de Alta Frecuencia (Mails / WhatsApp):** Como enviar notificaciones 1 vez al día es inaceptable a nivel UX, la plataforma delega el desencadenante de alta frecuencia a un servicio externo gratuito: **cron-job.org**.

### 2. Mantenimiento del Reloj Externo (cron-job.org)
**Síntoma:** Los empleados y admins no reciben correos o llegan con horas de demora, y los anuncios se quedan atascados en la cola de envío.
**Acción:**
1. Ingresar a la cuenta de [cron-job.org](https://cron-job.org/).
2. Verificar el estado del Job apuntado a `https://getbackplate.vercel.app/api/internal/cron/deliveries`.
3. Asegurarse de que el Job tiene configurado el header HTTP de seguridad:
   - `Authorization`: `Bearer TU_CRON_SECRET`
4. Si la URL del sistema cambia de dominio, **debe actualizarse** obligatoriamente en cron-job.org para restaurar el flujo de correos.

---

## 📅 Contactos de Emergencia (Plataformas)

- **Supabase Support Dashboard:** Enviar ticket clasificado como `Urgent` o `Database Unresponsive`.
- **Vercel Support:** Crear solicitud para fallas 502 Bad Gateway originadas en Edge Network.
- **Stripe Dashboard:** (Si hay cobros duplicados).

*Este documento bebe de la arquitectura de `ACTUALIZACION_2.2_SAAS.md` y asume un esquema estrictamente transaccional manejado vía RPCs.*
