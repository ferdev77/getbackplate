# QBO → R365: Modo Developer

Este documento describe el comportamiento actual del modo **Developer** en la pantalla de integración.

## Objetivo

Permitir pruebas controladas por etapas sin afectar el flujo operativo automático.

## Flujo actual en Developer

1. Seleccionar una **sync config** (cliente de QBO).
2. Ejecutar `1) Ejecutar sync` para correr esa sincronización específica.
3. Usar `2) Ver preview` para revisar datos mapeados.
4. Usar `3) Enviar a R365` para enviar el run seleccionado.
5. Exportar el run en `RAW`, `JSON`, `CSV` o `TXT`.

Las acciones de preview, envío y exportación se anclan al run ejecutado desde Developer.

## Sandbox QBO (pruebas)

- Toggle activado: usa entorno de pruebas de QuickBooks.
- Toggle desactivado: usa entorno real de QuickBooks.
- Alcance: **por proveedor/organización** (no por cliente individual).
- Auto-detección: si el token de QBO corresponde a un entorno sandbox pero el toggle está en "producción",
  el sistema detecta automáticamente que hay datos solo en sandbox y cambia a ese endpoint.
  La variable `effectiveUseSandbox` (en `service.ts`) captura este estado para que también la
  consulta de ítems (SKU) use el mismo endpoint correcto.

## Creación de sync config en Developer

En modo Developer se permite crear sync config sin FTP completo para validar primero la conexión y extracción desde QBO.

- Si FTP no se completa, la sync se crea igual para pruebas de extracción/preview.
- Si se completa parcialmente (por ejemplo solo host), la API rechaza la creación.

## Envío a R365 con FTP

Al enviar (`3) Enviar a R365`), el sistema resuelve FTP en este orden:

1. FTP propio de la sync config (si existe y está completo).
2. FTP global de la organización.

Si no existe ninguna de las dos configuraciones válidas, el envío falla con mensaje controlado.

---

## Qué controla el fetch de QBO vs qué es post-procesamiento

Esta distinción es importante: cambiar la configuración de una sync no cambia **cómo** se
consulta QBO — solo cambia cómo se procesa y exporta la data que ya llegó.

### Lo que SÍ afecta la consulta a QBO

Estos cuatro parámetros determinan exactamente qué datos trae la API de QuickBooks:

| Parámetro | Campo en BD | Efecto en la query a QBO |
|---|---|---|
| **Cliente QBO** | `qbo_r365_sync_configs.qbo_customer_id` | Agrega `WHERE CustomerRef = 'X'` — filtra facturas por cliente |
| **Lookback** | `qbo_r365_sync_configs.lookback_hours` | Agrega `WHERE MetaData.LastUpdatedTime >= 'X'` — ventana de tiempo |
| **Sandbox** | `integration_connections.config.useSandbox` | Cambia el endpoint base (`sandbox-quickbooks.api.intuit.com` vs `quickbooks.api.intuit.com`) |
| **RealmId** | `integration_connections.config.realmId` | Identifica la empresa en QBO (se obtiene en el OAuth callback) |

> Si `lookback_hours = 0` o se ejecuta con `ignoreLookback = true`, se traen **todas** las
> transacciones del cliente sin filtro de fecha (full sync).

### Lo que NO afecta la consulta a QBO (solo post-procesamiento)

**Template** (`by_item` / `by_item_service_dates` / `by_account` / `by_account_service_dates`):

Solo cambia dos cosas, ambas **después** de que los datos ya llegaron de QBO:

1. Qué campo de QBO se usa como `targetCode` por línea — ver `normalizeQboRows()` en `service.ts`:
   - `by_item` / `by_item_service_dates` → `SalesItemLineDetail.ItemRef.value` (ID del ítem)
   - `by_account` / `by_account_service_dates` → `AccountBasedExpenseLineDetail.AccountRef.value` (cuenta contable)

