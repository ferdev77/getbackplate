"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { ScopeSelector } from "@/shared/ui/scope-selector";
import {
  ScopeModalContent,
  ScopeModalDialog,
  ScopeModalHeader,
  ScopeModalDivider,
  ScopeModalField,
  ScopeModalNote,
  ScopeModalSection,
  SCOPE_MODAL_INPUT,
  SCOPE_MODAL_SELECT,
  ScopeModalZones,
  SCOPE_MODAL_FOOTER,
  SCOPE_MODAL_FORM,
  SCOPE_MODAL_PANEL,
} from "@/shared/ui/scope-modal-layout";
import { SubmitButton } from "@/shared/ui/submit-button";
import type { ScopedUserOption } from "@/shared/contracts/scope-options";

type Folder = { id: string; name: string };
type Branch = { id: string; name: string };
type Department = { id: string; name: string };
type Position = { id: string; department_id: string; name: string };
type Employee = ScopedUserOption;
type RecentDocument = { id: string; title: string; branch_id: string | null; created_at: string };

type Props = {
  onClose?: () => void;
  onUploaded?: () => void;
  folders: Folder[];
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  employees: Employee[];
  recentDocuments: RecentDocument[];
  submitEndpoint?: string;
  redirectPath?: string;
  hideScopeSelector?: boolean;
  scopeLockedMessage?: string;
  allowedLocationIds?: string[];
  lockLocationSelection?: boolean;
};

