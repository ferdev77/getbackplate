# Campos de QBO que se leen pero no se guardan

Este documento registra todos los campos que la API de QuickBooks Online devuelve y que el sistema
**lee pero descarta** — no se persisten en `integration_run_items.payload` ni en ninguna otra tabla.

El objetivo es tener claridad sobre qué información está disponible en QBO para una eventual expansión,
y evitar que futuros desarrolladores asuman que ciertos datos no existen en origen.

---

## Nivel de factura (Invoice / SalesReceipt / CreditMemo)

| Campo QBO | Descripción | Por qué se descarta |
|---|---|---|
| `ShipAddr` | Dirección de envío completa (Line1, City, State, PostalCode, Country) | No requerido por R365 |
| `BillAddr` | Dirección de facturación completa | No requerido por R365 |
| `ShipDate` | Fecha de despacho | No requerido por R365 |
| `ShipMethodRef` | Método de envío | No requerido por R365 |
| `ShipFromAddr` | Dirección de origen del envío | No requerido por R365 |
| `TrackingNum` | Número de seguimiento del envío | No requerido por R365 |
| `CustomerMemo.value` | Mensaje visible para el cliente en la factura impresa | Se guarda `PrivateNote` como memo interno, no este |
| `LinkedTxn` | Transacciones vinculadas (pagos aplicados, órdenes de compra, etc.) | Información de pagos fuera del scope actual |
| `GlobalTaxCalculation` | Método de cálculo de impuestos (TaxExcluded / TaxInclusive / NotApplicable) | Se usa indirectamente vía `taxMode` de la sync config |
| `ApplyTaxAfterDiscount` | Si el impuesto se aplica después del descuento | No requerido actualmente |
| `TaxExemptionRef` | Referencia de exención impositiva | No requerido por R365 |
| `ClassRef` | Clase contable (si el negocio usa clases en QBO) | No requerido por R365 |
| `DepartmentRef` | Departamento contable | No requerido por R365 |
| `ProjectRef` | Proyecto asociado a la transacción | No requerido por R365 |
| `EmailStatus` | Si la factura fue enviada por email | Metadato operativo de QBO, sin uso en R365 |
| `PrintStatus` | Si la factura fue impresa | Metadato operativo de QBO, sin uso en R365 |
| `ExchangeRate` | Tipo de cambio para transacciones multi-moneda | Solo se guarda la moneda (`CurrencyRef`), no el tipo de cambio |
| `HomeBalance` | Balance en moneda local del negocio | No requerido por R365 |
| `HomeTotalAmt` | Total en moneda local del negocio | No requerido por R365 |
| `RecurDataRef` | Referencia a configuración de transacción recurrente | Metadato de QBO, sin uso en R365 |
| `AllowIPNPayment` / `AllowOnlinePayment` | Opciones de pago online | Metadatos de QBO |
| `DeliveryInfo` | Información de entrega | No requerido por R365 |
| `AccountRef` | Cuenta contable a nivel de factura (header) | Se usa la cuenta a nivel de línea |

### Campos de factura que SÍ se guardan (referencia)

| Campo QBO | Se guarda como | Tabla/campo |
|---|---|---|
| `Id` | `source_invoice_id` | `integration_run_items` |
| `DocNumber` | `invoiceNumber` | payload |
| `TxnDate` | `invoiceDate` | payload |
| `DueDate` | `dueDate` | payload |
| `CustomerRef.name` | `vendor` | payload |
| `PONumber` | `poNumber` | payload |
| `SalesTermRef.name` | `terms` | payload |
| `PrivateNote` | `memo` | payload |
| `Balance` | `qboBalance` | payload |
| `CurrencyRef.name` | `currency` | payload |
| `TxnTaxDetail.TotalTax` | usado para cálculo de `taxAmount` | payload (por línea) |
| `TotalAmt` | usado para cálculo de estado de pago | payload (referencia) |

---

## Nivel de línea (Line items)

