# REPORTE PARA CLIENTE
# Estado actual - Integracion QuickBooks -> Restaurant365

Fecha: 2026-05-21
Proyecto: Modulo de integracion QuickBooks (QBO) con Restaurant365 (R365)
Estado general: Implementado y operativo en produccion

---

## 1) Resumen en palabras simples

La integracion ya esta funcionando de forma automatica y completa:

- la cuenta de QuickBooks esta conectada via OAuth;
- las facturas llegan solas al sistema via webhook en tiempo casi real (QuickBooks avisa cada vez que una factura se envia al cliente, evento `Emailed`);
- al llegar el webhook, el sistema las procesa de forma inmediata por dos rutas paralelas; si alguna ruta falla, el cron de recovery las atiende como red de seguridad;
- el sistema las almacena en un historial unificado y las envia a Restaurant365 por FTP automaticamente;
- si una factura no llega sola, se puede buscar manualmente por numero de documento;
- cualquier factura del historial se puede enviar a R365 con un click desde el dashboard;
- el historial unificado muestra el estado de cada factura en tiempo real.

En resumen: la integracion esta en produccion y operando en modo automatico, con procesamiento en tiempo casi real y multiples redes de seguridad.

---

## 2) Lo que ya esta hecho (checklist)

### A. Conexion y seguridad

- [x] Conexion OAuth con QuickBooks implementada y activa.
- [x] Estado visual de conexion en pantalla.
- [x] Manejo de reconexion cuando QuickBooks lo requiere.
- [x] Credenciales guardadas de forma segura (cifradas con AES-256).
- [x] Configuracion por organizacion: una sync config activa por organizacion (segunda alta devuelve `409`).

### B. Captura automatica de facturas (webhooks)

- [x] Recepcion de notificaciones push de QuickBooks (solo evento `Emailed` — facturas enviadas al cliente).
- [x] Procesamiento inmediato en tiempo casi real: doble ruta (procesamiento background + invocacion independiente del cron de recovery).
- [x] Cron de recovery diario como ultima red de seguridad para facturas que no avanzaron.
- [x] Almacenamiento inmediato en historial unificado con estado en tiempo real.
- [x] Soporte de Invoices y Credit Memos (CreditMemos con montos negativos segun estandar R365).

### C. Historial unificado de facturas

- [x] Vista unificada de todas las facturas, sin importar como llegaron.
- [x] Estado del pipeline por factura: en cola → capturada → mapeada → enviada.
- [x] Origen de cada factura visible: webhook / manual / sync.
- [x] Deduplicacion automatica: no se crean filas duplicadas.

### D. Transformacion de datos para R365

- [x] Flujo `By Item` implementado.
- [x] Flujo `By Account` implementado.
- [x] Flujo `By Item with Service Dates` implementado.
- [x] Flujo `By Account with Service Dates` implementado.
- [x] Mapping en tiempo real desde el dato crudo almacenado (raw_entity).

### E. Envio a R365

- [x] Envio automatico por pipeline diario.
- [x] Envio individual de cualquier factura desde el dashboard (un click).
- [x] Upload FTP con nombre de archivo segun estandar R365.
- [x] Confirmacion de envio con nombre de archivo y run_id.

### F. Importacion historica (backfill)

- [x] Backfill por fecha de factura (TxnDate) al crear la configuracion.
- [x] Corre en segundo plano sin bloquear la operacion.
- [x] Facturas historicas visibles en historial con estado correcto.

### G. Busqueda manual por numero de documento

- [x] Busqueda de Invoice o Credit Memo por DocNumber de QBO.
- [x] La factura se almacena con `import_source='manual'` y queda lista para enviar.
- [x] Si ya existia, actualiza el dato almacenado sin duplicar.

### H. Visibilidad y control

- [x] Historial unificado con paginacion.
- [x] Estado de pipeline en tiempo real (Supabase Realtime).
- [x] Historial de corridas con contadores.
- [x] Notificaciones en dashboard (exito / error / enviando).

