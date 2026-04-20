"use client";

import { useState } from "react";
import type { VendorRow } from "@/modules/vendors/types";
import { VENDOR_CATEGORIES } from "@/modules/vendors/types";

type Branch = { id: string; name: string };

type Props = {
  initialVendors: VendorRow[];
  branches: Branch[];
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  alimentos:     { bg: "#fef3c7", text: "#92400e" },
  bebidas:       { bg: "#dbeafe", text: "#1e40af" },
  equipos:       { bg: "#f3e8ff", text: "#6b21a8" },
  limpieza:      { bg: "#d1fae5", text: "#065f46" },
  mantenimiento: { bg: "#fee2e2", text: "#991b1b" },
  empaque:       { bg: "#e0f2fe", text: "#0369a1" },
  otro:          { bg: "#f3f4f6", text: "#374151" },
};

function CategoryBadge({ category }: { category: string }) {
  const colors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.otro;
  const label = VENDOR_CATEGORIES.find((c) => c.value === category)?.label ?? category;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 10px",
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 700,
        background: colors.bg,
        color: colors.text,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {label}
    </span>
  );
}

function VendorCard({ vendor }: { vendor: VendorRow }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: "var(--card-bg, #fff)",
        border: "1px solid var(--border, #e2e8f0)",
        borderRadius: 12,
        overflow: "hidden",
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      {/* Header */}
      <div style={{ padding: "16px 18px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <CategoryBadge category={vendor.category} />
          <h3
            style={{
              margin: "8px 0 0",
              fontSize: 16,
              fontWeight: 700,
              color: "var(--text-primary, #1e293b)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {vendor.name}
          </h3>
          {vendor.branchNames.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {vendor.branchNames.map((name) => (
                <span
                  key={name}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 9999,
                    background: "var(--tag-bg, #f1f5f9)",
                    color: "var(--text-secondary, #475569)",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Contact quick actions */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {vendor.contactPhone && (
            <a
              href={`tel:${vendor.contactPhone}`}
              title={vendor.contactPhone}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "#dcfce7",
                color: "#16a34a",
                fontSize: 16,
                textDecoration: "none",
                border: "none",
              }}
            >
              📞
            </a>
          )}
          {vendor.contactEmail && (
            <a
              href={`mailto:${vendor.contactEmail}`}
              title={vendor.contactEmail}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "#ede9fe",
                color: "#7c3aed",
                fontSize: 16,
                textDecoration: "none",
              }}
            >
              ✉️
            </a>
          )}
        </div>
      </div>

      {/* Contact info row */}
      {(vendor.contactName || vendor.contactEmail || vendor.contactPhone) && (
        <div
          style={{
            padding: "8px 18px",
            background: "var(--surface, #f8fafc)",
            borderTop: "1px solid var(--border, #e2e8f0)",
            display: "flex",
            flexWrap: "wrap",
            gap: "4px 16px",
          }}
        >
          {vendor.contactName && (
            <span style={{ fontSize: 14, color: "var(--text-secondary, #475569)", fontWeight: 600 }}>
              👤 {vendor.contactName}
            </span>
          )}
          {vendor.contactPhone && (
            <span style={{ fontSize: 14, color: "var(--text-secondary, #475569)" }}>
              {vendor.contactPhone}
            </span>
          )}
          {vendor.contactEmail && (
            <span style={{ fontSize: 14, color: "var(--text-secondary, #475569)" }}>
              {vendor.contactEmail}
            </span>
          )}
        </div>
      )}

      {/* Notes (expandable) */}
      {vendor.notes && (
        <>
          <button
            onClick={() => setExpanded((prev) => !prev)}
            style={{
              width: "100%",
              padding: "8px 18px",
              background: "transparent",
              border: "none",
              borderTop: "1px solid var(--border, #e2e8f0)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-muted, #94a3b8)",
              textAlign: "left",
            }}
          >
            <span>{expanded ? "▾" : "▸"}</span>
            {expanded ? "Ocultar notas" : "Ver notas"}
          </button>
          {expanded && (
            <div
              style={{
                padding: "10px 18px 14px",
                fontSize: 14,
                color: "var(--text-secondary, #475569)",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                borderTop: "1px solid var(--border, #e2e8f0)",
                background: "var(--surface, #f8fafc)",
              }}
            >
              {vendor.notes}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function VendorsEmployeeView({ initialVendors, branches }: Props) {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterBranch, setFilterBranch] = useState("");

  const filtered = initialVendors.filter((v) => {
    if (filterCategory && v.category !== filterCategory) return false;
    if (filterBranch) {
      const isGlobal = v.branchIds.length === 0;
      if (!isGlobal && !v.branchIds.includes(filterBranch)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        v.name.toLowerCase().includes(q) ||
        v.contactName?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--border, #e2e8f0)",
    background: "var(--input-bg, #f8fafc)",
    color: "var(--text-secondary, #475569)",
    fontSize: 14,
    fontWeight: 500,
    outline: "none",
    cursor: "pointer",
    minWidth: 130,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 800,
            color: "var(--text-primary, #1e293b)",
            letterSpacing: "-0.02em",
          }}
        >
          Proveedores
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text-muted, #94a3b8)" }}>
          Directorio de contactos y proveedores disponibles
        </p>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div style={{ position: "relative", flex: "1 1 180px", minWidth: 160 }}>
          <span
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 12,
              color: "var(--text-muted, #94a3b8)",
              pointerEvents: "none",
            }}
          >
            🔍
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            style={{
              width: "100%",
              padding: "8px 10px 8px 30px",
              borderRadius: 8,
              border: "1px solid var(--border, #e2e8f0)",
              background: "var(--input-bg, #f8fafc)",
              color: "var(--text-primary, #1e293b)",
              fontSize: 14,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={selectStyle}
        >
          <option value="">Todas las categorías</option>
          {VENDOR_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        {branches.length > 0 && (
          <select
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
            style={selectStyle}
          >
            <option value="">Todas las ubicaciones</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Results */}
      <div style={{ fontSize: 12, color: "var(--text-muted, #94a3b8)", marginBottom: 14 }}>
        {filtered.length} {filtered.length === 1 ? "proveedor" : "proveedores"}
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "60px 24px",
            gap: 10,
            border: "1px dashed var(--border, #e2e8f0)",
            borderRadius: 12,
          }}
        >
          <span style={{ fontSize: 40 }}>🏪</span>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text-primary, #1e293b)" }}>
            Sin proveedores disponibles
          </h3>
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted, #94a3b8)", textAlign: "center" }}>
            {search || filterCategory || filterBranch
              ? "Probá ajustando los filtros."
              : "Aún no hay proveedores asignados a tu ubicación."}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 14,
          }}
        >
          {filtered.map((v) => (
            <VendorCard key={v.id} vendor={v} />
          ))}
        </div>
      )}
    </div>
  );
}