2. El formato y columnas del CSV que se envía a R365 (ver `buildR365Csv()` en `r365-csv.ts`).

**Tax Mode** (`line` / `header` / `none`):

Solo cambia cómo se calcula el `taxAmount` de cada línea — ver `normalizeQboRows()` en `service.ts`:

| Valor | Comportamiento |
|---|---|
| `none` | `taxAmount = 0` en todas las líneas |
| `line` | Usa el campo `TaxAmount` explícito de cada línea; si no existe, distribuye el total de impuesto de la factura proporcionalmente |
| `header` | Siempre distribuye `TxnTaxDetail.TotalTax` proporcionalmente entre las líneas según su `Amount` |

**Conclusión:** podés cambiar template o tax mode y hacer un nuevo sync — las facturas
que llegan de QBO son exactamente las mismas. Solo varía cómo se estructuran en el
CSV que va a R365 y cómo se asignan los impuestos por línea.

---

## Cambios funcionales recientes

### SKU real desde QBO (mayo 2026)

El sistema hace una consulta adicional a QBO al momento del sync para traer los SKUs de los ítems:

```
select * from Item
```

> **Importante:** QBO no soporta `select Id, Sku from Item` (proyección de campos — falla silenciosamente
> devolviendo lista vacía). Se debe usar `select *` y filtrar en código.

El resultado es un `Map<string, string>` de `ItemId → Sku` que se cruza con cada línea de factura
usando `SalesItemLineDetail.ItemRef.value`.

- Si el ítem no tiene SKU en QBO, el campo queda vacío (no es error).
- Los ítems sin SKU en QBO son normales (p.ej. ítems genéricos de cargos).
- El SKU se persiste en `integration_run_items.payload` como campo `sku`.

#### Archivos involucrados

| Archivo | Qué hace |
|---|---|
| `qbo-client.ts` → `fetchQboItemSkus()` | Consulta paginada de ítems, devuelve Map |
| `service.ts` → `runQboR365Sync()` | Llama a `fetchQboItemSkus` con `effectiveUseSandbox` |
| `service.ts` → `normalizeQboRows()` | Recibe `itemSkuMap` y asigna `sku` a cada línea |
| `service.ts` → `getInvoiceDetail()` | Expone `sku` y `sourceItemCode` en las líneas |

### Nombres de ítems sin prefijo de categoría (mayo 2026)

QBO devuelve nombres de ítems en formato jerárquico: `Categoría:Nombre del ítem`.  
En el panel, PDF y CSV se muestra solo el nombre sin la categoría:

```typescript
itemName.split(":").pop()!.trim()
// "Disposables:Cup Clear Pet 32 oz." → "Cup Clear Pet 32 oz."
```

### Columna "ID QBO" (antes "Cód. R365") (mayo 2026)

La columna que antes se llamaba "Cód. R365" en el panel y exports fue renombrada a **"ID QBO"**.

**Por qué:** La tabla `integration_mappings` (que asigna equivalencias QBO ↔ R365) está vacía para
los tenants actuales. Lo que se mostraba era `SalesItemLineDetail.ItemRef.value`, que es el ID interno
del ítem en QBO — no un código R365. Renombrar evita confusión a operadores y futuros devs.

Ver [`QBO_DISCARDED_FIELDS.md`](./QBO_DISCARDED_FIELDS.md) para documentación de qué campos de QBO
se leen pero no se persisten.

### Etiqueta de moneda (mayo 2026)

En todos los lugares donde se muestra la moneda (panel de detalle, PDF, CSV) se usa el helper
`formatCurrencyLabel()` existente, que convierte el nombre largo devuelto por QBO al código ISO:

```
"United States Dollar" → "USD"
"Mexican Peso"         → "MXN"
```

### Rediseño del PDF de factura (mayo 2026)

El PDF de detalle de factura fue rediseñado para que sea más fiel al documento original de QBO:

