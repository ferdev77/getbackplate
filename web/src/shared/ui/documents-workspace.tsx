"use client";

import { ChevronDown, FolderPlus, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";

type Folder = {
  id: number;
  name: string;
  permission: "Todo el personal" | "Por departamento" | "Por puesto" | "Restringido";
};

type DocumentItem = {
  id: number;
  folderId: number;
  name: string;
  type: string;
  location: string;
  department: string;
  updatedAt: string;
  sizeMb: number;
  isNew: boolean;
};

const FOLDERS: Folder[] = [
  { id: 1, name: "RRHH y Politicas", permission: "Por departamento" },
  { id: 2, name: "Cocina y Recetas", permission: "Por puesto" },
  { id: 3, name: "Marketing 2025", permission: "Todo el personal" },
  { id: 4, name: "Finanzas", permission: "Restringido" },
];

const DOCUMENTS: DocumentItem[] = [
  {
    id: 1,
    folderId: 3,
    name: "Manual de Identidad 2025.pdf",
    type: "PDF",
    location: "Long Beach",
    department: "Marketing",
    updatedAt: "Hace 2 dias",
    sizeMb: 2.4,
    isNew: true,
  },
  {
    id: 2,
    folderId: 1,
    name: "Politicas RRHH Q2 2025.pdf",
    type: "PDF",
    location: "Todas",
    department: "RRHH",
    updatedAt: "Hace 5 dias",
    sizeMb: 1.1,
    isNew: false,
  },
  {
    id: 3,
    folderId: 4,
    name: "Reporte Financiero Q1.xlsx",
    type: "XLSX",
    location: "Long Beach",
    department: "Finanzas",
    updatedAt: "Hace 3 sem",
    sizeMb: 3.8,
    isNew: false,
  },
  {
    id: 4,
    folderId: 2,
    name: "Recetas Temporada Verano.pdf",
    type: "PDF",
    location: "Biloxi",
    department: "Cocina",
    updatedAt: "Hace 1 mes",
    sizeMb: 5.2,
    isNew: false,
  },
  {
    id: 5,
    folderId: 1,
    name: "Contrato Colectivo 2025.docx",
    type: "DOCX",
    location: "Biloxi",
    department: "RRHH",
    updatedAt: "Hace 2 dias",
    sizeMb: 0.8,
    isNew: true,
  },
];

function permissionClass(permission: Folder["permission"]) {
  if (permission === "Todo el personal") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (permission === "Por departamento") return "bg-amber-50 text-amber-700 border-amber-200";
  if (permission === "Por puesto") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

export function DocumentsWorkspace() {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [openFolders, setOpenFolders] = useState<number[]>(FOLDERS.map((f) => f.id));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DOCUMENTS.filter((doc) => {
      if (q && !doc.name.toLowerCase().includes(q) && !doc.department.toLowerCase().includes(q)) return false;
      if (department && doc.department !== department) return false;
      if (location && doc.location !== location && doc.location !== "Todas") return false;
      return true;
    });
  }, [query, department, location]);

  function toggleFolder(folderId: number) {
    setOpenFolders((current) =>
      current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId],
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <section className="mb-5 rounded-2xl border border-[#e7e0dc] bg-[#fffdfa] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9d948f] uppercase">File Manager</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Documentos</h1>
            <p className="mt-1 text-sm text-[#67605b]">Gestiona carpetas, permisos y archivos internos por sucursal.</p>
          </div>
        </div>
      </section>

      <details className="group mb-5 rounded-2xl border border-[#e7e0dc] bg-white p-4" open>
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-[#e5ddd8] bg-[#fffdfa] px-4 py-3 hover:bg-[#faf6f4]">
          <div className="text-sm font-semibold text-[#2b2521]">Acciones de documentos</div>
          <ChevronDown className="h-5 w-5 text-[#8b827d] transition group-open:rotate-180" />
        </summary>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="rounded-lg border border-[#ddd5d0] bg-white px-3 py-2 text-sm text-[#514b47] hover:bg-[#f7f3f1]">Exportar</button>
          <button className="inline-flex items-center gap-1 rounded-lg border border-[#f1c8c2] bg-[#fff2f0] px-3 py-2 text-sm font-semibold text-[#b63a2f] hover:bg-[#ffe6e2]"><FolderPlus className="h-4 w-4" /> Nueva carpeta</button>
          <button className="inline-flex items-center gap-1 rounded-lg bg-[#b63a2f] px-3 py-2 text-sm font-semibold text-white hover:bg-[#8f2e26]"><UploadCloud className="h-4 w-4" /> Subir archivo</button>
        </div>
      </details>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-[#e7e0dc] bg-white p-4">
          <p className="text-xs text-[#8a817b]">Carpetas</p>
          <p className="mt-1 text-2xl font-bold">{FOLDERS.length}</p>
        </article>
        <article className="rounded-xl border border-[#e7e0dc] bg-white p-4">
          <p className="text-xs text-[#8a817b]">Total documentos</p>
          <p className="mt-1 text-2xl font-bold">{DOCUMENTS.length}</p>
        </article>
        <article className="rounded-xl border border-[#e7e0dc] bg-white p-4">
          <p className="text-xs text-[#8a817b]">Nuevos esta semana</p>
          <p className="mt-1 text-2xl font-bold">{DOCUMENTS.filter((d) => d.isNew).length}</p>
        </article>
        <article className="rounded-xl border border-[#e7e0dc] bg-white p-4">
          <p className="text-xs text-[#8a817b]">Tamanio total</p>
          <p className="mt-1 text-2xl font-bold">
            {DOCUMENTS.reduce((sum, doc) => sum + doc.sizeMb, 0).toFixed(1)} MB
          </p>
        </article>
      </section>

      <section className="mb-4 grid gap-2 rounded-xl border border-[#e7e0dc] bg-white p-3 lg:grid-cols-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar documentos..."
          className="rounded-lg border border-[#e5ddd8] px-3 py-2 text-sm outline-none ring-[#b63a2f]/20 focus:ring-2"
        />
        <select
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          className="rounded-lg border border-[#e5ddd8] px-3 py-2 text-sm"
        >
          <option value="">Todas las locaciones</option>
          <option>Long Beach</option>
          <option>Biloxi</option>
        </select>
        <select
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          className="rounded-lg border border-[#e5ddd8] px-3 py-2 text-sm"
        >
          <option value="">Todos los departamentos</option>
          <option>Marketing</option>
          <option>RRHH</option>
          <option>Finanzas</option>
          <option>Cocina</option>
        </select>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setDepartment("");
            setLocation("");
          }}
          className="rounded-lg border border-[#e5ddd8] bg-[#faf8f6] px-3 py-2 text-sm text-[#5f5853] hover:bg-[#f4efec]"
        >
          Limpiar filtros
        </button>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#e7e0dc] bg-white">
        <div className="hidden grid-cols-[2fr_1fr_1fr_1fr] border-b border-[#efe8e3] bg-[#faf8f6] px-4 py-3 text-xs font-semibold tracking-wide text-[#8b817c] uppercase md:grid">
          <p>Nombre</p>
          <p>Locacion</p>
          <p>Departamento</p>
          <p>Actualizacion</p>
        </div>

        <div className="divide-y divide-[#f0ebe7]">
          {FOLDERS.map((folder) => {
            const folderDocs = filtered.filter((doc) => doc.folderId === folder.id);
            const open = openFolders.includes(folder.id);

            return (
              <div key={folder.id}>
                <button
                  type="button"
                  onClick={() => toggleFolder(folder.id)}
                  className="flex w-full items-center gap-3 bg-[#fffdfa] px-4 py-3 text-left hover:bg-[#fbf7f4]"
                >
                  <span className="text-sm text-[#9d948f]">{open ? "▾" : "▸"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#2f2b28]">{folder.name}</p>
                    <p className="text-xs text-[#8e857f]">{folderDocs.length} archivo(s)</p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${permissionClass(folder.permission)}`}>
                    {folder.permission}
                  </span>
                </button>

                {open ? (
                  <div>
                    {folderDocs.length ? (
                      folderDocs.map((doc) => (
                        <div
                          key={doc.id}
                          className="grid gap-2 border-t border-[#f3eeea] px-4 py-3 md:grid-cols-[2fr_1fr_1fr_1fr] md:items-center"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[#2f2b28]">
                              {doc.name}
                              {doc.isNew ? (
                                <span className="ml-2 rounded-full bg-[#ffe9e6] px-2 py-0.5 text-[10px] font-semibold text-[#b63a2f]">
                                  NUEVO
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs text-[#8e857f]">
                              {doc.type} - {doc.sizeMb} MB
                            </p>
                          </div>
                          <p className="text-sm text-[#5f5853]">{doc.location}</p>
                          <p className="text-sm text-[#5f5853]">{doc.department}</p>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-[#5f5853]">{doc.updatedAt}</p>
                            <div className="flex gap-1">
                              <button className="rounded-md border border-[#e3dbd6] px-2 py-1 text-xs hover:bg-[#faf6f3]">Ver</button>
                              <button className="rounded-md border border-[#e3dbd6] px-2 py-1 text-xs hover:bg-[#faf6f3]">Desc</button>
                              <button className="rounded-md border border-[#f3cbc4] bg-[#fff3f1] px-2 py-1 text-xs text-[#b63a2f] hover:bg-[#ffe8e4]">
                                Compartir
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="border-t border-[#f3eeea] px-4 py-4 text-sm text-[#8e857f]">Sin documentos para estos filtros.</div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
