# Plan Integral de Mejora (en lenguaje simple)

Fecha: 2026-03-30  
Estado: Listo para ejecutar

---

## 1) Para que sirve este plan

Este plan busca tres cosas:

- que no haya riesgos de seguridad entre empresas,
- que el sistema sea mas ordenado por dentro,
- y que toda la plataforma se vea y se sienta igual (mismo estilo en todos lados).

En resumen: menos errores, menos riesgo, mas velocidad para seguir creciendo.

---

## 2) Que resultado vamos a tener al terminar

- Una empresa no podra tocar datos o cuentas de otra empresa.
- Las tareas automaticas solo se ejecutaran si la configuracion de seguridad esta bien.
- Cada empleado vera solo lo que realmente le corresponde.
- Las pantallas quedaran mas livianas y el trabajo pesado quedara en lugares internos preparados para eso.
- El estilo visual quedara consistente en toda la plataforma.

---

## 3) Prioridad maxima: Seguridad critica

### 3.1 Evitar cruces entre empresas al crear o reenviar acceso

**Que falta hoy**

- En algunos casos, al buscar una persona por correo, se puede modificar su acceso sin confirmar primero que realmente pertenece a esa empresa.

**Como lo cambiamos**

- Antes de cualquier cambio de acceso, verificar primero que esa persona este vinculada a la empresa correcta.
- Si no esta vinculada, no se toca su acceso actual.
- En ese caso se usa un camino seguro de invitacion para esa empresa.

**Como quedara**

- Una empresa no podra afectar por error (o abuso) el acceso de gente de otra empresa.

---

### 3.2 Cerrar tareas automaticas cuando falte seguridad

**Que falta hoy**

- Si falta una clave de seguridad, algunas tareas automaticas igual pueden correr.

**Como lo cambiamos**

- Regla estricta: si falta la clave, no corre nada.
- Ademas, se deja registro de ese intento para auditoria.

**Como quedara**

- No habra ejecuciones peligrosas por configuraciones incompletas.

---

### 3.3 Endurecer puerta interna de procesamiento

**Que falta hoy**

- Hay una puerta interna que acepta formas de acceso debiles.

**Como lo cambiamos**

- Se elimina el acceso inseguro por enlace.
- Se exige una credencial fuerte y unica.
- Todo lo que no cumpla se bloquea.

**Como quedara**

- Esa puerta solo podra usarse por sistemas internos autorizados.

---

### 3.4 Proteger fotos y evidencias operativas

**Que falta hoy**

- Algunas evidencias pueden quedar visibles de forma abierta.

**Como lo cambiamos**

- Pasar a almacenamiento privado.
- Compartir archivos solo con permisos temporales.

**Como quedara**

- Las evidencias ya no quedaran expuestas publicamente.

---

## 4) Segunda prioridad: Flujo de datos y permisos

### 4.1 Mostrar anuncios solo a quien corresponde

**Que falta hoy**

- En el portal de empleados, algunos avisos pueden mostrarse mas alla del publico correcto.

**Como lo cambiamos**

- Usar una sola regla central de alcance para definir quien puede ver cada aviso.
- Aplicar esa misma regla en todas las pantallas de empleado.

**Como quedara**

- Cada empleado vera solo los avisos que le tocan.

---

### 4.2 Evitar bajas equivocadas de acceso

**Que falta hoy**

- En una baja de usuario, puede darse un cruce y tocar el acceso incorrecto.

**Como lo cambiamos**

- Confirmar siempre que el acceso a eliminar pertenece exactamente a la persona seleccionada.
- Si no coincide, bloquear la accion.

**Como quedara**

- Se evita borrar permisos de la persona equivocada.

---

### 4.3 Evitar cobros/cambios repetidos en integracion de pagos

**Que falta hoy**

- Si llega el mismo aviso de pago dos veces, puede aplicarse dos veces.

**Como lo cambiamos**

- Guardar un identificador unico de cada aviso procesado.
- Si ya fue procesado, ignorarlo.

