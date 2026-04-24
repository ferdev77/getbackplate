# DnD Safety Net — Documento Técnico

## Problema Original

El sistema de arrastrar y soltar (Drag & Drop) dejaba de funcionar de forma
intermitente, obligando al usuario a recargar la página (F5) para recuperar
la funcionalidad.

### Causa raíz identificada

**El `EmployeeShell` y `CompanyShell` ejecutan `router.refresh()` periódicamente**
(cada 8s vía polling, y en respuesta a Supabase Realtime).  Cada `router.refresh()`:

1. Re-ejecuta el Server Component de la página de documentos.
2. Los `.map()` en las props crean **nuevas referencias de array** (aunque los datos no cambiaron).
3. React ve props distintas → re-renderiza `EmployeeDocumentsTree` / `DocumentsTreeWorkspace`.
4. Los `useEffect([documents])` se disparaban → `setDocumentsState(documents)` → re-render del DOM.
5. **Los nodos DOM draggables se destruyen y recrean**, cancelando cualquier drag en progreso.

Además, los componentes de animación (`AnimatedItem`, `FadeIn`, `SlideUp`, `motion.div`)
de Framer Motion interceptaban internamente los pointer events para su sistema de gestures,
bloqueando el `dragstart` del HTML5 nativo.

---

## Solución implementada (Capas de defensa)

### Capa 1 — Flag global `window.__gbp_dnd_active`

**Archivo:** `src/modules/documents/hooks/use-dnd-safety-net.ts`

Un flag booleano global en `window` que cualquier componente puede consultar:

- `markDndActive()` — se llama en `dragstart` (listener global en `document`).
- `markDndInactive()` — se llama en `dragend` y en `resetDndState()`.
- `isDndActive()` — consultada por los Shells antes de hacer `router.refresh()`.

### Capa 2 — Shells respetan el flag

**Archivos:**
- `src/shared/ui/employee-shell.tsx` (polling cada 8s + Realtime)
- `src/shared/ui/company-shell.tsx` (Realtime)

Ambos Shells ahora verifican `isDndActive()` **antes** de ejecutar `router.refresh()`.
Si hay un drag activo, el refresh se **omite** silenciosamente (el próximo ciclo lo
ejecutará si el drag ya terminó).

### Capa 3 — Props estables con comparación por contenido

**Archivos:**
- `src/modules/documents/ui/employee-documents-tree.tsx`
- `src/modules/documents/ui/documents-tree-workspace.tsx`

Los `useEffect` de sincronización de props comparan una **clave derivada del contenido**
(JSON.stringify de ids+folder_id+title) en lugar de la referencia del array:

```typescript
useEffect(() => {
  const key = JSON.stringify(documents.map(d => d.id + d.folder_id + d.title));
  if (key === prevDocumentsKeyRef.current) return; // sin cambio real
  prevDocumentsKeyRef.current = key;
  if (dragMetaRef.current.kind) {
    deferredPropsRef.current = { ...deferredPropsRef.current, documents };
    return; // diferir durante drag
  }
  setDocumentsState(documents);
}, [documents]);
```

Si los datos no cambiaron → no hay `setState` → no hay re-render → DOM estable.

### Capa 4 — Props diferidas durante drag

Si los datos SÍ cambiaron durante un drag activo, se almacenan en `deferredPropsRef`
y se aplican cuando el drag termina (dentro de `resetDndState()`):

```typescript
function resetDndState() {
  // ... limpiar estado DnD ...
  markDndInactive();
  if (deferredPropsRef.current) {
    const deferred = deferredPropsRef.current;
    deferredPropsRef.current = null;
    if (deferred.documents) setDocumentsState(deferred.documents);
    if (deferred.folders) setFolderRows(deferred.folders);
  }
}
```

### Capa 5 — Eliminación de Framer Motion en áreas draggables

Los wrappers `AnimatedItem`, `FadeIn`, `SlideUp`, y `motion.div` fueron reemplazados
con `<div>` planos en todas las áreas que contienen elementos `draggable`:

| Componente Framer | Problema | Reemplazado con |
|---|---|---|
| `<AnimatedItem>` en filas de folder/doc | Intercepta pointerdown | `<div>` |
| `<FadeIn>` en contenido expandido | Bloquea drag de items anidados | `<div>` |
| `<SlideUp>` wrapper general | Intercepta todos los drags | `<div>` |
| `<motion.div>` transición tree↔columns | Captura pointer events | `<div>` |

Los `AnimatedItem`/`AnimatedList` en las **stats cards** se mantienen porque no son draggables.

### Capa 6 — Global dragend listener

El hook `useDndSafetyNet` registra un listener en `document` para `dragend` que:
- Limpia el flag global
- Resetea el estado DnD si quedó "sucio"
- Flushea cualquier refresh diferido

---

## Comportamiento esperado actual

1. **El usuario arrastra un documento/carpeta** → el flag `__gbp_dnd_active` se activa.
2. **El polling/Realtime de los Shells detecta cambios** → ve el flag activo → **omite el refresh**.
3. **El drop se completa** → `resetDndState()` limpia todo, desactiva el flag, aplica props diferidas.
4. **El próximo ciclo de polling** → flag inactivo → ejecuta `router.refresh()` normalmente.

Esto garantiza que el DOM **nunca se destruya durante un drag**.

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/modules/documents/hooks/use-dnd-safety-net.ts` | Flag global + hook de seguridad |
| `src/shared/ui/employee-shell.tsx` | Polling y Realtime respetan `isDndActive()` |
| `src/shared/ui/company-shell.tsx` | Realtime respeta `isDndActive()` |
| `src/modules/documents/ui/employee-documents-tree.tsx` | Props estables + deferred + sin Framer Motion en draggables |
| `src/modules/documents/ui/documents-tree-workspace.tsx` | Props estables + deferred + sin Framer Motion en draggables |
| `src/modules/documents/ui/employee-document-actions.tsx` | `draggable={false}` + stopPropagation en botones de acción |