1. **Encabezado dinámico:** El campo "Vencimiento" se posiciona debajo de "Términos" si este existe,
   evitando superposición. Se usa una variable `rightY` que se incrementa secuencialmente.

2. **Etiqueta "Bill To"** (antes "Proveedor"): El bloque de destinatario usa la etiqueta estándar
   en inglés para coincidir con facturas QBO reales.

3. **Totales dibujados manualmente:** jspdf-autotable v5 no renderiza la opción `foot` de forma
   confiable. Los totales (Subtotal, Impuesto, TOTAL) se dibujan con `doc.text()` posicionados en
   `lastAutoTable.finalY + 10`, fuera de la tabla.

4. **Columna SKU** en la tabla del PDF, alineada con el panel de detalle.

### Corrección de deduplicación en `getInvoiceDetail` (mayo 2026)

Al re-sincronizar facturas, el sistema marca líneas duplicadas con `reason: "line_duplicate"` y
payload mínimo. El código anterior tomaba siempre la fila más reciente, que podía ser la
marcada como duplicada (payload vacío), dejando el SKU y otros campos en blanco.

**Fix:** `getInvoiceDetail` ahora hace dos pasadas:
1. Primera pasada: recolecta datos de header (número de factura, vendor, etc.) de **todas las filas**.
2. Segunda pasada: agrupa por `lineId`, y para cada línea prefiere la fila con payload completo
   (la que tiene `targetCode` real) sobre la marcada como duplicada.

---

## Datos de QBO que se leen pero no se guardan

Ver [`QBO_DISCARDED_FIELDS.md`](./QBO_DISCARDED_FIELDS.md) — documento dedicado que lista
todos los campos que la API de QBO devuelve y que el sistema descarta (no persiste en BD).

---

## Mejoras sugeridas para Developer

### Alta prioridad

1. **Botón "Limpiar runs de prueba"**  
   Actualmente los runs generados en Developer se mezclan con los runs reales en la tabla
   `integration_runs`. En modo Developer deberían poder borrarse o marcarse como `test: true`
   para filtrarlos del historial operativo.

2. **Diff visual entre runs**  
   Al re-sincronizar, mostrar qué facturas/líneas cambiaron respecto al run anterior.
   Hoy solo se ve el run actual sin contexto histórico.

3. **Log de SKU mapping en preview**  
   En el preview, indicar cuántos ítems tenían SKU en QBO vs. cuántos quedaron vacíos.
   Ayuda a detectar rápido si `fetchQboItemSkus` retornó vacío (p.ej. por sandbox incorrecto).

### Media prioridad

4. **Test de conexión FTP antes de sync**  
   Antes de ejecutar el sync completo, un botón que solo pruebe si las credenciales FTP conectan.
   Hoy el error de FTP aparece recién al hacer "Enviar a R365", no al ejecutar el sync.

5. **Indicador visual de sandbox auto-detectado**  
   Cuando `effectiveUseSandbox` difiere del toggle manual, mostrar un badge o aviso
   "Usando sandbox (auto-detectado)". Actualmente el usuario no sabe que ocurrió el fallback.

6. **Filtro de facturas por estado en preview**  
   En el preview del run, poder filtrar por `paid / partial / unpaid` para verificar
   el cálculo de estado de pago sin tener que revisar todas las facturas.

### Baja prioridad / futuro

7. **Exportar SKU mapping como CSV separado**  
   Un export que muestre solo la tabla `ItemId → SKU → Nombre` para que el equipo
   de R365 pueda verificar que los SKUs corresponden a los ítems correctos en su sistema.

8. **Replay de run con payload guardado**  
   Poder tomar un run histórico y "re-enviar" su CSV a R365 sin re-consultar QBO.
   Útil cuando QBO tiene downtime pero los datos ya están en BD.

9. **Alertas por campo vacío crítico**  
   Si un `%` alto de líneas tiene `sku = ""` o `itemName = ""`, mostrar advertencia en
   el preview antes de enviar a R365.