**Como quedara**

- Cada aviso de pago impacta una sola vez.

---

### 4.4 Unificar mensajes de error

**Que falta hoy**

- Distintas partes del sistema responden errores de forma diferente.

**Como lo cambiamos**

- Definir un formato unico de error para toda la app.

**Como quedara**

- Mensajes mas claros y consistentes para usuario y equipo.

---

## 5) Tercera prioridad: Orden interno y velocidad

### 5.1 Sacar trabajo pesado de las pantallas

**Que falta hoy**

- Algunas pantallas hacen demasiadas cosas por dentro (leer, calcular, decidir y mostrar todo junto).

**Como lo cambiamos**

- Mover la logica de calculo y reglas a capas internas de servicio.
- Dejar las pantallas enfocadas en mostrar informacion.

**Como quedara**

- Codigo mas limpio, mas facil de mantener y con menos riesgo de romperse.

---

### 5.2 Reducir trabajo repetido

**Que falta hoy**

- Hay lecturas repetidas y procesos internos que se pueden hacer de forma mas eficiente.

**Como lo cambiamos**

- Unificar lecturas similares.
- Evitar trabajo duplicado al armar listas y cruces.

**Como quedara**

- Pantallas mas rapidas y menor carga del sistema.

---

### 5.3 Evitar doble camino para la misma accion

**Que falta hoy**

- Algunas acciones importantes estan duplicadas en dos lugares.

**Como lo cambiamos**

- Dejar una sola logica central por accion y que todos los caminos pasen por ahi.

**Como quedara**

- Menos inconsistencias y menos bugs raros.

---

## 6) Cuarta prioridad: Cerrar Design System

### 6.1 Eliminar colores escritos a mano

**Que falta hoy**

- Todavia hay colores puestos manualmente en algunos componentes.

**Como lo cambiamos**

- Reemplazar todo por la paleta oficial del sistema.

**Como quedara**

- Coherencia visual real en toda la plataforma.

---

### 6.2 Respetar significado de colores

**Que falta hoy**

- El color reservado para funciones de IA aparece en lugares que no son IA.

**Como lo cambiamos**

- Usar ese color solo donde corresponde y ajustar el resto con colores operativos.

**Como quedara**

- Lenguaje visual claro y sin confusiones.

---

### 6.3 Unificar tipografia

**Que falta hoy**

- Se mezclan estilos de letra en modulos clave.

**Como lo cambiamos**

- Aplicar la tipografia definida como oficial en todos los modulos.

**Como quedara**

- Experiencia mas profesional y consistente.

---

### 6.4 Usar mas componentes base del sistema

**Que falta hoy**

- Hay botones y etiquetas repetidos con estilos hechos a medida.

**Como lo cambiamos**

- Migrar esos casos a componentes base ya aprobados.

**Como quedara**

- Menos mantenimiento y menos deuda visual.

---

## 7) Como sabremos que quedo bien

### Seguridad

- No hay cambios de acceso sin validar pertenencia correcta a empresa.
- Tareas automaticas no corren si falta seguridad.
- Evidencias solo accesibles con permisos temporales.

### Permisos y flujos

- Empleados ven solo avisos permitidos.
- No se puede borrar acceso equivocado.
- Avisos de pagos repetidos no generan cambios dobles.

### Orden interno y rendimiento

- Pantallas clave ya no cargan logica pesada.
- Menos trabajo repetido y mejores tiempos de respuesta.

### Diseño

- Colores y tipografia consistentes.
- Sin excepciones fuera de reglas del sistema de diseno.

---

## 8) Regla de trabajo durante toda la ejecucion

- Seguridad primero.
- Cada accion sensible debe respetar el limite de empresa.
- Roles y permisos siempre por jerarquia correcta.
- Sin romper flujos ya usados por operaciones.
- Toda accion importante deja rastro de auditoria.

---

## 9) Estado del documento

Este archivo queda como hoja oficial de trabajo para la remediacion integral.
Si cambia el alcance, se actualiza aqui mismo.
