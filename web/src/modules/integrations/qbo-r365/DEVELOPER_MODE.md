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

## Creación de sync config en Developer

En modo Developer se permite crear sync config sin FTP completo para validar primero la conexión y extracción desde QBO.

- Si FTP no se completa, la sync se crea igual para pruebas de extracción/preview.
- Si se completa parcialmente (por ejemplo solo host), la API rechaza la creación.

## Envío a R365 con FTP

Al enviar (`3) Enviar a R365`), el sistema resuelve FTP en este orden:

1. FTP propio de la sync config (si existe y está completo).
2. FTP global de la organización.

Si no existe ninguna de las dos configuraciones válidas, el envío falla con mensaje controlado.
