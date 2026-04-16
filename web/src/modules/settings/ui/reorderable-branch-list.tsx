"use client";

import { useState, useEffect, useCallback } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { EditableBranchItem } from "./editable-branch-item";
import { reorderBranchesAction } from "@/modules/organizations/actions";

interface Branch {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  sort_order: number;
}

interface ReorderableBranchListProps {
  initialBranches: Branch[];
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  toggleStatusAction: (formData: FormData) => Promise<void>;
}

export function ReorderableBranchList({
  initialBranches,
  updateAction,
  deleteAction,
  toggleStatusAction,
}: ReorderableBranchListProps) {
  const [items, setItems] = useState(initialBranches);

  useEffect(() => {
    setItems(initialBranches);
  }, [initialBranches]);

  const handleReorderFinish = useCallback(async (newOrder: Branch[]) => {
    const ids = newOrder.map((item) => item.id);
    const result = await reorderBranchesAction(ids);
    if (result.ok) {
      toast.success("Orden de locaciones actualizado");
    } else {
      toast.error("Error al sincronizar el orden");
      setItems(initialBranches); // Revert on error
    }
  }, [initialBranches]);

  if (!items?.length) {
    return <p className="text-center py-8 rounded-xl border border-dashed border-[var(--gbp-border2)] text-sm text-[var(--gbp-text2)]">Aun no hay locaciones.</p>;
  }

  return (
    <Reorder.Group
      axis="y"
      values={items}
      onReorder={(newOrder) => setItems(newOrder)}
      className="space-y-3"
    >
      {items.map((branch) => (
        <ReorderItemWrapper
          key={branch.id}
          branch={branch}
          updateAction={updateAction}
          deleteAction={deleteAction}
          toggleStatusAction={toggleStatusAction}
          onReorderFinish={() => handleReorderFinish(items)}
        />
      ))}
    </Reorder.Group>
  );
}

function ReorderItemWrapper({
  branch,
  updateAction,
  deleteAction,
  toggleStatusAction,
  onReorderFinish,
}: any) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={branch}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onReorderFinish}
      className="relative list-none"
    >
      <EditableBranchItem
        branch={branch}
        updateAction={updateAction}
        deleteAction={deleteAction}
        toggleStatusAction={toggleStatusAction}
        dragHandleProps={{
          onPointerDown: (e: any) => controls.start(e)
        }}
      />
    </Reorder.Item>
  );
}
