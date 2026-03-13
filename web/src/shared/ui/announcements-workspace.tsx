"use client";

import { BellPlus, CalendarClock, ChevronDown, Pin } from "lucide-react";
import { useMemo, useState } from "react";

type Announcement = {
  id: number;
  title: string;
  body: string;
  author: string;
  date: string;
  audience: string[];
  type: "General" | "Urgente" | "Recordatorio" | "Celebracion";
  pinned: boolean;
  expiresAt?: string;
};

const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 1,
    title: "Bienvenido al Portal Interno de Juan's Restaurants",
    body: "Mensaje principal visible en la pantalla de inicio de todos los empleados.",
    author: "Direccion General",
    date: "1 Jun 2025",
    audience: ["Todos los empleados"],
    type: "General",
    pinned: true,
  },
  {
    id: 2,
    title: "Nuevo uniforme a partir del 15 de junio",
    body: "Actualizacion de uniformes para personal de piso en Long Beach y Biloxi.",
    author: "Recursos Humanos",
    date: "3 Jun 2025",
    audience: ["Long Beach", "Biloxi", "RRHH"],
    type: "Recordatorio",
    pinned: false,
    expiresAt: "12 Jun 2025",
  },
  {
    id: 3,
    title: "Semana de Apreciacion al Empleado",
    body: "Celebracion interna del 9 al 13 de junio en todas las sucursales.",
    author: "Direccion General",
    date: "28 May 2025",
    audience: ["Todas las locaciones", "Laura Reyes"],
    type: "Celebracion",
    pinned: false,
    expiresAt: "13 Jun 2025",
  },
];

