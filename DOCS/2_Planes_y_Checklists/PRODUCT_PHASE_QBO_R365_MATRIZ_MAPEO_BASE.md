# DOC_ID: PRODUCT_PHASE_QBO_R365_MAPPING_MATRIX_BASE_V2
# DOC_LEVEL: MATRIZ_FUNCIONAL
# PHASE_NAMESPACE: PRODUCT_PHASE
# SOURCE_OF_TRUTH_FOR: matriz de mapeo QBO -> R365 Multi-Invoice (4 templates)

# Matriz de Mapeo

## 1) Reglas globales

- entrada origen: QuickBooks Online (`Bill`, `VendorCredit`);
- salida: CSV R365 Multi-Invoice;
- dedupe por linea + dedupe por factura enviada;
- no reenviar `source_invoice_id` con estado previo `uploaded/validated`;
- `Transaction Type`: `1` invoice, `2` credit memo.

## 2) Mapeo normalizado interno (QBO -> linea canonica)

| Campo canonico | Origen QBO | Regla |
|---|---|---|
| `sourceInvoiceId` | `Bill.Id` / `VendorCredit.Id` | obligatorio |
| `sourceLineId` | `Line.Id` | fallback: indice de linea |
| `transactionTypeCode` | tipo entidad (`Bill`/`VendorCredit`) | `Bill=1`, `VendorCredit=2` |
| `vendor` | `VendorRef.name`/`VendorRef.value` | fallback `UNKNOWN_VENDOR` |
| `invoiceNumber` | `DocNumber` | fallback `QBO-<InvoiceId>` |
| `invoiceDate` | `TxnDate` | fallback fecha actual |
| `dueDate` | `DueDate` | fallback `invoiceDate` |
| `currency` | `CurrencyRef.name`/`CurrencyRef.value` | opcional |
| `targetCode` | depende template | item/account segun template |
| `description` | `Line.Description` | opcional |
| `quantity` | `ItemBasedExpenseLineDetail.Qty` | fallback 1 |
| `unitPrice` | `ItemBasedExpenseLineDetail.UnitPrice` | fallback `lineAmount/qty` |
| `lineAmount` | `Line.Amount` | numerico |
| `taxAmount` | `Line.TaxAmount` o prorrateo header | segun `taxMode` |
| `totalAmount` | linea + tax | numerico |
| `location` | mapping tenant o vacio | opcional |
| `memo` | `PrivateNote` | opcional |
| `serviceStartDate` | no disponible por defecto | vacio (a completar por mapping) |
| `serviceEndDate` | no disponible por defecto | vacio (a completar por mapping) |

## 3) Headers oficiales por template (R365)

### 3.1 by_item

`Vendor,Location,Document Number,Date,Gl Date,Vendor Item Number,Vendor Item Name,UofM,Qty,Unit Price,Total,Break Flag`

### 3.2 by_item_service_dates

`Vendor,Location,Document Number,Date,Gl Date,Vendor Item Number,Vendor Item Name,UofM,Qty,Unit Price,Total,Break Flag,Start Date of Service,End Date of Service`

### 3.3 by_account

`Type,Location,Vendor,Number,Date,Gl Date,Amount,Payment Terms,Due Date,Comment,Detail Account,Detail Amount,Detail Location,Detail Comment`

### 3.4 by_account_service_dates

`Type,Location,Vendor,Number,Date,Gl Date,Amount,Payment Terms,Due Date,Comment,Detail Account,Detail Amount,Detail Location,Detail Comment,Start Date of Service,End Date of Service`

## 4) Reglas de `targetCode`

| Template | Origen `targetCode` | Fallback |
|---|---|---|
| `by_item` | `ItemBasedExpenseLineDetail.ItemRef.value` (o `name`) | `UNMAPPED_ITEM` |
| `by_item_service_dates` | igual `by_item` | `UNMAPPED_ITEM` |
| `by_account` | `AccountBasedExpenseLineDetail.AccountRef.value` (o `name`) | `UNMAPPED_ACCOUNT` |
| `by_account_service_dates` | igual `by_account` | `UNMAPPED_ACCOUNT` |

## 5) Validaciones minimas

- encabezados deben coincidir exactos con template elegido;
- columnas de cabecera de transaccion deben ser consistentes por cada linea de la misma factura;
- `targetCode` obligatorio para envio real;
- `lineAmount` y `totalAmount` numericos;
- `invoiceNumber` no vacio.

## 6) Accion ante falla

- `UNMAPPED_ITEM`/`UNMAPPED_ACCOUNT`: corregir template o mapping y reintentar;
- error de formato CSV: revisar encabezados y orden;
- duplicado por factura enviada: mantener `skipped_duplicate`, no reenviar salvo politica manual futura.

## 7) Estado de aprobacion

- Aprobacion funcional cliente: `[x] encabezados oficiales recibidos`
- Aprobacion tecnica integracion: `[x] implementado en modulo`
- Aprobacion operativa: `[ ] pendiente validacion final en FTP/ErrorLog del cliente`

## Control de cambios

- v1: matriz base con campos pendientes.
- v2: matriz cerrada con headers oficiales de 4 templates y reglas activas de dedupe.