export function UploadDocumentModal({
  onClose,
  onUploaded,
  folders,
  branches,
  departments,
  positions,
  employees,
  recentDocuments,
  submitEndpoint = "/api/company/documents",
  redirectPath = "/app/documents",
  hideScopeSelector = false,
  scopeLockedMessage = "This file will automatically inherit the access scope allowed for your profile.",
  allowedLocationIds,
  lockLocationSelection = false,
}: Props) {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [scopeValid, setScopeValid] = useState(true);
  // Un archivo dentro de una carpeta hereda sus permisos: ahi no hay alcance
  // propio que editar y el modal vuelve a una sola columna.
  const showScopeSelector = !hideScopeSelector && !selectedFolderId;
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, []);

  const closeModal = () => {
    if (onClose) {
      onClose();
      return;
    }
    router.push(redirectPath);
  };

  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isUploading) return;

    const form = event.currentTarget;
    const formData = new FormData(form);

    setProgress(0);
    setShowSuccessOverlay(false);
    setIsClosing(false);
    setIsUploading(true);

    const result = await new Promise<{ ok: boolean; message: string }>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", submitEndpoint);

      xhr.upload.onprogress = (progressEvent) => {
        if (!progressEvent.lengthComputable) return;
        const next = Math.round((progressEvent.loaded / progressEvent.total) * 100);
        setProgress(Math.max(4, Math.min(next, 98)));
      };

      xhr.onerror = () => {
        resolve({ ok: false, message: "No se pudo subir el archivo." });
      };

      xhr.onreadystatechange = () => {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;
        try {
          const data = JSON.parse(xhr.responseText) as { ok?: boolean; error?: string; message?: string };
          if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
          resolve({ ok: true, message: "Archivo subido." });
            return;
          }
          resolve({ ok: false, message: "No se pudo subir el archivo." });
        } catch {
          resolve({ ok: false, message: "El servidor devolvió una respuesta inválida." });
        }
      };

      xhr.send(formData);
    });

    if (!result.ok) {
      toast.error(result.message);
      setIsUploading(false);
      setProgress(0);
      return;
    }

    setProgress(100);
    toast.success("Archivo subido.");
    setShowSuccessOverlay(true);
    setIsUploading(false);

    closeTimerRef.current = setTimeout(() => {
      setIsClosing(true);
    }, 550);

    completeTimerRef.current = setTimeout(() => {
      closeModal();
      onUploaded?.();
      startTransition(() => {
        router.refresh();
      });
    }, 900);
  }

  return (
    <ScopeModalDialog
      onClose={closeModal}
      canClose={!isClosing && !showSuccessOverlay}
      overlayClassName={`fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5 transition-opacity duration-300 ${isClosing ? "pointer-events-none opacity-0" : "opacity-100"}`}
      panelClassName={`relative ${SCOPE_MODAL_PANEL} transition duration-300 ${
        isClosing ? "scale-[0.985] opacity-0" : "scale-100 opacity-100"
      }`}
    >
      <ScopeModalHeader
          title="Subir archivo"
          subtitle="Queda visible para quien esté en el alcance"
          onClose={closeModal}
      />
      <form onSubmit={handleSubmit} className={SCOPE_MODAL_FORM}>
          <ScopeModalZones withScope={showScopeSelector}>
            <ScopeModalContent withScope={showScopeSelector}>
              <ScopeModalSection label="Archivo" />

              <label className="flex shrink-0 cursor-pointer flex-col items-center gap-1 rounded-[11px] border-[1.5px] border-dashed border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-4 py-5 text-center transition hover:border-[var(--gbp-accent)]">
                <strong className="text-[13px] font-bold text-[var(--gbp-text)]">
                  Arrastrá el archivo o hacé clic para elegirlo
                </strong>
                <span className="text-[11.5px] text-[var(--gbp-muted)]">PDF, DOCX, XLSX · hasta 10 MB</span>
                {selectedFileName ? (
                  <span className="mt-1 max-w-full truncate text-[12px] font-semibold text-[var(--gbp-accent)]">
                    {selectedFileName}
                  </span>
                ) : null}
                <input
                  name="file"
                  type="file"
                  required
                  className="sr-only"
                  onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? "")}
                />
              </label>

              <ScopeModalField label="Título (opcional)">
                <input
                  name="title"
                  placeholder="Se usa el nombre del archivo si lo dejás vacío"
                  className={SCOPE_MODAL_INPUT}
                />
              </ScopeModalField>

              <ScopeModalField label="Guardar en carpeta">
                <select
                  name="folder_id"
                  value={selectedFolderId}
                  onChange={(event) => setSelectedFolderId(event.target.value)}
                  className={SCOPE_MODAL_SELECT}
                >
                  <option value="">Sin carpeta</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </ScopeModalField>

              {!showScopeSelector ? (
                <ScopeModalNote>
                  {hideScopeSelector
                    ? scopeLockedMessage
                    : "Este archivo hereda los permisos de la carpeta elegida."}
                </ScopeModalNote>
              ) : null}

              {isUploading ? (
                <div className="shrink-0 rounded-[9px] border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
                  <div className="mb-2 flex items-center justify-between text-[11.5px] text-[var(--gbp-text2)]">
                    <span>Subiendo archivo…</span>
                    <span className="font-semibold tabular-nums">{progress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--gbp-border)]">
                    <div
                      className="h-full rounded-full bg-[var(--gbp-accent)] transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ) : null}

              <ScopeModalDivider />
              <ScopeModalSection label="Subidos recientemente" />
              <div className="flex shrink-0 flex-col gap-1.5">
                {recentDocuments.slice(0, 4).map((document) => {
                  const branchName = document.branch_id ? branchMap.get(document.branch_id) ?? "Locación" : "Global";
                  return (
                    <div
                      key={document.id}
                      className="rounded-[9px] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-[11px] py-[9px]"
                    >
                      <p className="truncate text-[12.5px] font-semibold text-[var(--gbp-text)]">{document.title}</p>
                      <p className="mt-0.5 text-[11px] text-[var(--gbp-muted)]">
                        {branchName} · {new Date(document.created_at).toLocaleDateString("es-AR")}
                      </p>
                    </div>
                  );
                })}
                {!recentDocuments.length ? (
                  <p className="text-[11.5px] text-[var(--gbp-text2)]">Sin cargas recientes.</p>
                ) : null}
              </div>
            </ScopeModalContent>

            {showScopeSelector ? (
              <ScopeSelector
                namespace="upload-modal"
                branches={branches}
                departments={departments}
                positions={positions}
                users={employees}
                locationInputName="location_scope"
                departmentInputName="department_scope"
                positionInputName="position_scope"
                userInputName="user_scope"
                modeInputName="scope_mode"
                question="¿Quién tiene que ver este archivo?"
                audienceLabel="Tendrán acceso"
                onValidityChange={setScopeValid}
                allowedLocationIds={allowedLocationIds}
                lockLocationSelection={lockLocationSelection}
                locationHelperText={lockLocationSelection ? "Tu alcance base queda limitado a tus locaciones asignadas." : undefined}
              />
            ) : null}
          </ScopeModalZones>

          <div className={SCOPE_MODAL_FOOTER}>
            <button type="button" onClick={closeModal} disabled={isClosing || showSuccessOverlay} className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)] disabled:cursor-not-allowed disabled:opacity-50">
              Cancelar
            </button>
            <SubmitButton 
              label="Subir Archivo" 
              pendingLabel="Subiendo..." 
              pending={isUploading} 
              disabled={showSuccessOverlay || !scopeValid}
              className="px-5 py-2 text-sm font-bold"
            />
          </div>
      </form>

      {showSuccessOverlay ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-white/78 backdrop-blur-[1px]">
            <div className="rounded-2xl border border-emerald-200 bg-white px-6 py-5 text-center shadow-[0_16px_40px_rgba(16,185,129,.15)]">
              <CheckCircle2 className="mx-auto h-10 w-10 animate-pulse text-emerald-600" />
              <p className="mt-2 text-sm font-bold text-emerald-700">Archivo subido con éxito</p>
              <p className="mt-1 text-xs text-emerald-700/90">Actualizando vista en tiempo real...</p>
            </div>
          </div>
      ) : null}
    </ScopeModalDialog>
  );
}
