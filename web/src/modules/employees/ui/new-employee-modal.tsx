"use client";

import { useRouter } from "next/navigation";
import { createElement, useEffect, useMemo, useState, startTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/shared/ui/submit-button";
import { PasswordInput } from "@/shared/ui/password-input";

export type ModalBranch = { id: string; name: string };
type ModalDocument = { id: string; title: string; created_at: string };
export type ModalDepartment = { id: string; name: string };
export type ModalPosition = { id: string; department_id: string; name: string; is_active: boolean };

export type EmployeeModalInitialDocument = {
  documentId: string;
  title: string;
  status: string;
  requested_without_file?: boolean;
  uploaded_by_role?: "employee" | "company" | null;
  uploaded_by_label?: string | null;
  review_comment?: string | null;
  expires_at?: string | null;
  reminder_days?: 15 | 30 | 45 | null;
  has_no_expiration?: boolean;
  expiration_configured?: boolean;
  signature_status?: "requested" | "viewed" | "completed" | "declined" | "expired" | "failed" | null;
  signature_embed_src?: string | null;
  signature_requested_at?: string | null;
  signature_completed_at?: string | null;
};

export type EmployeeModalInitialData = {
  id: string;
  organization_user_profile_id?: string;
  first_name: string;
  last_name: string;
  email: string;
  branch_id: string;
  department_id: string;
  position_id: string;
  document_type: string | null;
  document_number: string | null;
  personal_email: string | null;
  phone: string | null;
  address: string | null;
  birth_date: string | null;
  hire_date: string | null;
  contract_type: string | null;
  contract_signed_at: string | null;
  contract_signer_name: string | null;
  salary_amount?: number | null;
  salary_currency?: string | null;
  payment_frequency?: string | null;
  has_dashboard_access?: boolean;
  documents_by_slot?: Record<string, EmployeeModalInitialDocument>;
};

type NewEmployeeModalProps = {
  open: boolean;
  onClose?: () => void;
  companyName: string;
  branches: ModalBranch[];
  departments: ModalDepartment[];
  positions: ModalPosition[];
  publisherName: string;
  mode?: "create" | "edit" | "employee_self";
  initialEmployee?: EmployeeModalInitialData;
  selfProfileUploadEndpoint?: string;
  recentDocuments?: ModalDocument[];
};

type SlotUploadUiState = {
  phase: "idle" | "uploading" | "success" | "error";
  progress: number;
  fileName: string | null;
  message: string | null;
};

type ReviewDecision = "approved" | "rejected";

const DARK_PANEL = "[.theme-dark-pro_&]:border [.theme-dark-pro_&]:border-[var(--gbp-border)] [.theme-dark-pro_&]:bg-[var(--gbp-surface)]";
const DARK_TEXT = "[.theme-dark-pro_&]:text-[var(--gbp-text)]";
const DARK_MUTED = "[.theme-dark-pro_&]:text-[var(--gbp-text2)]";
const DARK_GHOST = "[.theme-dark-pro_&]:border-[var(--gbp-border2)] [.theme-dark-pro_&]:bg-[var(--gbp-surface)] [.theme-dark-pro_&]:text-[var(--gbp-text2)] [.theme-dark-pro_&]:hover:bg-[var(--gbp-surface2)]";
const FIELD_LABEL = "text-[12px] font-bold text-[var(--gbp-text2)]";
const FIELD_INPUT = "w-full rounded-xl border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-4 py-3 text-sm text-[var(--gbp-text)] outline-none transition-all focus:border-[var(--gbp-accent)]";
const APPROVAL_COMMENT_TEMPLATES = [
  "Documento validado y legible.",
  "Aprobado. Cumple con los requisitos solicitados.",
  "Datos verificados correctamente.",
];
const REJECTION_COMMENT_TEMPLATES = [
  "La imagen no es legible. Subir nuevamente con mejor calidad.",
  "Documento vencido. Cargar una versión vigente.",
  "Datos incompletos o no coinciden con el perfil.",
];

function formatDateForUi(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function getReminderSendDate(expiresAt: string | null | undefined, reminderDays: 15 | 30 | 45 | null | undefined): string | null {
  if (!expiresAt || !reminderDays) return null;
  const parsed = new Date(`${expiresAt}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() - reminderDays);
  return parsed.toISOString().slice(0, 10);
}

function isDateExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const parsed = new Date(`${expiresAt}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return parsed.getTime() < todayUtc;
}

function formatDateTimeForUi(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

async function postFormDataWithProgress(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.max(1, Math.min(98, Math.round((event.loaded / event.total) * 100)));
      onProgress(percent);
    };

    xhr.onerror = () => reject(new Error("No se pudo subir el archivo"));
    xhr.onload = () => {
      const payload = xhr.response && typeof xhr.response === "object"
        ? (xhr.response as Record<string, unknown>)
        : {};
      resolve({ status: xhr.status, data: payload });
    };

    xhr.send(formData);
  });
}

export function NewEmployeeModal({
  open,
  onClose,
  companyName,
  branches,
  departments,
  positions,
  mode = "create",
  initialEmployee,
  selfProfileUploadEndpoint = "/api/employee/profile/documents",
}: NewEmployeeModalProps) {
  const isEmployeeSelfMode = mode === "employee_self";
  const [isActionPending, setIsActionPending] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [selectedDept, setSelectedDept] = useState(initialEmployee?.department_id ?? "");
  const [selectedBranch, setSelectedBranch] = useState(initialEmployee?.branch_id ?? "");
  const [selectedPosition, setSelectedPosition] = useState(initialEmployee?.position_id ?? "");
  const [createAccount, setCreateAccount] = useState(Boolean(initialEmployee?.has_dashboard_access));
  const [isEmployeeProfile, setIsEmployeeProfile] = useState(
    isEmployeeSelfMode ? true : initialEmployee?.organization_user_profile_id ? false : mode === "edit",
  );
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(0);
  const [selectedDocumentFiles, setSelectedDocumentFiles] = useState<Record<string, string>>({});
  const [documentsBySlotState, setDocumentsBySlotState] = useState<Record<string, EmployeeModalInitialDocument>>(initialEmployee?.documents_by_slot ?? {});
  const [reviewingBySlot, setReviewingBySlot] = useState<Record<string, boolean>>({});
  const [savingExpirationBySlot, setSavingExpirationBySlot] = useState<Record<string, boolean>>({});
  const [uploadUiBySlot, setUploadUiBySlot] = useState<Record<string, SlotUploadUiState>>({});
  const [signatureActionBySlot, setSignatureActionBySlot] = useState<Record<string, boolean>>({});
  const [reviewDialog, setReviewDialog] = useState<{
    open: boolean;
    slot: string | null;
    decision: ReviewDecision;
    comment: string;
  }>({ open: false, slot: null, decision: "approved", comment: "" });
  const [isReviewDialogSubmitting, setIsReviewDialogSubmitting] = useState(false);
  const [signatureModal, setSignatureModal] = useState<{ open: boolean; slot: string | null; src: string | null }>({ open: false, slot: null, src: null });
  const [docusealReady, setDocusealReady] = useState(false);
  const [docusealLoadFailed, setDocusealLoadFailed] = useState(false);

  const openSignatureInNewTab = () => {
    if (!signatureModal.src) return;
    window.open(signatureModal.src, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (!signatureModal.open || !signatureModal.src) return;
    if (typeof window === "undefined") return;

    setDocusealReady(false);
    setDocusealLoadFailed(false);

    const timeout = window.setTimeout(() => {
      setDocusealLoadFailed(true);
    }, 8000);

    const customElementReady = typeof window.customElements !== "undefined" && window.customElements.get("docuseal-form");
    if (customElementReady) {
      setDocusealReady(true);
      setDocusealLoadFailed(false);
      window.clearTimeout(timeout);
      return;
    }

    const existingScript = document.getElementById("docuseal-form-script") as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        setDocusealReady(true);
        setDocusealLoadFailed(false);
        window.clearTimeout(timeout);
      }, { once: true });
      existingScript.addEventListener("error", () => {
        setDocusealLoadFailed(true);
        window.clearTimeout(timeout);
      }, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "docuseal-form-script";
    script.src = "https://cdn.docuseal.com/js/form.js";
    script.async = true;
    script.onload = () => {
      setDocusealReady(true);
      setDocusealLoadFailed(false);
      window.clearTimeout(timeout);
    };
    script.onerror = () => {
      setDocusealLoadFailed(true);
      window.clearTimeout(timeout);
    };
    document.body.appendChild(script);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [signatureModal.open, signatureModal.src]);

  // Auto-cierre del modal de firma cuando DocuSeal notifica completion via postMessage
  useEffect(() => {
    if (!signatureModal.open) return;

    const expectedOrigin = (() => {
      if (!signatureModal.src) return null;
      try {
        return new URL(signatureModal.src).origin;
      } catch {
        return null;
      }
    })();

    const handler = (event: MessageEvent) => {
      if (expectedOrigin && event.origin !== expectedOrigin) return;

      // DocuSeal puede emitir el evento en distintos formatos según versión del embed
      const isCompleted =
        event.data?.type === "docuseal:completed" ||
        event.data?.event === "completed" ||
        event.data?.completed === true;

      if (!isCompleted) return;

      const slotToRefresh = signatureModal.slot;
      setSignatureModal({ open: false, slot: null, src: null });
      setDocusealReady(false);
      setDocusealLoadFailed(false);

      if (slotToRefresh) {
        toast.success("¡Documento firmado exitosamente!");
        void handleRefreshSignatureStatus(slotToRefresh);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureModal.open, signatureModal.slot, signatureModal.src]);

  const [customDocumentRows, setCustomDocumentRows] = useState<Array<{ id: string; title: string; fileName: string }>>([]);
  const [showAddDocumentTitleBox, setShowAddDocumentTitleBox] = useState(false);
  const [newDocumentTitle, setNewDocumentTitle] = useState("");
  const [isCreatingCustomDocument, setIsCreatingCustomDocument] = useState(false);
  const [firstName, setFirstName] = useState(initialEmployee?.first_name ?? "");
  const [lastName, setLastName] = useState(initialEmployee?.last_name ?? "");
  const [phone, setPhone] = useState(initialEmployee?.phone ?? "");
  const [email, setEmail] = useState(initialEmployee?.email ?? "");
  const [birthDate, setBirthDate] = useState(initialEmployee?.birth_date ?? "");
  const [documentType, setDocumentType] = useState(initialEmployee?.document_type ?? "");
  const [documentNumber, setDocumentNumber] = useState(initialEmployee?.document_number ?? "");
  const [address, setAddress] = useState(initialEmployee?.address ?? "");
  const [hireDate, setHireDate] = useState(initialEmployee?.hire_date ?? "");
  const [contractType, setContractType] = useState(initialEmployee?.contract_type ?? "indefinite");
  const [salaryAmount, setSalaryAmount] = useState(
    initialEmployee?.salary_amount != null ? String(initialEmployee.salary_amount) : "",
  );
  const [paymentFrequency, setPaymentFrequency] = useState(initialEmployee?.payment_frequency ?? "");
  const [contractSignerName, setContractSignerName] = useState(initialEmployee?.contract_signer_name ?? "");
  const [contractSignedAt, setContractSignedAt] = useState(initialEmployee?.contract_signed_at ?? "");

  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }
    router.push("/app/employees");
  };

  useEffect(() => {
    if (!initialEmployee?.documents_by_slot) {
      setSelectedDocumentFiles({});
      return;
    }

    const byName: Record<string, string> = {};
    const rules: Array<{ slot: string; inputName: string }> = [
      { slot: "photo", inputName: "document_file_photo" },
      { slot: "id", inputName: "document_file_id" },
      { slot: "ssn", inputName: "document_file_ssn" },
      { slot: "rec1", inputName: "document_file_rec1" },
      { slot: "rec2", inputName: "document_file_rec2" },
      { slot: "other", inputName: "document_file_other" },
    ];

    for (const rule of rules) {
      const row = initialEmployee.documents_by_slot?.[rule.slot];
      if (!row?.title) continue;
      byName[rule.inputName] = row.title;
    }

    setSelectedDocumentFiles(byName);
  }, [initialEmployee?.documents_by_slot]);

  useEffect(() => {
    setDocumentsBySlotState(initialEmployee?.documents_by_slot ?? {});
  }, [initialEmployee?.documents_by_slot]);

  useEffect(() => {
    setSelectedDept(initialEmployee?.department_id ?? "");
    setSelectedBranch(initialEmployee?.branch_id ?? "");
    setSelectedPosition(initialEmployee?.position_id ?? "");
    setCreateAccount(Boolean(initialEmployee?.has_dashboard_access));
    setIsEmployeeProfile(isEmployeeSelfMode ? true : initialEmployee?.organization_user_profile_id ? false : mode === "edit");
    setFirstName(initialEmployee?.first_name ?? "");
    setLastName(initialEmployee?.last_name ?? "");
    setPhone(initialEmployee?.phone ?? "");
    setEmail(initialEmployee?.email ?? "");
    setBirthDate(initialEmployee?.birth_date ?? "");
    setDocumentType(initialEmployee?.document_type ?? "");
    setDocumentNumber(initialEmployee?.document_number ?? "");
    setAddress(initialEmployee?.address ?? "");
    setHireDate(initialEmployee?.hire_date ?? "");
    setContractType(initialEmployee?.contract_type ?? "indefinite");
    setSalaryAmount(initialEmployee?.salary_amount != null ? String(initialEmployee.salary_amount) : "");
    setPaymentFrequency(initialEmployee?.payment_frequency ?? "");
    setContractSignerName(initialEmployee?.contract_signer_name ?? "");
    setContractSignedAt(initialEmployee?.contract_signed_at ?? "");
  }, [initialEmployee, isEmployeeSelfMode, mode, open]);

  async function handleInstantDocumentUpload(slot: string, inputName: string, file: File | null, customTitle?: string) {
    if (!file) return;

    const isCompanyInstant = !isEmployeeSelfMode && Boolean(initialEmployee?.id);
    if (!isEmployeeSelfMode && !isCompanyInstant) {
      return;
    }

    const endpoint = isEmployeeSelfMode ? selfProfileUploadEndpoint : "/api/company/employees/documents/upload";
    const formData = new FormData();
    formData.set("slot", slot);
    formData.set("file", file);
    if (customTitle) {
      formData.set("customTitle", customTitle);
    }
    if (isCompanyInstant) {
      formData.set("employeeId", initialEmployee?.id ?? "");
    }

    setUploadUiBySlot((prev) => ({
      ...prev,
      [slot]: {
        phase: "uploading",
        progress: 2,
        fileName: file.name,
        message: "Subiendo...",
      },
    }));

    try {
      const { status, data } = await postFormDataWithProgress(endpoint, formData, (percent) => {
        setUploadUiBySlot((prev) => ({
          ...prev,
          [slot]: {
            phase: "uploading",
            progress: percent,
            fileName: file.name,
            message: "Subiendo...",
          },
        }));
      });

      if (status < 200 || status >= 300 || !data.ok || typeof data.slot !== "string" || typeof data.documentId !== "string") {
        throw new Error(typeof data.error === "string" ? data.error : "No se pudo cargar documento");
      }

      const uploadedSlot = data.slot;
      const uploadedStatus = typeof data.status === "string" ? data.status : (isEmployeeSelfMode ? "pending" : "approved");
      const uploadedTitle = typeof data.documentTitle === "string" && data.documentTitle.trim().length > 0 ? data.documentTitle.trim() : file.name;

      setSelectedDocumentFiles((prev) => ({
        ...prev,
        [inputName]: uploadedTitle,
      }));

      setDocumentsBySlotState((prev) => ({
        ...prev,
        [uploadedSlot]: {
          documentId: typeof data.documentId === "string" ? data.documentId : String(data.documentId ?? ""),
          title: uploadedTitle,
          status: uploadedStatus,
          requested_without_file: false,
          uploaded_by_role: isEmployeeSelfMode ? "employee" : "company",
          uploaded_by_label: isEmployeeSelfMode ? "Empleado" : "Administrador",
          review_comment: null,
          expires_at: null,
          reminder_days: null,
          has_no_expiration: false,
          expiration_configured: false,
        },
      }));

      setUploadUiBySlot((prev) => ({
        ...prev,
        [slot]: {
          phase: "success",
          progress: 100,
          fileName: file.name,
          message: "Guardado",
        },
      }));

      toast.success(isEmployeeSelfMode ? "Documento enviado para revision" : "Documento cargado y guardado");
      if (!isEmployeeSelfMode) {
        startTransition(() => {
          router.refresh();
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar documento";
      setUploadUiBySlot((prev) => ({
        ...prev,
        [slot]: {
          phase: "error",
          progress: 0,
          fileName: file.name,
          message,
        },
      }));
      toast.error(message);
    }
  }

  async function handleCreateCustomDocumentRequest(title: string) {
    if (isEmployeeSelfMode || !initialEmployee?.id) return;

    const response = await fetch("/api/company/employees/documents/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: initialEmployee.id,
        title,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok || typeof data?.slot !== "string" || typeof data?.documentId !== "string") {
      throw new Error(typeof data?.error === "string" ? data.error : "No se pudo crear el documento solicitado");
    }

    const uploadedTitle = typeof data.documentTitle === "string" && data.documentTitle.trim().length > 0
      ? data.documentTitle.trim()
      : title;

    setDocumentsBySlotState((prev) => ({
      ...prev,
      [data.slot]: {
        documentId: data.documentId,
        title: uploadedTitle,
        status: "pending",
        requested_without_file: true,
        uploaded_by_role: "company",
        uploaded_by_label: "Administrador",
        review_comment: null,
        expires_at: null,
        reminder_days: null,
        has_no_expiration: false,
        expiration_configured: false,
        signature_status: null,
        signature_embed_src: null,
        signature_requested_at: null,
        signature_completed_at: null,
      },
    }));

    startTransition(() => {
      router.refresh();
    });
  }

  async function handleResendInvitation() {
    const targetEmail = initialEmployee?.email;
    if (!targetEmail) return;
    setIsResending(true);
    try {
      const res = await fetch("/api/company/invitations/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: targetEmail,
          fullName: `${initialEmployee?.first_name ?? ""} ${initialEmployee?.last_name ?? ""}`.trim(),
          roleCode: "employee",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fallback = "No se pudo reenviar la invitación";
        const baseMessage = typeof data.error === "string" ? data.error : fallback;
        const message =
          res.status === 404
            ? `${baseMessage} Si no tiene cuenta creada, primero crea el acceso desde la pestaña Cuenta (App).`
            : baseMessage;
        throw new Error(message);
      }
      toast.success(data.message || `Invitación reenviada a ${targetEmail}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al reenviar invitación");
    } finally {
      setIsResending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isEmployeeSelfMode) {
      return;
    }
    const hasUploading = Object.values(uploadUiBySlot).some((row) => row.phase === "uploading");
    if (hasUploading) {
      toast.error("Espera a que termine la carga de documentos");
      return;
    }
    setIsActionPending(true);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/company/employees", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar el registro");
      }

      toast.success(data.message || (mode === "edit" ? "Registro actualizado correctamente" : "Registro creado correctamente"));
      startTransition(() => {
        router.refresh();
        router.push("/app/employees");
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el registro");
    } finally {
      setIsActionPending(false);
    }
  }

  function openCompanyDocumentReviewDialog(slot: string, decision: ReviewDecision) {
    if (isEmployeeSelfMode) return;
    const row = documentsBySlotState?.[slot];
    if (!row?.documentId || !initialEmployee?.id) return;

    setReviewDialog({
      open: true,
      slot,
      decision,
      comment: row.review_comment ?? "",
    });
  }

  function closeCompanyDocumentReviewDialog() {
    if (isReviewDialogSubmitting) return;
    setReviewDialog({ open: false, slot: null, decision: "approved", comment: "" });
  }

  async function submitCompanyDocumentReview() {
    if (isEmployeeSelfMode) return;
    if (!reviewDialog.slot) return;

    const slot = reviewDialog.slot;
    const decision = reviewDialog.decision;
    const row = documentsBySlotState?.[slot];
    if (!row?.documentId || !initialEmployee?.id) return;

    const comment = reviewDialog.comment.trim();
    if (decision === "rejected" && comment.length === 0) {
      toast.error("Agrega un motivo para el rechazo");
      return;
    }

    setIsReviewDialogSubmitting(true);
    setReviewingBySlot((prev) => ({ ...prev, [slot]: true }));
    try {
      const response = await fetch("/api/company/employees/documents/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: initialEmployee.id,
          documentId: row.documentId,
          decision,
          comment,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar la revisión");
      }

      setDocumentsBySlotState((prev) => ({
        ...prev,
        [slot]: {
          ...prev[slot],
          status: decision,
          review_comment: (typeof data.reviewComment === "string" && data.reviewComment.trim().length > 0)
            ? data.reviewComment.trim()
            : null,
        },
      }));

      setReviewDialog({ open: false, slot: null, decision: "approved", comment: "" });

      toast.success(decision === "approved" ? "Documento aprobado" : "Documento rechazado");
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar la revisión");
    } finally {
      setIsReviewDialogSubmitting(false);
      setReviewingBySlot((prev) => ({ ...prev, [slot]: false }));
    }
  }

  async function handleCompanyDocumentExpirationSave(
    slot: string,
    overrides?: { expires_at: string | null; reminder_days: 15 | 30 | 45 | null; has_no_expiration?: boolean },
  ) {
    if (isEmployeeSelfMode) return;
    const row = documentsBySlotState?.[slot];
    if (!row?.documentId || !initialEmployee?.id) return;
    if (row.status !== "approved") {
      toast.error("Solo puedes configurar vencimiento en documentos aprobados");
      return;
    }

    setSavingExpirationBySlot((prev) => ({ ...prev, [slot]: true }));
    try {
      const response = await fetch("/api/company/employees/documents/expiration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: initialEmployee.id,
          documentId: row.documentId,
          expiresAt: overrides ? overrides.expires_at : (row.expires_at || null),
          reminderDays: overrides ? overrides.reminder_days : (row.reminder_days ?? null),
          noExpiration: overrides ? Boolean(overrides.has_no_expiration) : Boolean(row.has_no_expiration),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar el vencimiento");
      }

      setDocumentsBySlotState((prev) => ({
        ...prev,
        [slot]: {
          ...row,
          expires_at: typeof data.expiresAt === "string" ? data.expiresAt : null,
          reminder_days: data.reminderDays === 15 || data.reminderDays === 30 || data.reminderDays === 45
            ? data.reminderDays
            : null,
          has_no_expiration: data.noExpiration === true,
          expiration_configured: true,
        },
      }));

      toast.success("Vencimiento y recordatorio guardados");
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el vencimiento");
    } finally {
      setSavingExpirationBySlot((prev) => ({ ...prev, [slot]: false }));
    }
  }

  async function handleCompanyDocumentSetNoExpiration(slot: string) {
    await handleCompanyDocumentExpirationSave(slot, { expires_at: null, reminder_days: null, has_no_expiration: true });
  }

  async function handleCompanyRequestSignature(slot: string) {
    if (!initialEmployee?.id) return;
    const row = documentsBySlotState?.[slot];
    if (!row?.documentId) return;

    setSignatureActionBySlot((prev) => ({ ...prev, [slot]: true }));
    try {
      const response = await fetch("/api/company/employees/documents/signature/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: initialEmployee.id, documentId: row.documentId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No se pudo solicitar firma");
      }

      setDocumentsBySlotState((prev) => ({
        ...prev,
        [slot]: {
          ...row,
          signature_status: "requested",
          signature_embed_src: typeof data.signatureEmbedSrc === "string" ? data.signatureEmbedSrc : null,
          signature_requested_at: typeof data.signatureRequestedAt === "string" ? data.signatureRequestedAt : new Date().toISOString(),
          signature_completed_at: null,
        },
      }));
      toast.success("Firma solicitada al empleado");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo solicitar firma");
    } finally {
      setSignatureActionBySlot((prev) => ({ ...prev, [slot]: false }));
    }
  }

  async function handleForceRecreateSignature(slot: string) {
    if (!initialEmployee?.id) return;
    const row = documentsBySlotState?.[slot];
    if (!row?.documentId) return;

    setSignatureActionBySlot((prev) => ({ ...prev, [slot]: true }));
    try {
      const response = await fetch("/api/company/employees/documents/signature/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: initialEmployee.id, documentId: row.documentId, force: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No se pudo recrear la firma");
      }

      const newEmbedSrc = typeof data.signatureEmbedSrc === "string" ? data.signatureEmbedSrc : null;
      setDocumentsBySlotState((prev) => ({
        ...prev,
        [slot]: {
          ...row,
          signature_status: "requested",
          signature_embed_src: newEmbedSrc,
          signature_requested_at: typeof data.signatureRequestedAt === "string" ? data.signatureRequestedAt : new Date().toISOString(),
          signature_completed_at: null,
        },
      }));
      toast.success("Solicitud de firma recreada correctamente");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo recrear la firma");
    } finally {
      setSignatureActionBySlot((prev) => ({ ...prev, [slot]: false }));
    }
  }


  async function handleRefreshSignatureStatus(slot: string) {
    const row = documentsBySlotState?.[slot];
    if (!row?.documentId) return;
    const endpoint = isEmployeeSelfMode
      ? "/api/employee/profile/documents/signature/refresh"
      : "/api/company/employees/documents/signature/refresh";

    setSignatureActionBySlot((prev) => ({ ...prev, [slot]: true }));
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEmployeeSelfMode
            ? { documentId: row.documentId }
            : { employeeId: initialEmployee?.id, documentId: row.documentId },
        ),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar estado de firma");
      }

      setDocumentsBySlotState((prev) => ({
        ...prev,
        [slot]: {
          ...row,
          signature_status: typeof data.signatureStatus === "string" ? data.signatureStatus as EmployeeModalInitialDocument["signature_status"] : row.signature_status,
          signature_completed_at: typeof data.signatureCompletedAt === "string" ? data.signatureCompletedAt : row.signature_completed_at,
        },
      }));

      toast.success("Estado de firma actualizado");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar estado de firma");
    } finally {
      setSignatureActionBySlot((prev) => ({ ...prev, [slot]: false }));
    }
  }

  const filteredPositions = useMemo(() => {
    return positions.filter((p) => p.department_id === selectedDept && p.is_active);
  }, [positions, selectedDept]);

  const branchNameById = useMemo(() => new Map(branches.map((row) => [row.id, row.name])), [branches]);
  const departmentNameById = useMemo(() => new Map(departments.map((row) => [row.id, row.name])), [departments]);
  const positionNameById = useMemo(() => new Map(positions.map((row) => [row.id, row.name])), [positions]);

  const employeeFullName = `${firstName} ${lastName}`.trim() || "[Nombre del empleado]";
  const previewBranch = selectedBranch ? (branchNameById.get(selectedBranch) ?? "Sin locación") : "Sin locación";
  const previewDepartment = selectedDept ? (departmentNameById.get(selectedDept) ?? "Sin departamento") : "Sin departamento";
  const previewPosition = selectedPosition ? (positionNameById.get(selectedPosition) ?? "Puesto no definido") : "Puesto no definido";
  const previewHireDate = hireDate
    ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${hireDate}T00:00:00`))
    : "[Fecha de ingreso]";

  const contractTypeLabelMap: Record<string, string> = {
    indefinite: "Indeterminado",
    fixed_term: "Plazo fijo",
    seasonal: "Temporada",
    internship: "Pasantía",
  };

  const paymentFrequencyLabelMap: Record<string, string> = {
    hora: "Por hora",
    semana: "Semanal",
    quincena: "Quincenal",
    mes: "Mensual",
  };

  const previewContractType = contractTypeLabelMap[contractType] ?? "[Tipo de contrato]";
  const previewPaymentFrequency = paymentFrequencyLabelMap[paymentFrequency] ?? "[Frecuencia de pago]";
  const salaryCurrency = initialEmployee?.salary_currency ?? "USD";
  const salaryNumeric = salaryAmount.trim() ? Number(salaryAmount) : NaN;
  const previewSalary = Number.isFinite(salaryNumeric)
    ? new Intl.NumberFormat("es-ES", { style: "currency", currency: salaryCurrency }).format(salaryNumeric)
    : "[Salario]";

  const contractReady =
    Boolean(firstName.trim()) &&
    Boolean(lastName.trim()) &&
    Boolean(selectedBranch) &&
    Boolean(selectedDept) &&
    Boolean(selectedPosition) &&
    Boolean(hireDate) &&
    Boolean(contractType) &&
    Number.isFinite(salaryNumeric) &&
    salaryNumeric > 0 &&
    Boolean(paymentFrequency);

  async function buildContractPdf() {
    const { jsPDF } = await import("jspdf");

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 46;
    let y = 58;

    doc.setDrawColor(212, 83, 26);
    doc.setLineWidth(2);
    doc.line(margin, 36, pageWidth - margin, 36);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(18, 34, 52);
    doc.text("Contrato Laboral", margin, y);

    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(96, 109, 128);
    const generatedAt = new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date());
    doc.text(`Empresa: ${companyName}  |  Generado: ${generatedAt}`, margin, y);

    y += 28;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(44, 55, 72);
    const contractBody = `El presente contrato se celebra entre ${employeeFullName} y la empresa ${companyName}, para desempeñar funciones como ${previewPosition} en ${previewBranch}, área ${previewDepartment}, con cumplimiento de las políticas internas.`;
    const bodyLines = doc.splitTextToSize(contractBody, pageWidth - margin * 2);
    doc.text(bodyLines, margin, y);

    y += bodyLines.length * 14 + 24;

    const boxX = margin;
    const boxW = pageWidth - margin * 2;
    const boxH = 132;
    doc.setFillColor(250, 250, 252);
    doc.setDrawColor(223, 228, 236);
    doc.roundedRect(boxX, y, boxW, boxH, 10, 10, "FD");

    const leftX = boxX + 16;
    const rightX = boxX + boxW / 2 + 8;
    let rowY = y + 24;

    const drawMetaRow = (x: number, label: string, value: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(96, 109, 128);
      doc.text(label.toUpperCase(), x, rowY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(24, 35, 54);
      doc.text(value, x, rowY + 16);
    };

    drawMetaRow(leftX, "Fecha de ingreso", previewHireDate);
    drawMetaRow(rightX, "Tipo de contrato", previewContractType);
    rowY += 50;
    drawMetaRow(leftX, "Salario base", previewSalary);
    drawMetaRow(rightX, "Frecuencia de pago", previewPaymentFrequency);

    y += boxH + 28;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(118, 126, 141);
    doc.text("Documento de vista previa generado desde el panel de Recursos Humanos.", margin, y);

    return doc;
  }

  async function openContractPreview() {
    if (!contractReady) return;
    try {
      const pdf = await buildContractPdf();
      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      toast.error("No se pudo generar la vista previa del contrato");
    }
  }

  async function downloadContractPreview() {
    if (!contractReady) return;
    try {
      const pdf = await buildContractPdf();
      const fileBase = employeeFullName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-") || "empleado";
      pdf.save(`contrato-${fileBase}.pdf`);
    } catch {
      toast.error("No se pudo descargar el contrato en PDF");
    }
  }

  const tabs = useMemo(
    () => [
      { key: "personal", label: "Info Personal" },
      { key: "documents", label: "Documentos" },
      ...(isEmployeeProfile ? [{ key: "contract", label: "Contrato" }] : []),
      ...(isEmployeeSelfMode ? [] : [{ key: "account", label: "Cuenta (App)" }]),
    ],
    [isEmployeeProfile, isEmployeeSelfMode],
  );

  const currentTabIndex = activeTab <= tabs.length - 1 ? activeTab : 0;
  const isDocumentsTabActive = tabs[currentTabIndex]?.key === "documents";
  const requiresAccountPassword = createAccount && !(mode === "edit" && initialEmployee?.has_dashboard_access);

  if (!open) return null;

  const confirmAddCustomDocumentRow = async () => {
    if (isCreatingCustomDocument) return;
    const safeTitle = newDocumentTitle.trim();
    if (!safeTitle) return;

    if (!isEmployeeSelfMode && initialEmployee?.id) {
      setIsCreatingCustomDocument(true);
      const loadingToastId = toast.loading("Creando documento solicitado...");
      try {
        await handleCreateCustomDocumentRequest(safeTitle);
        toast.success("Documento solicitado creado. El empleado ya puede subirlo.", { id: loadingToastId });
        setNewDocumentTitle("");
        setShowAddDocumentTitleBox(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo crear el documento solicitado", { id: loadingToastId });
      } finally {
        setIsCreatingCustomDocument(false);
      }
      return;
    }

    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setCustomDocumentRows((prev) => [...prev, { id, title: safeTitle, fileName: "" }]);
    setNewDocumentTitle("");
    setShowAddDocumentTitleBox(false);
  };

  const openAddCustomDocumentRow = () => {
    if (isCreatingCustomDocument) return;
    setShowAddDocumentTitleBox(true);
    setNewDocumentTitle("");
  };

  const updateCustomDocumentRow = (id: string, patch: Partial<{ fileName: string }>) => {
    setCustomDocumentRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className={`relative flex h-full max-h-[90vh] w-full max-w-[850px] flex-col overflow-hidden rounded-[24px] bg-white shadow-2xl ${DARK_PANEL}`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--gbp-border)] p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-[var(--gbp-accent)]" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <h2 className={`text-xl font-bold tracking-tight text-[var(--gbp-text)] ${DARK_TEXT}`} style={{ fontFamily: 'Georgia, serif' }}>
              {isEmployeeSelfMode ? "Mi Perfil" : mode === "edit" ? "Editar Usuario / Empleado" : "Nuevo Usuario / Empleado"}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-[var(--gbp-muted)] transition-colors hover:bg-[var(--gbp-bg)] hover:text-[var(--gbp-text)] ${DARK_GHOST}`}
          >
            <span className="text-xl">✕</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-between border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-6">
          <div className="flex">
            {tabs.map((tab, idx) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(idx)}
                data-testid={`employee-tab-${tab.key}`}
                className={`border-b-2 px-4 py-4 text-sm font-semibold transition-all ${
                  currentTabIndex === idx
                    ? "border-brand text-brand"
                    : `border-transparent text-[var(--gbp-text2)] hover:text-[var(--gbp-text)] ${DARK_MUTED}`
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {isDocumentsTabActive && !isEmployeeSelfMode ? (
            <div className="relative">
              <button
                type="button"
                onClick={openAddCustomDocumentRow}
                disabled={isCreatingCustomDocument}
                data-testid="add-document-btn"
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-2.5 py-1 text-[10px] font-semibold text-[var(--gbp-text2)] hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isCreatingCustomDocument ? (
                  <>
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-r-transparent" />
                    Agregando...
                  </>
                ) : (
                  <>
                    <span className="text-[12px] leading-none">+</span>
                    Agregar documento
                  </>
                )}
              </button>

              {showAddDocumentTitleBox ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-[290px] rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-3 shadow-xl">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--gbp-muted)]">Nuevo documento</p>
                  <input
                    value={newDocumentTitle}
                    onChange={(event) => setNewDocumentTitle(event.target.value)}
                    disabled={isCreatingCustomDocument}
                    data-testid="add-document-title-input"
                    onKeyDown={(event) => {
                      if (isCreatingCustomDocument) return;
                      if (event.key === "Enter") {
                        event.preventDefault();
                        confirmAddCustomDocumentRow();
                      }
                      if (event.key === "Escape") {
                        setShowAddDocumentTitleBox(false);
                      }
                    }}
                    className="w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none focus:border-[var(--gbp-accent)]"
                    placeholder="Ej. Licencia Sanitaria"
                    autoFocus
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (isCreatingCustomDocument) return;
                        setShowAddDocumentTitleBox(false);
                      }}
                      disabled={isCreatingCustomDocument}
                      className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={confirmAddCustomDocumentRow}
                      disabled={!newDocumentTitle.trim() || isCreatingCustomDocument}
                      data-testid="confirm-add-document-btn"
                      className="inline-flex items-center gap-1 rounded-md bg-[var(--gbp-accent)] px-2.5 py-1 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isCreatingCustomDocument ? (
                        <>
                          <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-r-transparent" />
                          Agregando...
                        </>
                      ) : (
                        "Agregar"
                      )}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {mode === "edit" && initialEmployee ? (
            <input type="hidden" name="employee_id" value={initialEmployee.id} />
          ) : null}
          {initialEmployee?.organization_user_profile_id ? (
            <input type="hidden" name="organization_user_profile_id" value={initialEmployee.organization_user_profile_id} />
          ) : null}
          <input type="hidden" name="create_mode" value={createAccount ? "with_account" : "without_account"} />
          <input type="hidden" name="is_employee" value={isEmployeeProfile ? "yes" : "no"} />
          <input type="hidden" name="existing_dashboard_access" value={initialEmployee?.has_dashboard_access ? "yes" : "no"} />

          <div className="flex-1 overflow-y-auto bg-[var(--gbp-surface)] p-8">
            {/* TAB 0 - Info Personal */}
            <div className={currentTabIndex === tabs.findIndex((tab) => tab.key === "personal") ? "block" : "hidden"}>
              <fieldset disabled={isEmployeeSelfMode} className={isEmployeeSelfMode ? "opacity-90" : ""}>
              <h3 className={`mb-4 border-b border-[var(--gbp-border)] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--gbp-muted)] ${DARK_MUTED}`}>
                Información Personal
              </h3>
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => {
                    if (mode === "edit" || isEmployeeSelfMode) return;
                    setIsEmployeeProfile((prev) => !prev);
                  }}
                  disabled={mode === "edit" || isEmployeeSelfMode}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    isEmployeeProfile
                      ? "border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,var(--gbp-border))] bg-[var(--gbp-accent-glow)]"
                      : "border-[var(--gbp-border)] bg-[var(--gbp-surface)]"
                  } ${mode === "edit" || isEmployeeSelfMode ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:border-[var(--gbp-accent)]"}`}
                  role="switch"
                  aria-checked={isEmployeeProfile}
                  aria-label="Perfil de empleado"
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                        isEmployeeProfile
                          ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent)] text-white"
                          : "border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-transparent"
                      }`}
                    >
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M3.5 8.2 6.6 11.3 12.5 5.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="text-sm font-semibold text-[var(--gbp-text)]">Perfil de empleado</span>
                  </span>
                  <span className="text-xs font-semibold text-[var(--gbp-text2)]">{isEmployeeProfile ? "Si" : "No"}</span>
                </button>
              </div>
              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Nombre(s) *</label>
                  <input
                    name="first_name"
                    required
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className={FIELD_INPUT}
                    placeholder="Juan"
                  />
                </div>
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Apellidos *</label>
                  <input
                    name="last_name"
                    required
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className={FIELD_INPUT}
                    placeholder="García López"
                  />
                </div>
              </div>

              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Teléfono *</label>
                  <input
                    name="phone"
                    required
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className={FIELD_INPUT}
                    placeholder="+1 228 555 0000"
                  />
                </div>
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Email *</label>
                  <input
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={FIELD_INPUT}
                    placeholder="usuario@empresa.com"
                  />
                </div>
              </div>

              {isEmployeeProfile ? (
                <>
                  <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
                    <div className="space-y-2">
                      <label className={FIELD_LABEL}>Fecha Nacimiento</label>
                      <input
                        name="birth_date"
                        type="date"
                        value={birthDate}
                        onChange={(event) => setBirthDate(event.target.value)}
                        className={FIELD_INPUT}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={FIELD_LABEL}>Tipo de Documento</label>
                      <select
                        name="document_type"
                        value={documentType}
                        onChange={(event) => setDocumentType(event.target.value)}
                        className={`${FIELD_INPUT} appearance-none`}
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat' }}
                      >
                        <option value="">—</option>
                        <option value="dni">DNI</option>
                        <option value="cuil">CUIL / CUIT</option>
                        <option value="ssn">SSN / ITIN</option>
                        <option value="passport">Pasaporte</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className={FIELD_LABEL}>Número de Documento</label>
                      <input
                        name="document_number"
                        value={documentNumber}
                        onChange={(event) => setDocumentNumber(event.target.value)}
                        className={FIELD_INPUT}
                        placeholder="00.000.000"
                      />
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="space-y-2">
                      <label className={FIELD_LABEL}>Dirección Completa</label>
                      <input
                        name="address"
                        value={address}
                        onChange={(event) => setAddress(event.target.value)}
                        className={FIELD_INPUT}
                        placeholder="Calle, Número, Ciudad, Estado, País"
                      />
                    </div>
                  </div>
                </>
              ) : null}

              <h3 className="mb-4 mt-8 border-b border-[var(--gbp-border)] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--gbp-muted)]">
                Información Laboral
              </h3>
              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Locación / Sucursal</label>
                  <select
                    name="branch_id"
                    value={selectedBranch}
                    onChange={(event) => setSelectedBranch(event.target.value)}
                    className={`${FIELD_INPUT} appearance-none`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat' }}
                  >
                    <option value="">— Selecciona locación —</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Departamento</label>
                  <select
                    name="department_id"
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className={`${FIELD_INPUT} appearance-none`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat' }}
                  >
                    <option value="">— Selecciona departamento —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Puesto</label>
                  <select
                    name="position_id"
                    value={selectedPosition}
                    onChange={(event) => setSelectedPosition(event.target.value)}
                    className={`${FIELD_INPUT} appearance-none`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat' }}
                  >
                    <option value="">
                      {selectedDept ? "— Selecciona un puesto —" : "Selecciona departamento primero"}
                    </option>
                    {filteredPositions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              </fieldset>
            </div>

            {/* TAB 1 - Documentos */}
            <div className={currentTabIndex === tabs.findIndex((tab) => tab.key === "documents") ? "block" : "hidden"}>
              <h3 className="mb-6 border-b border-[var(--gbp-border)] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--gbp-muted)]">
                Documentos del Empleado
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {(() => {
                  const standardDocs = [
                    { id: "empInputFoto", slot: "photo", name: "document_file_photo", icon: "📷", label: "Foto del Empleado" },
                    { id: "empInputId", slot: "id", name: "document_file_id", icon: "🪪", label: "ID / Identificación" },
                    { id: "empInputSs", slot: "ssn", name: "document_file_ssn", icon: "📋", label: "SSN / EAD" },
                    { id: "empInputRec1", slot: "rec1", name: "document_file_rec1", icon: "📄", label: "Food Handler Certificate" },
                    { id: "empInputRec2", slot: "rec2", name: "document_file_rec2", icon: "📄", label: "Alcohol Server Certificate" },
                    { id: "empInputOther", slot: "other", name: "document_file_other", icon: "📄", label: "Food Protection Manager" },
                  ];
                
                  const customDocsMerged = Object.keys(documentsBySlotState)
                    .filter((slot) => slot.startsWith("custom_"))
                    .map((slot) => {
                      const row = documentsBySlotState[slot];
                      return {
                        id: `empInputCustom_${slot}`,
                        slot: slot,
                        name: `document_file_${slot}`,
                        icon: "📄",
                        label: row.title || "Documento Adicional",
                      };
                    });
                
                  const allDocs = [...standardDocs, ...customDocsMerged];
                  return allDocs;
                })().map((doc) => {
                  const row = documentsBySlotState?.[doc.slot];
                  const hasUploadedFile = Boolean(row?.documentId) && !row?.requested_without_file;
                  return (
                  <div
                    key={doc.id}
                    onClick={() => {
                      if (isActionPending) return;
                      document.getElementById(doc.id)?.click();
                    }}
                    className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all hover:border-[var(--gbp-accent)] hover:bg-[var(--gbp-bg)] ${selectedDocumentFiles[doc.name] ? "border-[var(--gbp-success)] bg-[var(--gbp-success-soft)]" : "border-[var(--gbp-border2)]"}`}
                  >
                    <input
                      type="file"
                      id={doc.id}
                      name={doc.name}
                      accept="image/*,.pdf"
                      disabled={isActionPending}
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        const fileName = file?.name ?? "";
                        setSelectedDocumentFiles((prev) => ({
                          ...prev,
                          [doc.name]: fileName,
                        }));
                        if (isEmployeeSelfMode || initialEmployee?.id) {
                          const customTitle = doc.slot.startsWith("custom_") ? doc.label : undefined;
                          void handleInstantDocumentUpload(doc.slot, doc.name, file, customTitle);
                          event.currentTarget.value = "";
                        }
                      }}
                    />
                    <span className="mb-3 text-4xl transition-transform group-hover:scale-110">{doc.icon}</span>
                    <span className="text-center text-[13px] font-bold text-[var(--gbp-text2)]">{doc.label}</span>
                    {hasUploadedFile ? (
                      <div className="mt-2 flex items-center gap-2">
                        <a
                          href={`/api/documents/${row?.documentId}/download`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-md border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--gbp-success)] hover:bg-[var(--gbp-success-soft)]"
                        >
                          Ver
                        </a>
                        <a
                          href={`/api/documents/${row?.documentId}/download`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-md border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--gbp-success)] hover:bg-[var(--gbp-success-soft)]"
                        >
                          Descargar
                        </a>
                        {(() => {
                          if (!row) return null;
                          const expired = row.status === "approved" && !row.has_no_expiration && isDateExpired(row.expires_at);
                          const label = expired
                            ? "⚠ Vencido"
                            : row.status === "approved"
                              ? "Aprobado"
                              : row.status === "rejected"
                                ? "Rechazado"
                                : "Pendiente";
                          const tone = expired
                            ? "border-amber-300 bg-amber-50 text-amber-700"
                            : row.status === "approved"
                              ? "border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]"
                              : row.status === "rejected"
                                ? "border-red-300 bg-red-50 text-red-700"
                                : "border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)]";
                          return (
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
                              {label}
                            </span>
                          );
                        })()}
                      </div>
                    ) : null}
                    {row?.requested_without_file ? (
                      <p className="mt-1 text-center text-[10px] font-semibold text-[var(--gbp-text2)]">
                        Documento solicitado (pendiente de carga)
                      </p>
                    ) : null}
                    {hasUploadedFile && documentsBySlotState?.[doc.slot]?.uploaded_by_label ? (
                      <p className="mt-1 text-center text-[10px] font-semibold text-[var(--gbp-text2)]">
                        Cargado por: {documentsBySlotState[doc.slot].uploaded_by_label}
                      </p>
                    ) : null}
                    {hasUploadedFile && documentsBySlotState?.[doc.slot]?.review_comment ? (
                      <p className="mt-1 max-w-[250px] text-center text-[10px] text-[var(--gbp-text2)]">
                        Comentario: {documentsBySlotState[doc.slot].review_comment}
                      </p>
                    ) : null}
                    {hasUploadedFile && documentsBySlotState?.[doc.slot]?.expires_at ? (
                      <p className="mt-1 text-center text-[10px] font-semibold text-[var(--gbp-text2)]">
                        Vence: {formatDateForUi(documentsBySlotState[doc.slot].expires_at)}
                      </p>
                    ) : null}
                    {hasUploadedFile && documentsBySlotState?.[doc.slot]?.has_no_expiration ? (
                      <p className="mt-1 text-center text-[10px] font-semibold text-[var(--gbp-text2)]">
                        Documento sin vencimiento
                      </p>
                    ) : null}
                    {hasUploadedFile && (() => {
                      const row = documentsBySlotState?.[doc.slot];
                      const reminderSendDate = getReminderSendDate(row?.expires_at, row?.reminder_days ?? null);
                      if (!row?.reminder_days || !reminderSendDate) return null;
                      return (
                        <p suppressHydrationWarning className="mt-1 text-center text-[10px] font-semibold text-[var(--gbp-text2)]">
                          Aviso recordatorio: {row.reminder_days} dias antes ({formatDateForUi(reminderSendDate)})
                        </p>
                      );
                    })()}
                    {hasUploadedFile && documentsBySlotState?.[doc.slot]?.signature_status ? (
                      <p suppressHydrationWarning className="mt-1 text-center text-[10px] font-semibold text-[var(--gbp-text2)]">
                        Firma: {documentsBySlotState[doc.slot].signature_status === "completed"
                          ? "Firmado"
                          : documentsBySlotState[doc.slot].signature_status === "viewed"
                            ? "Vista"
                          : documentsBySlotState[doc.slot].signature_status === "requested"
                            ? "Solicitada"
                            : documentsBySlotState[doc.slot].signature_status === "declined"
                              ? "Rechazada"
                              : documentsBySlotState[doc.slot].signature_status === "expired"
                                ? "Expirada"
                                : "Error"}
                        {documentsBySlotState[doc.slot].signature_completed_at
                          ? ` (${formatDateTimeForUi(documentsBySlotState[doc.slot].signature_completed_at)})`
                          : documentsBySlotState[doc.slot].signature_requested_at
                            ? ` (${formatDateTimeForUi(documentsBySlotState[doc.slot].signature_requested_at)})`
                            : ""}
                      </p>
                    ) : null}
                    {!isEmployeeSelfMode && hasUploadedFile && documentsBySlotState?.[doc.slot]?.status === "approved" && documentsBySlotState?.[doc.slot]?.expiration_configured && documentsBySlotState?.[doc.slot]?.signature_status !== "completed" && documentsBySlotState?.[doc.slot]?.signature_status !== "requested" && documentsBySlotState?.[doc.slot]?.signature_status !== "viewed" ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleCompanyRequestSignature(doc.slot);
                        }}
                        disabled={Boolean(signatureActionBySlot[doc.slot])}
                        className="mt-2 rounded-md border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--gbp-accent)] hover:bg-[var(--gbp-bg)] disabled:opacity-60"
                      >
                        Solicitar firma
                      </button>
                    ) : null}
                    {isEmployeeSelfMode && hasUploadedFile && (documentsBySlotState?.[doc.slot]?.signature_status === "requested" || documentsBySlotState?.[doc.slot]?.signature_status === "viewed") && documentsBySlotState?.[doc.slot]?.signature_embed_src ? (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDocusealReady(false);
                            setDocusealLoadFailed(false);
                            setSignatureModal({ open: true, slot: doc.slot, src: documentsBySlotState[doc.slot].signature_embed_src ?? null });
                          }}
                          className="rounded-md border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--gbp-accent)] hover:bg-[var(--gbp-bg)]"
                        >
                          Firmar ahora
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleRefreshSignatureStatus(doc.slot);
                          }}
                          disabled={Boolean(signatureActionBySlot[doc.slot])}
                          className="rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)] disabled:opacity-60"
                        >
                          Actualizar firma
                        </button>
                      </div>
                    ) : null}
                    {!isEmployeeSelfMode && hasUploadedFile && (documentsBySlotState?.[doc.slot]?.signature_status === "requested" || documentsBySlotState?.[doc.slot]?.signature_status === "viewed") ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleRefreshSignatureStatus(doc.slot);
                          }}
                          disabled={Boolean(signatureActionBySlot[doc.slot])}
                          className="rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)] disabled:opacity-60"
                        >
                          Actualizar firma
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleForceRecreateSignature(doc.slot);
                          }}
                          disabled={Boolean(signatureActionBySlot[doc.slot])}
                          title="Re-crea la solicitud en DocuSeal si el documento no se ve correctamente"
                          className="rounded-md border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--gbp-accent)] hover:bg-[var(--gbp-bg)] disabled:opacity-60"
                        >
                          Re-solicitar firma
                        </button>
                      </div>
                    ) : null}
                    {!isEmployeeSelfMode && hasUploadedFile && documentsBySlotState?.[doc.slot]?.status === "approved" && !documentsBySlotState?.[doc.slot]?.expiration_configured ? (
                      <div className="mt-3 w-full space-y-2 rounded-xl border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] p-3" onClick={(event) => event.stopPropagation()}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--gbp-text2)]">Vencimiento y recordatorio</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <label className="text-left text-[10px] text-[var(--gbp-text2)]">
                            Fecha de vencimiento
                            <input
                              type="date"
                              value={documentsBySlotState[doc.slot].expires_at ?? ""}
                              onChange={(event) => {
                                const value = event.target.value.trim() || null;
                                setDocumentsBySlotState((prev) => ({
                                  ...prev,
                                  [doc.slot]: {
                                    ...prev[doc.slot],
                                    expires_at: value,
                                    reminder_days: value ? prev[doc.slot]?.reminder_days ?? null : null,
                                    has_no_expiration: false,
                                  },
                                }));
                              }}
                              className="mt-1 w-full rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-2 py-1 text-[11px] text-[var(--gbp-text)]"
                            />
                          </label>
                          <label className="text-left text-[10px] text-[var(--gbp-text2)]">
                            Recordatorio
                            <select
                              value={documentsBySlotState[doc.slot].reminder_days?.toString() ?? ""}
                              onChange={(event) => {
                                const value = event.target.value;
                                setDocumentsBySlotState((prev) => ({
                                  ...prev,
                                  [doc.slot]: {
                                    ...prev[doc.slot],
                                    reminder_days: value === "15" || value === "30" || value === "45"
                                      ? Number(value) as 15 | 30 | 45
                                      : null,
                                    has_no_expiration: false,
                                  },
                                }));
                              }}
                              disabled={!documentsBySlotState[doc.slot].expires_at}
                              className="mt-1 w-full rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-2 py-1 text-[11px] text-[var(--gbp-text)] disabled:opacity-60"
                            >
                              <option value="">Sin recordatorio</option>
                              <option value="15">15 dias antes</option>
                              <option value="30">30 dias antes</option>
                              <option value="45">45 dias antes</option>
                            </select>
                          </label>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void handleCompanyDocumentSetNoExpiration(doc.slot);
                            }}
                            disabled={Boolean(savingExpirationBySlot[doc.slot])}
                            className="rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)] disabled:opacity-60"
                          >
                            Sin vencimiento
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void handleCompanyDocumentExpirationSave(doc.slot);
                            }}
                            disabled={Boolean(savingExpirationBySlot[doc.slot])}
                            className="rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)] disabled:opacity-60"
                          >
                            Guardar vencimiento
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {!isEmployeeSelfMode && hasUploadedFile && documentsBySlotState?.[doc.slot]?.uploaded_by_role === "employee" && documentsBySlotState?.[doc.slot]?.status === "pending" ? (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openCompanyDocumentReviewDialog(doc.slot, "approved");
                          }}
                          disabled={Boolean(reviewingBySlot[doc.slot])}
                          className="rounded-md border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-surface)] px-2 py-1 text-[10px] font-semibold text-[var(--gbp-success)] hover:bg-[var(--gbp-success-soft)] disabled:opacity-60"
                        >
                          Aprobar
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openCompanyDocumentReviewDialog(doc.slot, "rejected");
                          }}
                          disabled={Boolean(reviewingBySlot[doc.slot])}
                          className="rounded-md border border-red-300 bg-[var(--gbp-surface)] px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          Rechazar
                        </button>
                      </div>
                    ) : null}
                    {uploadUiBySlot[doc.slot]?.phase === "uploading" ? (
                      <div className="mt-3 w-full max-w-[260px]" onClick={(event) => event.stopPropagation()}>
                        <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-[var(--gbp-text2)]">
                          <span>Subiendo...</span>
                          <span>{uploadUiBySlot[doc.slot]?.progress ?? 0}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--gbp-border2)]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[var(--gbp-accent)] via-[var(--gbp-success)] to-[var(--gbp-accent)] transition-all duration-300"
                            style={{ width: `${uploadUiBySlot[doc.slot]?.progress ?? 0}%` }}
                          />
                        </div>
                        {uploadUiBySlot[doc.slot]?.fileName ? (
                          <p className="mt-2 line-clamp-1 text-center text-[11px] font-semibold text-[var(--gbp-text2)]">
                            {uploadUiBySlot[doc.slot]?.fileName}
                          </p>
                        ) : null}
                      </div>
                    ) : uploadUiBySlot[doc.slot]?.phase === "success" ? (
                      <>
                        <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--gbp-success)] text-[13px] text-white shadow-lg shadow-[color:color-mix(in_oklab,var(--gbp-success)_45%,transparent)] transition-transform duration-300 animate-[pulse_900ms_ease-out_1]">
                          ✓
                        </div>
                        <p className="mt-2 line-clamp-1 max-w-[220px] text-center text-[11px] font-semibold text-[var(--gbp-success)]">
                          {uploadUiBySlot[doc.slot]?.fileName || selectedDocumentFiles[doc.name]}
                        </p>
                      </>
                    ) : uploadUiBySlot[doc.slot]?.phase === "error" ? (
                      <p className="mt-2 max-w-[220px] text-center text-[11px] font-semibold text-red-600">
                        {uploadUiBySlot[doc.slot]?.message || "Error al subir"}
                      </p>
                    ) : selectedDocumentFiles[doc.name] ? (
                      <>
                        <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-[12px] text-white">
                          ✓
                        </div>
                        <p className="mt-2 line-clamp-1 max-w-[220px] text-center text-[11px] font-semibold text-[var(--gbp-success)]">
                          {selectedDocumentFiles[doc.name]}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-center text-[11px] text-[var(--gbp-muted)]">
                        {isEmployeeSelfMode || initialEmployee?.id ? "Haz clic para adjuntar y subir" : "Haz clic para adjuntar"}
                      </p>
                    )}
                  </div>
                );
                })}
                {!isEmployeeSelfMode && customDocumentRows
                  .filter((row) => !documentsBySlotState[`custom_${row.id}`])
                  .map((row) => (
                  <div
                    key={row.id}
                    onClick={() => document.getElementById(`customInput-${row.id}`)?.click()}
                    className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all hover:border-[var(--gbp-accent)] hover:bg-[var(--gbp-bg)] ${row.fileName ? "border-[var(--gbp-success)] bg-[var(--gbp-success-soft)]" : "border-[var(--gbp-border2)]"}`}
                  >
                    <input type="hidden" name="custom_document_title" value={row.title} />
                    <input
                      type="file"
                      id={`customInput-${row.id}`}
                      name="custom_document_file"
                      accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        const fileName = file?.name ?? "";
                        updateCustomDocumentRow(row.id, { fileName });
                        if (initialEmployee?.id) {
                          void handleInstantDocumentUpload(`custom_${row.id}`, "custom_document_file", file, row.title);
                          event.currentTarget.value = "";
                        }
                      }}
                    />

                    <span className="mb-3 text-4xl transition-transform group-hover:scale-110">📄</span>
                    <span className="text-center text-[13px] font-bold text-[var(--gbp-text2)]">{row.title}</span>

                    {row.fileName ? (
                      <>
                        <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-[12px] text-white">
                          ✓
                        </div>
                        <p className="mt-2 line-clamp-1 max-w-[220px] text-center text-[11px] font-semibold text-[var(--gbp-success)]">
                          {row.fileName}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-center text-[11px] text-[var(--gbp-muted)]">Haz clic para adjuntar</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* TAB 2 - Contrato (solo empleado) */}
            <div className={currentTabIndex === tabs.findIndex((tab) => tab.key === "contract") ? "block" : "hidden"}>
              <fieldset disabled={isEmployeeSelfMode} className={isEmployeeSelfMode ? "opacity-90" : ""}>
              <h3 className="mb-4 border-b border-[var(--gbp-border)] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--gbp-muted)]">
                Contrato y Salario
              </h3>

              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Fecha de Ingreso</label>
                  <input
                    name="hire_date"
                    type="date"
                    value={hireDate}
                    onChange={(event) => setHireDate(event.target.value)}
                    className={FIELD_INPUT}
                  />
                </div>
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Tipo Contrato</label>
                  <select
                    name="contract_type"
                    value={contractType}
                    onChange={(event) => setContractType(event.target.value)}
                    className={`${FIELD_INPUT} appearance-none`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat' }}
                  >
                    <option value="">—</option>
                    <option value="indefinite">Indeterminado</option>
                    <option value="fixed_term">Plazo fijo</option>
                    <option value="seasonal">Temporada</option>
                    <option value="internship">Pasantía</option>
                    </select>
                </div>
              </div>

              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Salario Base</label>
                  <input
                    name="salary_amount"
                    type="number"
                    step="0.01"
                    value={salaryAmount}
                    onChange={(event) => setSalaryAmount(event.target.value)}
                    className={FIELD_INPUT}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Frecuencia de pago</label>
                  <select
                    name="payment_frequency"
                    value={paymentFrequency}
                    onChange={(event) => setPaymentFrequency(event.target.value)}
                    className={`${FIELD_INPUT} appearance-none`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat' }}
                  >
                    <option value="">— Selecciona —</option>
                    <option value="hora">Por hora</option>
                    <option value="semana">Semanal</option>
                    <option value="quincena">Quincenal</option>
                    <option value="mes">Mensual</option>
                    </select>
                </div>
              </div>

              <h4 className="mb-3 border-b border-[var(--gbp-border)] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--gbp-muted)]">
                Vista previa del contrato
              </h4>
              <article className="mb-6 rounded-2xl border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5 text-[13px] leading-6 text-[var(--gbp-text2)]">
                <p className="mb-3">
                  El presente contrato se celebra entre <span className="font-semibold text-[var(--gbp-text)]">{employeeFullName}</span> y la empresa
                  <span className="font-semibold text-[var(--gbp-text)]"> {companyName}</span>, para desempeñar funciones como
                  <span className="font-semibold text-[var(--gbp-text)]"> {previewPosition}</span> en
                  <span className="font-semibold text-[var(--gbp-text)]"> {previewBranch}</span>, área
                  <span className="font-semibold text-[var(--gbp-text)]"> {previewDepartment}</span>, con cumplimiento de las políticas internas.
                </p>
                <p>
                  <span className="font-semibold text-[var(--gbp-text)]">Fecha de ingreso:</span> {previewHireDate}
                  <span className="mx-2 text-[var(--gbp-muted)]">|</span>
                  <span className="font-semibold text-[var(--gbp-text)]">Tipo de contrato:</span> {previewContractType}
                </p>
                <p>
                  <span className="font-semibold text-[var(--gbp-text)]">Salario base:</span> {previewSalary}
                  <span className="mx-2 text-[var(--gbp-muted)]">|</span>
                  <span className="font-semibold text-[var(--gbp-text)]">Frecuencia:</span> {previewPaymentFrequency}
                </p>
              </article>

              {contractReady ? (
                <div className="mb-6 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openContractPreview}
                    className="rounded-md border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--gbp-success)] hover:bg-[var(--gbp-success-soft)]"
                  >
                    Ver
                  </button>
                  <button
                    type="button"
                    onClick={downloadContractPreview}
                    className="rounded-md border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--gbp-success)] hover:bg-[var(--gbp-success-soft)]"
                  >
                    Descargar
                  </button>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Nombre del Firmante</label>
                  <input
                    name="contract_signer_name"
                    value={contractSignerName}
                    onChange={(event) => setContractSignerName(event.target.value)}
                    className={FIELD_INPUT}
                    placeholder="Nombre completo"
                  />
                </div>
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Fecha de Firma</label>
                  <input
                    name="contract_signed_at"
                    type="date"
                    value={contractSignedAt}
                    onChange={(event) => setContractSignedAt(event.target.value)}
                    className={FIELD_INPUT}
                  />
                </div>
              </div>
              </fieldset>
            </div>

            {/* TAB Cuenta App */}
            <div className={currentTabIndex === tabs.findIndex((tab) => tab.key === "account") ? "block" : "hidden"}>
              <h3 className="mb-6 border-b border-[var(--gbp-border)] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--gbp-muted)]">
                Crear cuenta de acceso
              </h3>

              <div className="mb-6 flex items-center gap-4 rounded-2xl border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    setCreateAccount((prev) => !prev);
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    createAccount ? "bg-[var(--gbp-text)]" : "bg-[var(--gbp-muted)]"
                  }`}
                  role="switch"
                  aria-checked={createAccount}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      createAccount ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-[var(--gbp-text)]">
                    Habilitar acceso al Dashboard
                  </span>
                  <span className="text-[12px] text-[var(--gbp-text2)]">
                    {isEmployeeProfile
                      ? "Opcional: habilita acceso para que pueda iniciar sesión en la app."
                      : "Opcional: habilita acceso para crear tambien sus credenciales de ingreso."}
                  </span>
                </div>
              </div>

              {createAccount && (
                <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-top-2 duration-300 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className={FIELD_LABEL}>Email de acceso</label>
                    <input
                      name="account_email"
                      type="email"
                      required={createAccount}
                      defaultValue={initialEmployee?.email ?? ""}
                      placeholder="usuario@empresa.com"
                      className={FIELD_INPUT}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className={FIELD_LABEL}>Contraseña inicial</label>
                    <PasswordInput
                      name="account_password"
                      required={requiresAccountPassword}
                      minLength={8}
                      placeholder={mode === "edit" && initialEmployee?.has_dashboard_access ? "Opcional: dejar vacio para mantener" : "Mínimo 8 caracteres"}
                      className={FIELD_INPUT}
                    />
                  </div>
                </div>
              )}

              {createAccount ? (
                <p className="mt-4 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3 text-xs text-[var(--gbp-text2)]">
                  Esta cuenta se crea como <span className="font-semibold text-[var(--gbp-text)]">Usuario/Empleado</span>. Los administradores se crean desde la pantalla de <span className="font-semibold text-[var(--gbp-text)]">Administradores</span>.
                </p>
              ) : null}
            </div>
          </div>

          {/* Footer */}
           <div className="flex items-center justify-between gap-3 border-t border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 px-8">
            <div>
              {mode === "edit" && initialEmployee?.email && !isEmployeeSelfMode ? (
                <button
                  type="button"
                  onClick={() => void handleResendInvitation()}
                  disabled={isResending}
                  className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--gbp-text2)] transition-all hover:border-[var(--gbp-accent)] hover:bg-[var(--gbp-accent-glow)] hover:text-[var(--gbp-accent)] disabled:opacity-50"
                >
                  {isResending ? (
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                  )}
                  {isResending ? "Enviando..." : "Reenviar Invitación"}
                </button>
              ) : <span />}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClose}
                className={`rounded-full px-6 py-2.5 text-sm font-bold text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-bg)] ${DARK_GHOST}`}
              >
                {isEmployeeSelfMode ? "Cerrar" : "Cancelar"}
              </button>
              {!isEmployeeSelfMode ? (
                <SubmitButton
                  label={mode === "edit" ? "Actualizar Usuario / Empleado" : "Guardar Usuario / Empleado"}
                  pendingLabel={mode === "edit" ? "Actualizando..." : "Guardando..."}
                  pending={isActionPending}
                  className="rounded-full bg-[var(--gbp-accent)] px-10 py-2.5 text-sm font-bold text-white shadow-lg transition-transform hover:scale-[1.02] hover:bg-[var(--gbp-accent-hover)] active:scale-[0.98]"
                />
              ) : null}
            </div>
          </div>
        </form>
      </div>
      {reviewDialog.open ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cerrar revisión"
            onClick={closeCompanyDocumentReviewDialog}
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-[560px] rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--gbp-muted)]">Revisión de documento</p>
                <h4 className="mt-1 text-[17px] font-bold text-[var(--gbp-text)]">
                  {reviewDialog.decision === "approved" ? "Aprobar documento" : "Rechazar documento"}
                </h4>
                <p className="mt-1 text-[12px] text-[var(--gbp-text2)]">
                  {reviewDialog.decision === "approved"
                    ? "Deja un comentario de validación para trazabilidad del equipo."
                    : "Explica claramente el motivo para que el empleado pueda corregirlo rápido."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCompanyDocumentReviewDialog}
                disabled={isReviewDialogSubmitting}
                className="rounded-lg p-2 text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-bg)] hover:text-[var(--gbp-text)] disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              {(reviewDialog.decision === "approved" ? APPROVAL_COMMENT_TEMPLATES : REJECTION_COMMENT_TEMPLATES).map((template) => (
                <button
                  key={template}
                  type="button"
                  onClick={() => setReviewDialog((prev) => ({ ...prev, comment: template }))}
                  disabled={isReviewDialogSubmitting}
                  className="rounded-full border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-2.5 py-1 text-[10px] font-semibold text-[var(--gbp-text2)] transition-colors hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-60"
                >
                  {template}
                </button>
              ))}
            </div>

            <label className="text-[11px] font-bold text-[var(--gbp-text2)]">
              Comentario {reviewDialog.decision === "rejected" ? "(obligatorio)" : "(opcional)"}
              <textarea
                value={reviewDialog.comment}
                onChange={(event) => setReviewDialog((prev) => ({ ...prev, comment: event.target.value }))}
                placeholder={reviewDialog.decision === "approved" ? "Ej. Documento validado y aprobado." : "Ej. La foto está borrosa y no se leen los datos."}
                rows={4}
                disabled={isReviewDialogSubmitting}
                className="mt-1.5 w-full resize-none rounded-xl border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none focus:border-[var(--gbp-accent)] disabled:opacity-60"
              />
            </label>

            <div className="mt-2 flex items-center justify-between">
              <p className="text-[10px] text-[var(--gbp-muted)]">{reviewDialog.comment.trim().length} caracteres</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeCompanyDocumentReviewDialog}
                  disabled={isReviewDialogSubmitting}
                  className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)] disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void submitCompanyDocumentReview()}
                  disabled={isReviewDialogSubmitting || (reviewDialog.decision === "rejected" && reviewDialog.comment.trim().length === 0)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--gbp-accent)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--gbp-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isReviewDialogSubmitting ? (
                    <>
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-r-transparent" />
                      Guardando...
                    </>
                  ) : reviewDialog.decision === "approved" ? "Aprobar" : "Rechazar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {signatureModal.open && signatureModal.src ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-md transition-all duration-300" />
          <div className="relative flex h-[90vh] w-[min(1100px,96vw)] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[var(--gbp-surface)] shadow-[0_0_80px_rgba(0,0,0,0.3)] animate-in fade-in zoom-in-95 duration-300">
            {/* Cabecera Premium */}
            <div className="flex items-center justify-between border-b border-[var(--gbp-border)] bg-[color:color-mix(in_oklab,var(--gbp-bg)_95%,transparent)] px-6 py-4 backdrop-blur-xl">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:color-mix(in_oklab,var(--gbp-accent)_15%,transparent)] shadow-sm">
                  <svg className="h-5 w-5 text-[var(--gbp-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.48 9.55l-2.98 2.98a2.11 2.11 0 01-2.98 0l-3.53-3.53a2.11 2.11 0 010-2.98l2.98-2.98a2.11 2.11 0 012.98 0l3.53 3.53a2.11 2.11 0 010 2.98z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[15px] font-bold tracking-tight text-[var(--gbp-text)]">Firma del documento</h3>
                  <p className="text-[12px] font-medium text-[var(--gbp-text2)]">Firma criptográficamente segura</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDocusealReady(false);
                    setDocusealLoadFailed(false);
                    if (signatureModal.slot) {
                      void handleRefreshSignatureStatus(signatureModal.slot);
                    }
                  }}
                  className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg bg-[var(--gbp-bg)] px-3.5 py-2 text-[12px] font-bold text-[var(--gbp-text2)] ring-1 ring-inset ring-[var(--gbp-border2)] transition-all hover:bg-[var(--gbp-surface)] hover:text-[var(--gbp-text)] hover:shadow-sm"
                >
                  <svg className="h-3.5 w-3.5 transition-transform group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Actualizar</span>
                </button>
                {signatureModal.src ? (
                  <button
                    type="button"
                    onClick={openSignatureInNewTab}
                    className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg bg-[var(--gbp-accent)] px-3.5 py-2 text-[12px] font-bold text-white ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--gbp-accent)_70%,black)] transition-all hover:bg-[var(--gbp-accent-hover)] hover:shadow-sm"
                  >
                    <span>Abrir en pestaña</span>
                  </button>
                ) : null}
                <div className="h-5 w-px bg-[var(--gbp-border)]"></div>
                <button
                  type="button"
                  onClick={() => {
                    setSignatureModal({ open: false, slot: null, src: null });
                    setDocusealReady(false);
                    setDocusealLoadFailed(false);
                  }}
                  className="group inline-flex items-center justify-center rounded-lg bg-[color:color-mix(in_oklab,var(--gbp-red)_10%,transparent)] p-2 text-[var(--gbp-red)] transition-all hover:bg-[var(--gbp-red)] hover:text-white"
                  title="Cerrar modal"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Área de Firma */}
            <div 
              className="flex-1 w-full bg-[var(--gbp-bg)] overflow-y-auto" 
              style={{ WebkitOverflowScrolling: "touch" }}
            >
                {docusealReady && !docusealLoadFailed
                  ? createElement("docuseal-form", {
                      "data-src": signatureModal.src,
                      "data-email": initialEmployee?.email || "",
                      className: "w-full min-h-full border-none",
                    } as Record<string, unknown>)
                : docusealLoadFailed ? (
                      <div className="flex min-h-full flex-col items-center justify-center gap-6 px-8 py-12 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="relative">
                          <div className="absolute inset-0 animate-ping rounded-full bg-[var(--gbp-accent)] opacity-20"></div>
                          <div className="relative flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-[var(--gbp-accent)] to-[color:color-mix(in_oklab,var(--gbp-accent)_50%,black)] text-white shadow-xl shadow-[color:color-mix(in_oklab,var(--gbp-accent)_30%,transparent)]">
                            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                            </svg>
                          </div>
                        </div>
                        <div className="max-w-md space-y-3">
                          <h4 className="text-2xl font-bold tracking-tight text-[var(--gbp-text)] text-balance">Protección de Navegador</h4>
                          <p className="text-[14px] leading-relaxed text-[var(--gbp-text2)] text-balance">
                            Parece que tu navegador o bloqueador de anuncios no permite incrustar de forma iframe este módulo seguro. <span className="font-semibold text-[var(--gbp-text)]">No hay problema.</span> Accede a nuestra pestaña cifrada certificada para firmarlo en una nueva ventana.
                          </p>
                        </div>
                        {signatureModal.src ? (
                          <div className="mt-4 flex flex-col items-center gap-4">
                            <a
                              href={signatureModal.src}
                              target="_blank"
                              rel="noreferrer"
                              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-b from-[var(--gbp-accent)] to-[color:color-mix(in_oklab,var(--gbp-accent)_85%,black)] px-8 py-3.5 text-sm font-black text-white shadow-[0_8px_30px_-10px_var(--gbp-accent)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-10px_var(--gbp-accent)] active:translate-y-0 active:shadow-none"
                            >
                              <span className="absolute inset-0 bg-white/20 opacity-0 transition-opacity group-hover:opacity-100"></span>
                              <span>Firma Segura en Nueva Pestaña</span>
                              <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                              </svg>
                            </a>
                            <p className="text-[12px] font-medium text-[var(--gbp-muted)]">Una vez firmado con éxito, regresa y cierra esta ventana.</p>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex min-h-full flex-col items-center justify-center gap-8 px-6 py-12 text-center">
                        <div className="relative flex items-center justify-center">
                          <div className="absolute h-28 w-28 animate-[pulse_3s_ease-in-out_infinite] rounded-full bg-[var(--gbp-accent)] opacity-10 blur-xl"></div>
                          <div className="absolute h-20 w-20 animate-[ping_2s_ease-in-out_infinite] rounded-full border border-[var(--gbp-accent)] opacity-20"></div>
                          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--gbp-surface)] shadow-lg shadow-[color:color-mix(in_oklab,var(--gbp-accent)_15%,transparent)] ring-1 ring-[var(--gbp-border2)]">
                            <svg className="h-7 w-7 animate-spin text-[var(--gbp-accent)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          </div>
                        </div>
                        <div className="space-y-1.5 animate-in slide-in-from-bottom-2 duration-700">
                          <h4 className="text-[17px] font-bold tracking-tight text-[var(--gbp-text)]">Creando entorno de firma</h4>
                          <p className="mx-auto max-w-[280px] text-[13px] font-medium leading-relaxed text-[var(--gbp-text2)]">Estableciendo túnel encriptado con la plataforma certificada de firmas. Esto tomará un instante.</p>
                        </div>
                        {signatureModal.src ? (
                          <button
                            type="button"
                            onClick={openSignatureInNewTab}
                            className="inline-flex items-center justify-center rounded-xl bg-[var(--gbp-accent)] px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--gbp-accent-hover)]"
                          >
                            Abrir firma en nueva pestaña
                          </button>
                        ) : null}
                      </div>
                    )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
