Requerimientos Complemento Etapa 1

## 1) Enfoque

El objetivo es simple: ordenar procesos, reducir friccion y dejar trazabilidad en los puntos que hoy mas se desordenan (turnos, documentos, contratos y contactos de proveedores).

## 2) Como funciona hoy, que cambia y como funcionara despues

### A. Modulos nuevos

### 1) Shift Communication Log (Bitacora de Turnos)

**Como funciona hoy**
- El pase entre turnos depende de memoria, mensajes sueltos o notas fuera del sistema.
- Eso genera perdida de contexto (productos agotados, pendientes, incidentes).

**Que cambia**
- Se crea una bitacora digital por turnos y por locacion.
- Se usan categorias claras para que la informacion no quede mezclada.

**Como funcionara despues (flujo real)**
- **Quien crea:** Empleado saliente y Administrador.
- **Donde crea:** Panel de empresa, seccion "Bitacora".
- **Que registra:** turno (apertura/mediodia/cierre), categoria, nota, autor, fecha/hora, locacion.
- **Quien ve:**
  - Administrador: ve todo el historial de su empresa.
  - Empleado: ve solo lo que le corresponde segun destino de la nota.
- **Que accion se agrega:** el Administrador puede marcar "leida" o "requiere accion" para seguimiento.

**Regla de visibilidad recomendada (para evitar ruido y no perder informacion):**
- Si es muy cerrado, puede perderse informacion importante; si es muy abierto, se genera ruido. Por eso se segmenta la visibilidad por tipo de nota:

