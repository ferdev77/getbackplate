# Tipos de transacción de QuickBooks Online — QBO → R365

La API de QBO expone las ventas bajo "Sales transactions". Este documento explica qué tipos
existen, cuáles sincronizamos y por qué.

---

## Tipos disponibles en QBO

### ✅ Invoice (`Invoice`)
Factura de venta emitida a un cliente que se pagará después.
Crea una cuenta por cobrar (Accounts Receivable). Puede estar pagada, parcialmente pagada o pendiente.
**Lo traemos** porque es el documento de venta principal para cuentas corporativas, catering y cualquier
venta a crédito.

### ✅ Sales Receipt (`SalesReceipt`)
Venta con pago inmediato en el punto de venta. No genera cuenta por cobrar — el cliente paga en el acto.
Para un restaurante representa la mayoría de las ventas diarias (POS, caja).
**Lo traemos** porque es el registro de ingreso más frecuente en operaciones de restaurante.
`qboPaymentStatus` se fuerza a `"paid"` ya que no tiene campo `Balance`.

### ✅ Credit Memo (`CreditMemo`)
Nota de crédito emitida a un cliente. Se usa para corregir una factura, aplicar un descuento posterior
o devolver crédito (no efectivo). Genera un monto negativo.
**Lo traemos** porque representa ajustes y correcciones sobre ventas ya registradas.
`transactionTypeCode` se marca como `"2"` (crédito) en el CSV de R365.

### ❌ Estimate (`Estimate`)
Cotización o presupuesto enviado al cliente antes de confirmar la venta. No mueve dinero ni genera
ningún ingreso — es solo una propuesta.
**No lo traemos** porque no representa un ingreso real. Solo se convierte en ingreso si el cliente
lo aprueba y se transforma en Invoice.

### ❌ Payment (`Payment`)
Registro del cobro recibido contra una Invoice existente. No es una transacción de venta nueva —
es el pago de una venta ya registrada.
**No lo traemos** porque duplicaría el ingreso: la Invoice ya está en el sync; traer también el
Payment contabilizaría el mismo monto dos veces en R365.

---

## Tabla resumen

| Tipo QBO     | API table      | ¿Se sincroniza? | Razón                                              |
|--------------|----------------|-----------------|----------------------------------------------------|
| Invoice      | `Invoice`      | ✅ Sí           | Documento de venta principal, puede tener balance  |
| Sales Receipt| `SalesReceipt` | ✅ Sí           | Venta inmediata POS, ingreso del día a día         |
| Credit Memo  | `CreditMemo`   | ✅ Sí           | Ajustes y correcciones sobre ventas                |
| Estimate     | `Estimate`     | ❌ No           | Cotización sin ingreso confirmado                  |
| Payment      | `Payment`      | ❌ No           | Cobro de Invoice ya sincronizada — evita duplicado |

---

## Implementación

Las tres queries se ejecutan en paralelo en `fetchQboSalesTransactions()` (`qbo-client.ts`).
La normalización ocurre en `normalizeQboRows()` (`service.ts`), donde cada tipo recibe
el `transactionTypeCode` y `qboPaymentStatus` correspondiente.
