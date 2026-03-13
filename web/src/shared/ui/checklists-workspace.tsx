"use client";

import { CalendarClock, ChevronDown, ClipboardPlus, Flag, MapPin } from "lucide-react";
import { useMemo, useState } from "react";

type Checklist = {
  id: number;
  name: string;
  type: "Apertura" | "Cierre" | "Prep" | "Catering";
  shift: string;
  location: string;
  department: string;
  repeat: string;
  status: "Activo" | "Borrador";
  createdAt: string;
};

const CHECKLISTS: Checklist[] = [
  {
    id: 1,
    name: "Apertura Cocina - Semana",
    type: "Apertura",
    shift: "Manana",
    location: "Long Beach",
    department: "Cocina",
    repeat: "Diario",
    status: "Activo",
    createdAt: "03 Jun 2025",
  },
  {
    id: 2,
    name: "Checklist Cierre FOH",
    type: "Cierre",
    shift: "Noche",
    location: "Biloxi",
    department: "Operaciones",
    repeat: "Diario",
    status: "Activo",
    createdAt: "01 Jun 2025",
  },
  {
    id: 3,
    name: "Prep Catering Fin de Semana",
    type: "Catering",
    shift: "Tarde",
    location: "Long Beach",
    department: "Cocina",
    repeat: "Semanal",
    status: "Borrador",
    createdAt: "28 May 2025",
  },
  {
    id: 4,
    name: "Control de Mise en Place",
    type: "Prep",
    shift: "Manana",
    location: "Biloxi",
    department: "Cocina",
    repeat: "Diario",
    status: "Activo",
    createdAt: "25 May 2025",
  },
];

function badgeClass(status: Checklist["status"]) {
  if (status === "Activo") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export function ChecklistsWorkspace() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [location, setLocation] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CHECKLISTS.filter((row) => {
      if (q && !row.name.toLowerCase().includes(q) && !row.department.toLowerCase().includes(q)) return false;
      if (type && row.type !== type) return false;
      if (location && row.location !== location) return false;
      return true;
    });
  }, [query, type, location]);

  const total = rows.length;
  const active = rows.filter((r) => r.status === "Activo").length;
  const drafts = rows.filter((r) => r.status === "Borrador").length;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <section className="mb-5 rounded-2xl border border-[#e7e0dc] bg-[#fffdfa] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9d948f] uppercase">Operacion diaria</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Checklists</h1>
            <p className="mt-1 text-sm text-[#67605b]">Plantillas operativas por turno, sucursal y departamento.</p>
          </div>
        </div>
      </section>

      <details className="group mb-5 rounded-2xl border border-[#e7e0dc] bg-white p-4" open>
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-[#e5ddd8] bg-[#fffdfa] px-4 py-3 hover:bg-[#faf6f4]">
          <div className="inline-flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#f2cdc6] bg-[#fff1ef] text-[#b63a2f]"><ClipboardPlus className="h-4 w-4" /></span>
            <div>
              <p className="text-sm font-semibold text-[#2b2521]">Nuevo checklist</p>
              <p className="text-xs text-[#7b726d]">Plantilla operativa por turno y sucursal</p>
            </div>
          </div>
          <ChevronDown className="h-5 w-5 text-[#8b827d] transition group-open:rotate-180" />
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input placeholder="Nombre plantilla" className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm" />
          <select className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm"><option>Tipo</option><option>Apertura</option><option>Cierre</option></select>
          <select className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm"><option>Sucursal</option><option>Long Beach</option><option>Biloxi</option></select>
          <button className="rounded-lg bg-[#b63a2f] px-3 py-2 text-sm font-semibold text-white hover:bg-[#8f2e26]">Crear</button>
        </div>
      </details>

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-[#e7e0dc] bg-white p-4">
          <p className="text-xs text-[#8a817b]">Total</p>
          <p className="mt-1 text-2xl font-bold">{total}</p>
        </article>
        <article className="rounded-xl border border-[#e7e0dc] bg-white p-4">
          <p className="text-xs text-[#8a817b]">Activos</p>
          <p className="mt-1 text-2xl font-bold">{active}</p>
        </article>
        <article className="rounded-xl border border-[#e7e0dc] bg-white p-4">
          <p className="text-xs text-[#8a817b]">Borradores</p>
          <p className="mt-1 text-2xl font-bold">{drafts}</p>
        </article>
      </section>

      <section className="mb-4 grid gap-2 rounded-xl border border-[#e7e0dc] bg-white p-3 lg:grid-cols-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar checklist..."
          className="rounded-lg border border-[#e5ddd8] px-3 py-2 text-sm outline-none ring-[#b63a2f]/20 focus:ring-2"
        />
        <select value={type} onChange={(event) => setType(event.target.value)} className="rounded-lg border border-[#e5ddd8] px-3 py-2 text-sm">
          <option value="">Todos los tipos</option>
          <option>Apertura</option>
          <option>Cierre</option>
          <option>Prep</option>
          <option>Catering</option>
        </select>
        <select
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          className="rounded-lg border border-[#e5ddd8] px-3 py-2 text-sm"
        >
          <option value="">Todas las locaciones</option>
          <option>Long Beach</option>
          <option>Biloxi</option>
        </select>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setType("");
            setLocation("");
          }}
          className="rounded-lg border border-[#e5ddd8] bg-[#faf8f6] px-3 py-2 text-sm text-[#5f5853] hover:bg-[#f4efec]"
        >
          Limpiar filtros
        </button>
      </section>

      <section className="space-y-3">
        {rows.map((row) => (
          <details key={row.id} className="group rounded-2xl border border-[#e7e0dc] bg-white p-4" open={row.status === "Activo"}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div className="grid flex-1 gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-[#2f2b28]">{row.name}</p>
                  <p className="text-xs text-[#8e857f]">Creado: {row.createdAt}</p>
                </div>
                <p className="text-sm text-[#5f5853]">{row.type}</p>
                <p className="inline-flex items-center gap-1 text-sm text-[#5f5853]"><MapPin className="h-3.5 w-3.5" />{row.location}</p>
                <span className={`w-fit rounded-full border px-2 py-0.5 text-[11px] ${badgeClass(row.status)}`}>{row.status}</span>
              </div>
              <ChevronDown className="h-5 w-5 text-[#8b827d] transition group-open:rotate-180" />
            </summary>

            <div className="mt-4 grid gap-2 border-t border-[#eee6e1] pt-4 sm:grid-cols-4">
              <p className="inline-flex items-center gap-1 rounded-lg border border-[#e9e1dc] bg-[#fcfaf8] px-3 py-2 text-sm text-[#5f5853]"><CalendarClock className="h-4 w-4" /> Turno: {row.shift}</p>
              <p className="rounded-lg border border-[#e9e1dc] bg-[#fcfaf8] px-3 py-2 text-sm text-[#5f5853]">Departamento: {row.department}</p>
              <p className="rounded-lg border border-[#e9e1dc] bg-[#fcfaf8] px-3 py-2 text-sm text-[#5f5853]">Frecuencia: {row.repeat}</p>
              <button className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#ddd3ce] bg-white px-3 py-2 text-sm text-[#4f4843] hover:bg-[#f8f3f1]"><Flag className="h-4 w-4" /> Editar</button>
            </div>
          </details>
        ))}
      </section>
    </main>
  );
}
