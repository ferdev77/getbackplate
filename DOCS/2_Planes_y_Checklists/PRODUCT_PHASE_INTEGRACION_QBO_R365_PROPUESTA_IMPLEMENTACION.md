# DOC_ID: PRODUCT_PHASE_QBO_R365_IMPLEMENTATION_PROPOSAL_V1
# DOC_LEVEL: PROPUESTA_CLIENTE
# PHASE_NAMESPACE: PRODUCT_PHASE
# SOURCE_OF_TRUTH_FOR: alcance inicial de integracion automatizada QuickBooks Online -> Restaurant365

# Propuesta de Implementacion

## Integracion automatizada entre QuickBooks Online y Restaurant365

Documento orientado a cliente para describir el alcance del trabajo, el flujo esperado, las dependencias externas y los entregables previstos del proyecto.

## Estado del documento

- Version base: v1.
- Tipo: documento vivo.
- Regla: se actualiza a medida que evolucionen decisiones funcionales y tecnicas.

## Resumen ejecutivo

Se desarrollara un modulo de integracion que extraiga facturas de proveedores desde QuickBooks Online (QBO), las transforme al formato requerido por Restaurant365 (R365) y las envie automaticamente al canal de importacion definido por el cliente.

El flujo incluira monitoreo operativo y trazabilidad completa por ejecucion para permitir control, reintentos y analisis de incidencias.

## 1. Objetivo del proyecto

Implementar una integracion automatizada que permita:

1. tomar facturas de proveedores desde QuickBooks Online;
2. transformarlas al formato de importacion de Restaurant365;
3. enviarlas al canal de importacion habilitado para el cliente;
4. registrar estado y resultado de cada corrida.

Objetivo de negocio: reducir trabajo manual, minimizar errores operativos y establecer un flujo repetible, controlado y escalable.

## 2. Resultado esperado

Una vez implementada la integracion, el cliente contara con un modulo que permita:

- conectar su cuenta de QuickBooks Online de forma segura;
- configurar los datos necesarios para el envio a Restaurant365;
- transformar automaticamente las facturas al formato correcto;
- ejecutar sincronizaciones automaticas;
- consultar historial de ejecuciones, errores y estados de envio.

Restaurant365 documenta un flujo de importacion de AP mediante archivos CSV y Hosted FTP Site. Tambien indica que las transacciones se importan como `Unapproved` y que existen templates genericos de importacion `By Item` y `By Account`, lo cual impacta directamente en el diseno de mapeo de datos.

Referencias:

- Restaurant365, FTP Site: Setup (`https://docs.restaurant365.com/docs/ftp-site-setup`)
- Restaurant365, AP Imports: Import Templates (`https://docs.restaurant365.com/docs/ap-imports-import-templates`)

## 3. Alcance funcional de la integracion

### 3.1 Conexion con QuickBooks Online

Se implementara conexion con QuickBooks Online mediante OAuth 2.0, mecanismo estandar de autenticacion y autorizacion para la API de QBO.

Se utilizara entorno sandbox para pruebas controladas antes de operar con datos reales.

Referencias:

- QuickBooks Developer, Set up OAuth 2.0 (`https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0`)
- QuickBooks Developer, Sandbox and testing tools (`https://developer.intuit.com/app/developer/qbo/docs/develop/sandboxes`)

### 3.2 Extraccion de facturas

La integracion obtendra desde QBO las facturas de proveedores necesarias para AP, segun reglas de acceso autorizadas por el cliente para su empresa.

### 3.3 Transformacion de datos

La informacion extraida se adaptara al formato de importacion requerido por R365.

En esta etapa se definira, por cliente, si la importacion se realizara con template `By Item` o `By Account`, segun su estructura contable y operativa.

Adicionalmente, segun documentacion recibida de R365 para `EDI Invoice Mapping - Multi-Invoice`, la salida debera respetar la estructura `CSV/EDI 810` esperada por su pipeline de AP Imports.

Referencias:

- Restaurant365, AP Imports: Import Templates (`https://docs.restaurant365.com/docs/ap-imports-import-templates`)
- Restaurant365, AP Imports Overview (`https://docs.restaurant365.com/docs/ap-imports-overview`)

### 3.4 Entrega automatica a Restaurant365

El archivo resultante sera enviado al entorno de importacion del cliente en R365.

