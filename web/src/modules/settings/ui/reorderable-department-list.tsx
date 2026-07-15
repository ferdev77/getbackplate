"use client";

import { useState, useEffect, useCallback, type PointerEvent } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { toast } from "sonner";
import { EditableDepartmentItem } from "./editable-department-item";
import { reorderDepartmentsAction } from "@/modules/organizations/actions";
import { createTranslator } from "./settings.i18n";

interface Position {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

interface Department {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

interface ReorderableDepartmentListProps {
  locale?: "es" | "en";
  initialDepartments: Department[];
  positionsByDepartment: Record<string, Position[]>;
  updateDepartmentAction: (formData: FormData) => Promise<void>;
  deleteDepartmentAction: (formData: FormData) => Promise<void>;
  toggleDepartmentStatusAction: (formData: FormData) => Promise<void>;
  createPositionAction: (formData: FormData) => Promise<void>;
  updatePositionAction: (formData: FormData) => Promise<void>;
  deletePositionAction: (formData: FormData) => Promise<void>;
  togglePositionStatusAction: (formData: FormData) => Promise<void>;
}

export function ReorderableDepartmentList({
  locale,
  initialDepartments,
  positionsByDepartment,
  updateDepartmentAction,
  deleteDepartmentAction,
  toggleDepartmentStatusAction,
  createPositionAction,
  updatePositionAction,
  deletePositionAction,
  togglePositionStatusAction,
}: ReorderableDepartmentListProps) {
  const t = createTranslator(locale);
  const [items, setItems] = useState(initialDepartments);

  useEffect(() => {
    setItems(initialDepartments);
  }, [initialDepartments]);

  const handleReorderFinish = useCallback(async (newOrder: Department[]) => {
    const ids = newOrder.map((item) => item.id);
    const result = await reorderDepartmentsAction(ids);
    if (result.ok) {
      toast.success("Department order updated.");
    } else {
      toast.error("Could not sync the order.");
      setItems(initialDepartments);
    }
  }, [initialDepartments]);

  if (!items?.length) {
    return <p className="text-center py-8 rounded-xl border border-dashed border-[var(--gbp-border2)] text-sm text-[var(--gbp-text2)]">{t("Aún no hay departamentos.")}</p>;
  }

  return (
    <Reorder.Group
      axis="y"
      values={items}
      onReorder={(newOrder) => setItems(newOrder)}
      className="space-y-3"
    >
      {items.map((department) => (
        <ReorderDepartmentWrapper
          key={department.id}
          locale={locale}
          department={department}
          positionsByDepartment={positionsByDepartment}
          updateDepartmentAction={updateDepartmentAction}
          deleteDepartmentAction={deleteDepartmentAction}
          toggleDepartmentStatusAction={toggleDepartmentStatusAction}
          createPositionAction={createPositionAction}
          updatePositionAction={updatePositionAction}
          deletePositionAction={deletePositionAction}
          togglePositionStatusAction={togglePositionStatusAction}
          onReorderFinish={() => handleReorderFinish(items)}
        />
      ))}
    </Reorder.Group>
  );
}

function ReorderDepartmentWrapper({
  locale,
  department,
  positionsByDepartment,
  updateDepartmentAction,
  deleteDepartmentAction,
  toggleDepartmentStatusAction,
  createPositionAction,
  updatePositionAction,
  deletePositionAction,
  togglePositionStatusAction,
  onReorderFinish,
}: {
  locale?: "es" | "en";
  department: Department;
  positionsByDepartment: Record<string, Position[]>;
  updateDepartmentAction: (formData: FormData) => Promise<void>;
  deleteDepartmentAction: (formData: FormData) => Promise<void>;
  toggleDepartmentStatusAction: (formData: FormData) => Promise<void>;
  createPositionAction: (formData: FormData) => Promise<void>;
  updatePositionAction: (formData: FormData) => Promise<void>;
  deletePositionAction: (formData: FormData) => Promise<void>;
  togglePositionStatusAction: (formData: FormData) => Promise<void>;
  onReorderFinish: () => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={department}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onReorderFinish}
      className="relative list-none"
    >
      <EditableDepartmentItem
        locale={locale}
        department={department}
        positions={positionsByDepartment[department.id] ?? []}
        updateDepartmentAction={updateDepartmentAction}
        deleteDepartmentAction={deleteDepartmentAction}
        toggleDepartmentStatusAction={toggleDepartmentStatusAction}
        createPositionAction={createPositionAction}
        updatePositionAction={updatePositionAction}
        deletePositionAction={deletePositionAction}
        togglePositionStatusAction={togglePositionStatusAction}
        dragHandleProps={{
          onPointerDown: (event: PointerEvent) => controls.start(event),
        }}
      />
    </Reorder.Item>
  );
}