| Campo QBO | Descripción | Por qué se descarta |
|---|---|---|
| `Line[].LineNum` | Número de orden de la línea en la factura | Se usa `Line[].Id` como identificador de línea |
| `Line[].SalesItemLineDetail.ServiceDate` | Fecha de servicio específica de esa línea | Solo se guarda si el template es `by_item_service_dates` o `by_account_service_dates` |
| `Line[].SalesItemLineDetail.TaxCodeRef` | Código de impuesto aplicado a esa línea | Se usa el monto de impuesto, no la referencia al código |
| `Line[].SalesItemLineDetail.ClassRef` | Clase contable a nivel de línea | No requerido por R365 |
| `Line[].SalesItemLineDetail.MarkupInfo` | Información de markup sobre el costo | No requerido por R365 |
| `Line[].AccountBasedExpenseLineDetail.ClassRef` | Clase contable (template by_account) | No requerido por R365 |
| `Line[].AccountBasedExpenseLineDetail.CustomerRef` | Cliente asignado a la línea (template by_account) | No requerido por R365 actualmente |
| `Line[].AccountBasedExpenseLineDetail.BillableStatus` | Si la línea es facturable al cliente | No requerido por R365 |
| `SubTotalLine` | Línea automática de QBO que suma todas las líneas anteriores | **Descartada intencionalmente** — causa doble conteo del total |
| `DiscountLine` | Línea de descuento global aplicado a la factura | Descartada — los descuentos por línea están en `Amount` directamente |
| `DescriptionOnlyLine` | Línea solo de texto, sin monto ni ítem | Descartada — no tiene valor contable |

### Campos de línea que SÍ se guardan (referencia)

| Campo QBO | Se guarda como | Notas |
|---|---|---|
| `Line[].Id` | `sourceLineId` | Identificador único de línea |
| `Line[].Amount` | `lineAmount` | Monto de la línea |
| `Line[].Description` | `description` | Descripción libre de la línea |
| `Line[].SalesItemLineDetail.ItemRef.value` | `sourceItemCode` | ID interno de QBO del ítem |
| `Line[].SalesItemLineDetail.ItemRef.name` | `itemName` | Nombre completo del ítem en QBO |
| `Line[].SalesItemLineDetail.Qty` | `quantity` | Cantidad |
| `Line[].SalesItemLineDetail.UnitPrice` | `unitPrice` | Precio unitario |
| `Line[].TaxAmount` | `taxAmount` | Monto de impuesto (según taxMode) |

---

## Nivel de ítem (Item entity — query separada)

El sistema hace una query adicional a `SELECT * FROM Item` para obtener SKUs.
De toda la información del ítem, solo se persiste el SKU.

| Campo QBO (Item) | Se guarda como | Descartado |
|---|---|---|
| `Item.Id` | usado como clave para mapear SKU | — |
| `Item.Sku` | `sku` en payload | ✅ Se guarda |
| `Item.Name` | `itemName` (nombre completo con categoría) | ✅ Se guarda vía `ItemRef.name` en la línea |
| `Item.FullyQualifiedName` | — | ❌ Descartado (equivale a `Name`) |
| `Item.Description` | — | ❌ Descartado |
| `Item.SalesDesc` | — | ❌ Descartado |
| `Item.PurchaseDesc` | — | ❌ Descartado |
| `Item.UnitPrice` | — | ❌ Descartado (se usa el precio de la línea) |
| `Item.Type` | — | ❌ Descartado (Service, Inventory, NonInventory, etc.) |
| `Item.IncomeAccountRef` | — | ❌ Descartado |
| `Item.Active` | — | ❌ Descartado |
| `Item.QtyOnHand` | — | ❌ Descartado |

---

## Campos descartados de alto potencial futuro

Estos campos tienen valor real para expansiones futuras:

| Campo | Valor potencial |
|---|---|
| `ShipAddr` / `BillAddr` | Mostrar dirección de entrega en el panel y PDF |
| `LinkedTxn` | Saber si una factura ya tiene pagos aplicados parcialmente |
| `ClassRef` / `DepartmentRef` | Segmentación contable si R365 lo requiere |
| `CustomerMemo.value` | Mostrar el mensaje que el cliente ve en la factura |
| `ExchangeRate` | Conversión correcta para facturas en moneda extranjera |
| `Line[].SalesItemLineDetail.ServiceDate` | Ya preparado en el schema del CSV (templates `_service_dates`) |
| `Item.Type` | Diferenciar ítems de inventario vs servicios en la exportación |
| `Item.SalesDesc` | Descripción alternativa del ítem para el PDF |