Previamente se validara el canal de recepcion disponible y las credenciales entregadas para la operacion.

Referencias:

- Restaurant365, FTP Site: Setup (`https://docs.restaurant365.com/docs/ftp-site-setup`)
- Restaurant365, How do I log in to my FTP account? (`https://docs.restaurant365.com/docs/how-do-i-log-in-to-my-ftp-account`)

### 3.5 Registro y monitoreo

Cada ejecucion dejara trazabilidad para responder, al menos:

- que se proceso;
- que fallo;
- que requiere reintento;
- que queda pendiente de revision operativa.

## 4. Flujo general de funcionamiento

### Etapa 1. Autorizacion y configuracion

El cliente conecta su cuenta de QBO y configura los datos requeridos para R365.

### Etapa 2. Lectura de informacion

El sistema consulta QBO y detecta facturas a procesar.

### Etapa 3. Validacion y mapeo

Los datos se transforman al formato esperado por R365, respetando estructura, columnas y reglas del template definido.

Para `Multi-Invoice`, se validara que las columnas de cabecera de transaccion se repitan de forma consistente por cada linea del documento y que las columnas de detalle contengan los importes/cantidades esperadas por cada item.

### Etapa 4. Generacion del archivo

Se construye el archivo final listo para importacion.

### Etapa 5. Envio automatico

El sistema deposita el archivo en el canal de recepcion del cliente en R365.

### Etapa 6. Registro del resultado

Se guarda estado del proceso, con detalle de exito, rechazo, error o necesidad de revision.

## 5. Componentes a construir

### A. Motor de integracion

Sera el nucleo tecnico del modulo. Incluira:

- conexion segura con QBO;
- lectura de facturas;
- normalizacion de datos;
- transformacion al template de R365;
- generacion de archivos;
- envio automatico;
- manejo de errores, reintentos y control de duplicados.

### B. Panel de configuracion

Interfaz para que el cliente pueda:

- conectar QBO;
- cargar o validar configuracion de R365;
- ejecutar sincronizacion manual de prueba;
- definir parametros operativos;
- consultar resultados e historial.

### C. Modulo de monitoreo y auditoria

Vista para revisar:

- ultimas sincronizaciones;
- cantidad de registros procesados;
- errores detectados;
- ejecuciones pendientes;
- estados finales por corrida.

## 6. Aportes y validaciones requeridas al cliente

- acceso a la cuenta de QBO a conectar;
- confirmacion del alcance funcional exacto de facturas a procesar;
- definicion del formato de importacion a usar en R365 (`By Item` o `By Account`);
- validacion de campos obligatorios, reglas contables y estructura esperada;
- solicitud y provision de credenciales del FTP Site o AP Imports FTP Site de R365;
- provision de datos de prueba y validacion operativa del flujo final.

Esta participacion es necesaria porque la integracion depende de definiciones funcionales y accesos reales, no solo de desarrollo tecnico.

Referencia:

- Restaurant365, FTP Site: Setup (`https://docs.restaurant365.com/docs/ftp-site-setup`)

## 7. Fases propuestas del proyecto

### Fase 1. Descubrimiento y validacion tecnica

Revision de alcance, analisis del template R365, validacion de campos, definicion de reglas de mapeo y confirmacion de accesos/dependencias.

### Fase 2. Prueba de concepto

Conexion con QBO, extraccion de facturas de prueba, generacion de archivo de salida y envio a entorno de prueba o equivalente.

### Fase 3. Desarrollo del modulo productivo

Construccion del backend de integracion, panel de configuracion, automatizacion de sincronizaciones, logs, reintentos, validaciones y control de duplicados.

### Fase 4. Testing integral

Pruebas con sandbox, pruebas funcionales, pruebas de error, pruebas de reenvio y validacion final con el cliente.

### Fase 5. Puesta en marcha

Configuracion final, activacion, verificacion post-lanzamiento y documentacion operativa basica.

Referencia tecnica para pruebas:

- QuickBooks Developer, Sandbox and testing tools (`https://developer.intuit.com/app/developer/qbo/docs/develop/sandboxes`)

## 8. Consideraciones tecnicas clave