function typeClass(type: Announcement["type"]) {
  if (type === "Urgente") return "border-rose-200 bg-rose-50 text-rose-700";
  if (type === "Recordatorio") return "border-amber-200 bg-amber-50 text-amber-700";
  if (type === "Celebracion") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function AnnouncementsWorkspace() {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [onlyPinned, setOnlyPinned] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ANNOUNCEMENTS.filter((ann) => {
      if (q && !ann.title.toLowerCase().includes(q) && !ann.body.toLowerCase().includes(q)) return false;
      if (typeFilter && ann.type !== typeFilter) return false;
      if (onlyPinned && !ann.pinned) return false;
      return true;
    }).sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [query, typeFilter, onlyPinned]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <section className="mb-5 rounded-2xl border border-[#e7e0dc] bg-[#fffdfa] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9d948f] uppercase">Comunicacion</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Anuncios</h1>
            <p className="mt-1 text-sm text-[#67605b]">Publica avisos segmentados por audiencia y sucursal.</p>
          </div>
        </div>
      </section>

      <details className="group mb-5 rounded-2xl border border-[#e7e0dc] bg-white p-4" open>
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-[#e5ddd8] bg-[#fffdfa] px-4 py-3 hover:bg-[#faf6f4]">
          <div className="inline-flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#f2cdc6] bg-[#fff1ef] text-[#b63a2f]">
              <BellPlus className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#2b2521]">Crear anuncio</p>
              <p className="text-xs text-[#7b726d]">Redacta y define audiencia</p>
            </div>
          </div>
          <ChevronDown className="h-5 w-5 text-[#8b827d] transition group-open:rotate-180" />
        </summary>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input placeholder="Titulo" className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm" />
          <select className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm"><option>Tipo</option><option>General</option><option>Urgente</option></select>
          <input placeholder="Audiencia" className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm" />
          <button className="rounded-lg bg-[#b63a2f] px-3 py-2 text-sm font-semibold text-white hover:bg-[#8f2e26]">Publicar</button>
        </div>
      </details>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-[#e7e0dc] bg-white p-4">
          <p className="text-xs text-[#8a817b]">Avisos activos</p>
          <p className="mt-1 text-2xl font-bold">{ANNOUNCEMENTS.length}</p>
        </article>
        <article className="rounded-xl border border-[#e7e0dc] bg-white p-4">
          <p className="text-xs text-[#8a817b]">Fijados</p>
          <p className="mt-1 text-2xl font-bold">{ANNOUNCEMENTS.filter((a) => a.pinned).length}</p>
        </article>
        <article className="rounded-xl border border-[#e7e0dc] bg-white p-4">
          <p className="text-xs text-[#8a817b]">Con caducidad</p>
          <p className="mt-1 text-2xl font-bold">{ANNOUNCEMENTS.filter((a) => a.expiresAt).length}</p>
        </article>
        <article className="rounded-xl border border-[#e7e0dc] bg-white p-4">
          <p className="text-xs text-[#8a817b]">Ultima publicacion</p>
          <p className="mt-1 text-2xl font-bold">3 Jun</p>
        </article>
      </section>

      <section className="mb-4 grid gap-2 rounded-xl border border-[#e7e0dc] bg-white p-3 lg:grid-cols-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar anuncio..."
          className="rounded-lg border border-[#e5ddd8] px-3 py-2 text-sm outline-none ring-[#b63a2f]/20 focus:ring-2"
        />
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          className="rounded-lg border border-[#e5ddd8] px-3 py-2 text-sm"
        >
          <option value="">Todos los tipos</option>
          <option>General</option>
          <option>Urgente</option>
          <option>Recordatorio</option>
          <option>Celebracion</option>
        </select>
        <button
          type="button"
          onClick={() => setOnlyPinned((prev) => !prev)}
          className={`rounded-lg border px-3 py-2 text-sm ${
            onlyPinned
              ? "border-[#f1c8c2] bg-[#fff1ef] text-[#b63a2f]"
              : "border-[#e5ddd8] bg-[#faf8f6] text-[#5f5853]"
          }`}
        >
          {onlyPinned ? "Solo fijados: SI" : "Solo fijados: NO"}
        </button>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setTypeFilter("");
            setOnlyPinned(false);
          }}
          className="rounded-lg border border-[#e5ddd8] bg-[#faf8f6] px-3 py-2 text-sm text-[#5f5853] hover:bg-[#f4efec]"
        >
          Limpiar filtros
        </button>
      </section>

      <section className="space-y-3">
        {filtered.map((ann) => (
          <details key={ann.id} className="group rounded-xl border border-[#e7e0dc] bg-white p-4" open={ann.pinned}>
            <summary className="flex cursor-pointer list-none items-start justify-between gap-2">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-[#26221f]">
                  {ann.title}
                  {ann.pinned ? (
                    <span className="ml-2 rounded-full border border-[#f3cbc4] bg-[#fff2f0] px-2 py-0.5 text-[10px] font-semibold text-[#b63a2f]">
                      <span className="inline-flex items-center gap-1"><Pin className="h-3 w-3" /> FIJADO</span>
                    </span>
                  ) : null}
                </h2>
                <p className="mt-1 text-xs text-[#8b817c]">{ann.date} - {ann.author}</p>
              </div>
              <div className="inline-flex items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${typeClass(ann.type)}`}>{ann.type}</span>
                <ChevronDown className="h-4 w-4 text-[#8b827d] transition group-open:rotate-180" />
              </div>
            </div>
            </summary>

            <p className="mb-3 text-sm text-[#57504b]">{ann.body}</p>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {ann.audience.map((item) => (
                <span key={`${ann.id}-${item}`} className="rounded-full border border-[#e8dfda] bg-[#faf7f5] px-2 py-0.5 text-[11px] text-[#6f6864]">
                  {item}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1 text-xs text-[#8b817c]"><CalendarClock className="h-3.5 w-3.5" />{ann.expiresAt ? `Caduca: ${ann.expiresAt}` : "Sin caducidad"}</p>
              <div className="flex gap-1">
                <button className="rounded-md border border-[#e3dbd6] px-2 py-1 text-xs hover:bg-[#faf6f3]">Editar</button>
                <button className="rounded-md border border-[#e3dbd6] px-2 py-1 text-xs hover:bg-[#faf6f3]">Duplicar</button>
                <button className="rounded-md border border-[#f3cbc4] bg-[#fff3f1] px-2 py-1 text-xs text-[#b63a2f] hover:bg-[#ffe8e4]">
                  Eliminar
                </button>
              </div>
            </div>
          </details>
        ))}

        {!filtered.length ? (
          <div className="rounded-xl border border-dashed border-[#dccfca] bg-[#fffdfa] px-4 py-8 text-center text-sm text-[#8b817c]">
            No hay anuncios con los filtros actuales.
          </div>
        ) : null}
      </section>
    </main>
  );
}
