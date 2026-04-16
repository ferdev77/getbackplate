"use client";

import { useState, useEffect, useCallback, type PointerEvent } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { toast } from "sonner";
import { EditablePositionItem } from "./editable-position-item";
import { reorderDepartmentPositionsAction } from "@/modules/organizations/actions";

interface Position {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order?: number;
}

interface ReorderablePositionListProps {
  departmentId: string;
  initialPositions: Position[];
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  toggleStatusAction: (formData: FormData) => Promise<void>;
}

export function ReorderablePositionList({
  departmentId,
  initialPositions,
  updateAction,
  deleteAction,
  toggleStatusAction,
}: ReorderablePositionListProps) {
  const [items, setItems] = useState(initialPositions);

  useEffect(() => {
    setItems(initialPositions);
  }, [initialPositions]);

  const handleReorderFinish = useCallback(async (newOrder: Position[]) => {
    const ids = newOrder.map((item) => item.id);
    const result = await reorderDepartmentPositionsAction({
      departmentId,
      positionIds: ids,
    });
    if (result.ok) {
      toast.success("Orden de puestos actualizado");
    } else {
      toast.error("Error al sincronizar el orden");
      setItems(initialPositions);
    }
  }, [departmentId, initialPositions]);

  if (!items?.length) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--gbp-border2)] p-6 text-center">
        <p className="text-xs text-[var(--gbp-muted)]">No hay puestos en este departamento.</p>
      </div>
    );
  }

  return (
    <Reorder.Group
      axis="y"
      values={items}
      onReorder={(newOrder) => setItems(newOrder)}
      className="space-y-1"
    >
      {items.map((position) => (
        <ReorderPositionWrapper
          key={position.id}
          position={position}
          updateAction={updateAction}
          deleteAction={deleteAction}
          toggleStatusAction={toggleStatusAction}
          onReorderFinish={() => handleReorderFinish(items)}
        />
      ))}
    </Reorder.Group>
  );
}

function ReorderPositionWrapper({
  position,
  updateAction,
  deleteAction,
  toggleStatusAction,
  onReorderFinish,
}: {
  position: Position;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  toggleStatusAction: (formData: FormData) => Promise<void>;
  onReorderFinish: () => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={position}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onReorderFinish}
      className="relative list-none"
    >
      <EditablePositionItem
        position={position}
        updateAction={updateAction}
        deleteAction={deleteAction}
        toggleStatusAction={toggleStatusAction}
        dragHandleProps={{
          onPointerDown: (event: PointerEvent) => controls.start(event),
        }}
      />
    </Reorder.Item>
  );
}