- autenticacion segura con QBO;
- mapeo entre estructuras distintas;
- validacion estricta del template de R365;
- controles para evitar envios duplicados;
- trazabilidad completa por ejecucion;
- manejo de errores y reintentos;
- diferencias de configuracion entre clientes.
- cumplimiento de convenciones de nombre de archivo para proceso estable.

Aunque para el usuario final el proceso sea simple, internamente la integracion requiere resolver estas capas para garantizar estabilidad operativa y auditabilidad.

Referencias:

- QuickBooks Developer, Authorization and authentication (`https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization`)
- Restaurant365, AP Imports Overview (`https://docs.restaurant365.com/docs/ap-imports-overview`)

## 9. Alineacion con respuesta oficial de Restaurant365 (Multi-Invoice)

Con base en la comunicacion recibida de R365 sobre `EDI Invoice Mapping Documentation - Restaurant365 Multi-Invoice`, este proyecto toma los siguientes lineamientos operativos:

1. Formato de archivo de importacion:
   - `CSV` (compatible con `EDI 810`) para invoice files.
2. Canal de entrega:
   - FTP dedicado hosted por Restaurant365.
   - URL y credenciales provistas por el cliente/R365.
3. Procesamiento en R365:
   - los archivos enviados se procesan y se importan en la instancia del cliente.
4. Estructura de datos del `Multi-Invoice`:
   - primeras columnas de cabecera de transaccion deben mantenerse identicas por cada linea del mismo comprobante;
   - columnas restantes representan detalle por linea y cambian segun item/cuenta.
5. Tipos de transaccion soportados:
   - AP Invoice;
   - AP Credit Memo.
6. Impuestos:
   - se deben contemplar los metodos permitidos por R365 para incluir tax en la transaccion.
7. Soporte y troubleshooting:
   - revisar carpetas FTP `APImports/R365/Processed` y `APImports/R365/ErrorLog`;
   - descargar archivo y revisar en planilla para diagnostico.
8. Gobierno del mapping:
   - utilizar el tab `Invoice Template` y `R365 Mapping` como referencia funcional de columnas y comportamiento esperado.

Nota: este bloque se considera input oficial de implementacion y reduce ambiguedad sobre el formato final de salida.

## 10. Entregables

- modulo de conexion con QuickBooks Online;
- modulo de configuracion de integracion;
- motor automatico de transformacion y envio;
- panel de monitoreo y logs;
- pruebas de validacion end-to-end;
- documentacion operativa basica.

Entregable adicional recomendado para esta integracion:

- matriz de mapeo QBO -> R365 Multi-Invoice validada con el cliente.

## 11. Supuestos y dependencias externas

- QBO y R365 mantienen disponibilidad de APIs/canales y politicas de acceso compatibles;
- el cliente provee credenciales y permisos necesarios en tiempo y forma;
- el template de importacion definido no cambia sin coordinacion previa;
- sandbox y/o entorno de validacion esta disponible para pruebas.
- el cliente dispone del paquete documental de R365 Multi-Invoice (tabs de mapping/template) para validacion funcional.

## 12. Fuera de alcance en esta version base

- cambios contables estructurales dentro de R365 fuera del mapping acordado;
- desarrollos de ERP custom fuera del flujo QBO -> R365 AP import;
- operaciones manuales de soporte permanente posteriores a estabilizacion inicial.

## Control de cambios

- v1: carga inicial profesionalizada del texto base de propuesta y estructura ejecutiva.
- v1.1: incorporacion de lineamientos oficiales R365 Multi-Invoice (formato, estructura, troubleshooting y gobierno de mapping).
- v1.2: vinculacion con paquete documental completo (spec tecnica, matriz de mapeo, checklist de implementacion y guia operativa).

## Documentos relacionados

- `DOCS/1_Arquitectura_y_Contexto/PRODUCT_PHASE_QBO_R365_ESPECIFICACION_TECNICA.md`
- `DOCS/2_Planes_y_Checklists/PRODUCT_PHASE_QBO_R365_MATRIZ_MAPEO_BASE.md`
- `DOCS/2_Planes_y_Checklists/PRODUCT_PHASE_QBO_R365_PLAN_IMPLEMENTACION_CHECKLIST.md`
- `DOCS/4_Operaciones_y_Guias/GUIA_OPERATIVA_QBO_R365.md`
- `DOCS/4_Operaciones_y_Guias/GUIA_CONFIGURACION_QBO_R365_SANDBOX.md`