### I. Documentacion del repositorio

- [x] Guia operativa actualizada a arquitectura actual (v6).
- [x] Especificacion tecnica actualizada con modelo de datos actual (v5).
- [x] Guia de developer webhooks actualizada a doble ruta y eventos (v3).
- [x] Guia de onboarding por rol actualizada (v3).
- [x] Este reporte actualizado.

---

## 3) Lo que falta para operacion optima (checklist)

### A. Parte que puede requerir ajustes de codigo

- [ ] Ajustar reglas de mapeo si aparecen casos `UNMAPPED_*` con datos reales del cliente.
  - Como lo vamos a hacer: tomar los DocNumbers afectados, revisar el ItemRef o AccountRef en QBO y agregar la regla de mapeo correspondiente.
  - Que se necesita: ejemplos de facturas que hoy quedan sin mapear.

- [ ] Ajustar reglas de impuestos si el cliente decide cambiar de `taxMode`.
  - Como lo vamos a hacer: cambiar `taxMode` en sync config y re-enviar facturas afectadas.
  - Que se necesita: definicion contable del criterio de impuesto.

### B. Parte fuera de desarrollo de codigo

- [ ] Confirmar y aprobar mapeo final con el cliente (campo por campo).
  - Como lo vamos a hacer: reunion funcional con una muestra de facturas reales.
  - Que se necesita: usuario funcional/contable del cliente y ejemplos reales.

- [ ] Ejecutar prueba final en FTP del cliente y validar `Processed` / `ErrorLog`.
  - Como lo vamos a hacer: enviar un lote controlado y revisar resultado en carpetas R365.
  - Que se necesita: acceso FTP del cliente y permiso operativo.

- [ ] Definir responsable de monitoreo diario (titular y backup).
  - Que se necesita: nombre del titular, nombre del backup, horario de revision.

- [ ] Cargar credenciales productivas definitivas (QBO + FTP) si no estan cargadas.
  - Que se necesita: credenciales finales + persona autorizada.

- [ ] Cerrar aprobaciones formales del cliente (UAT + OK funcional + OK operativo).
  - Que se necesita: reunion de cierre + evidencia de aprobacion por escrito.

---

## 4) Riesgos abiertos (explicados simple)

- Si una factura no tiene codigo de item/cuenta reconocible, puede quedar como "sin mapear" hasta ajustar la regla.
- Si cambian las reglas de importacion de R365, hay que ajustar el formato CSV.
- Si se vencen credenciales OAuth o FTP, la integracion se frena hasta reconectar.
- Si QBO no envia el webhook (fallo de red en su lado), la factura no llega sola — se puede recuperar manualmente por DocNumber (busqueda en el dashboard).
- Si R365 importa los archivos correctamente, los elimina del FTP — es comportamiento esperado, no indica un error.

---

## 5) Beneficio actual para el cliente

Con lo implementado y activo hoy, el cliente tiene:

- automatizacion completa del flujo de facturas QBO → R365 en tiempo casi real (segundos desde que la factura se envia al cliente en QuickBooks);
- visibilidad en tiempo real del estado de cada factura;
- capacidad de recuperar cualquier factura manualmente por numero de documento;
- historial unificado sin importar como llego la factura;
- deduplicacion automatica que evita importaciones dobles;
- backfill historico para importar facturas anteriores a la fecha de implementacion.

---

## 6) Recomendacion de siguiente etapa

Plan para cierre definitivo:

1. Cerrar mapeo final con el cliente (sesion funcional corta con facturas reales).
2. Ejecutar prueba end-to-end en FTP del cliente con datos reales.
3. Ajustar detalles que aparezcan en ErrorLog.
4. Definir responsable de monitoreo diario.
5. Cerrar UAT y aprobaciones formales.

---

## 7) Estado de avance

- Avance tecnico: 100%
- Avance funcional con cliente: 80% (pendiente validacion con datos reales)
- Avance para cierre formal: 85% (pendiente UAT y aprobaciones)