- Nota de relevo directo: la ve solo quien entrega, quien recibe y Administrador.
- Nota de area (ej. cocina/barra): la ve el equipo de esa area en el turno entrante + Administrador.
- Nota operativa critica (ej. 86's, equipo fuera de servicio): la ve todo el turno entrante + Administrador.
- Nota sensible: solo Administrador.
- En todos los casos, quien recibe la nota la marca como "leida".

**Ejemplos concretos:**
- "Te deje prep de salsas en estante 2" -> relevo directo (solo reemplazo + Administrador).
- "Faltan guantes en cocina" -> nota de area (equipo cocina + Administrador).
- "Heladera principal fuera de servicio" -> nota critica (todo turno entrante + Administrador).



### 2) Supplier & Vendor Directory (Directorio de Proveedores)

**Como funciona hoy**
- Los contactos de proveedores suelen estar repartidos entre WhatsApp, planillas y conversaciones internas.

**Que cambia**
- Se centraliza todo en un directorio unico dentro del panel.

**Como funcionara despues (flujo real)**
- **Quien crea/edita:** Administrador.
- **Donde:** Panel de empresa, seccion "Proveedores".
- **Que carga:** nombre, categoria, contacto, telefono, email, direccion, notas.
- **Asignacion:** cada proveedor puede quedar en una o varias locaciones.
- **Quien consulta:**
  - Administrador: lectura + gestion completa.
  - Alcance por dpto/puesto para resolver operacion diaria.
- **Que mejora concreta trae:** ante una urgencia, el equipo encuentra rapido el proveedor correcto, con condiciones y horarios.

---

### B. Mejoras sobre lo existente

### 3) Portal del Empleado - Upload de Documentos

**Como funciona hoy**
- El empleado no resuelve toda su carga documental por cuenta propia.
- El Administrador termina absorbiendo trabajo operativo de recepcion/carga/revision.

**Que cambia**
- El empleado pasa a cargar sus documentos desde su portal.

**Como funcionara despues (flujo real)**
- **Quien sube:** Admin y Empleado.
- **Donde:** Portal del empleado, seccion "Mis Documentos".
- **Que sube:** ID, foto, SSN, cartas y otros slots del perfil.
- **Estado inicial:** pendiente de revision.
- **Quien revisa:** Administrador desde panel de empresa.
- **Acciones del Administrador:** aprobar, rechazar o pedir resubida con comentario.

Resultado: menos cuello de botella administrativo y circuito documental mas ordenado.

### 4) Vencimiento de Documentos y Alertas

**Como funciona hoy**
- El control de vencimientos depende de revisiones manuales.
- Es facil que un documento se venza sin aviso previo.

**Que cambia**
- Cada documento puede tener fecha de vencimiento y alerta programada.

**Como funcionara despues (flujo real)**
- **Quien configura:** Administrador al subir o editar aprobar documento.
- **Que define:** si activa alerta y con cuanta anticipacion (45, 30, 15, 7, 3, 1 dia).
- **A quien avisa:** Empleado y Administrador por notificacion dentro de la plataforma.
- **Que pasa con el estatus:**
  - "Documentacion proxima a vencer" cuando entra en ventana de alerta.
  - "Documentacion vencida" el dia de vencimiento.
  - vuelve a normal al reemplazar o actualizar.
- **Donde se ve:** dashboard del Administrador con lista de casos en riesgo. 

### 5) Vista de Columnas en Documentos

**Como funciona hoy**
- La navegacion se hace en vista de arbol.

**Que cambia**
- Se agrega vista de columnas (estilo Finder/Dropbox) sin perder acciones actuales.

**Como funcionara despues (flujo real)**
- **Quien usa:** Administrador y Empleado segun permisos de documentos.
- **Donde:** modulo Documentos.
- **Que puede hacer:** alternar entre arbol y columnas.
- **Que se muestra:** nombre, tipo, departamento, locacion, fecha de creacion y tamano.
- **Preferencia:** queda guardada por usuario.
- **Acciones disponibles:** descargar, compartir y eliminar (igual que hoy).

### 6) Firmas Digitales de Contratos - DocuSeal

**Como funciona hoy**
- El contrato se completa internamente, pero el flujo de firma no esta optimizado para firma remota del empleado.

**Que cambia**
- Se elimina la firma presencial del lado administrador y se pasa a firma digital del empleado.

**Como funcionara despues (flujo real)**
- **Paso 1:** Administrador da de alta al empleado y el contrato se autocompleta.
- **Paso 2:** desde panel de empresa se envia contrato a DocuSeal.
- **Paso 3:** Empleado recibe aviso en portal/email y firma desde celular o computadora.
- **Paso 4:** DocuSeal devuelve certificado de auditoria (IP, fecha y hora).
- **Paso 5:** contrato firmado se archiva automaticamente en Documentos del empleado.
- **Paso 6:** Administrador recibe notificacion del resultado.

Estados esperados del contrato:
- Pendiente de firma
- Firmado
- Rechazado

### 7) Custom Domain por Empresa

**Como funciona hoy**
- La empresa opera principalmente sobre la URL base de la plataforma.

**Que cambia**
- Cada empresa puede operar con su dominio propio.

**Como funcionara despues (flujo real)**
- **Quien configura:** Administrador en "Ajustes de Empresa".
- **Que hace el sistema:** valida dominio y muestra configuracion DNS.
- **Estados visibles:** pendiente, verificando, activo, error.
- **Con dominio activo:** login, dashboard y links de invitacion/recuperacion usan ese dominio.
- **Si falla:** fallback automatico a URL base para no cortar operacion.
- **Control de plataforma:** superadmin habilita/deshabilita por organizacion.

### 8) Estilos de Stripe - Checkout y Billing Portal

**Como funciona hoy**
- El cobro funciona, pero no siempre se siente 100% alineado a la marca.

**Que cambia**
- Se unifica la presentacion visual del checkout y billing portal con identidad GetBackplate.

**Como funcionara despues**
- **Quien lo define:** equipo de plataforma.
- **Que se alinea:** logo, colores de marca (`#D4531A` y `#0F1923`) y tono de textos.
- **Que se valida:** experiencia en desktop y mobile para mantener consistencia.

---


---

## 3) Presupuesto


1. **Shift Communication Log (Bitacora de Turnos): USD 120**
2. **Supplier & Vendor Directory: USD 80**
3. **Portal del Empleado - Upload de Documentos: USD 70**
4. **Vencimiento de Documentos y Alertas: USD 80**
5. **Vista de Columnas en Documentos: USD 50**
6. **Firmas Digitales de Contratos - DocuSeal: USD 120**
7. **Custom Domain por Empresa: USD 60**
8. **Estilos de Stripe (Checkout + Billing Portal): USD 50**

**Total final propuesto: USD 630

---

## 4) Plazo estimado de entrega

Para este alcance, proponemos una ventana total de 10 dias, trabajando por fases:

1. **Fase 1:** Custom domain.
2. **Fase 2:** Stripe branding + vista de columnas.
3. **Fase 3:** Bitacora + proveedores.
4. **Fase 4:** Mis documentos + vencimientos/alertas + DocuSeal + ajustes finales.

