"use client";

import { useState } from "react";

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
  "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
  "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
  "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming",
];

const LOC_OPTIONS = ["1", "2", "3–5", "6–10", "10+"];

const INPUT_BASE =
  "w-full rounded-[10px] border px-4 py-3.5 text-[14px] bg-white outline-none transition-all focus:border-[var(--gbp-accent)] focus:shadow-[0_0_0_3px_rgba(212,83,26,0.12)] placeholder:text-[#9CA3AF] dark:bg-[#13161E] dark:text-[var(--gbp-text)]";
const INPUT_NORMAL = "border-[#D1D5DB] dark:border-[#343748]";
const INPUT_ERROR = "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)]";

type Props = {
  open: boolean;
  onClose: () => void;
  toEmail: string;
  planName: string;
  source?: string;
};

export function RequestSeatModal({ open, onClose, toEmail, planName, source }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState("");
  const [restaurant, setRestaurant] = useState("");
  const [locations, setLocations] = useState("");
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  function reset() {
    setName(""); setEmail(""); setPhone(""); setState("");
    setRestaurant(""); setLocations(""); setErrors(new Set()); setStatus("idle");
  }

  function handleClose() {
    onClose();
    setTimeout(reset, 300);
  }

  async function handleSubmit() {
    const invalid = new Set<string>();
    if (!name.trim()) invalid.add("name");
    if (!email.trim() || !email.includes("@")) invalid.add("email");
    if (!restaurant.trim()) invalid.add("restaurant");
    if (!state) invalid.add("state");
    if (!locations) invalid.add("locations");

    if (invalid.size > 0) {
      setErrors(invalid);
      setTimeout(() => setErrors(new Set()), 1800);
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/api/landing/seat-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, phone, state, restaurant, locations, toEmail, planName, source }),
      });
      if (!res.ok) throw new Error("failed");
      setStatus("success");
      setTimeout(handleClose, 2500);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2200);
    }
  }

  if (!open) return null;

  const err = (field: string) => errors.has(field);

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="relative w-[min(560px,90vw)] rounded-[20px] bg-white p-[44px_40px] shadow-2xl dark:bg-[#1A1D27] dark:border dark:border-[#252836]">

        {/* Close */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--gbp-bg2)] text-lg leading-none text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-border2)]"
        >×</button>

        {/* Header */}
        <div className="mb-6">
          <span className="mb-3.5 inline-flex items-center rounded-full border border-[var(--gbp-accent)]/20 bg-[var(--gbp-accent-glow)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-accent)]">
            First Table Program
          </span>
          <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#111827] dark:text-[var(--gbp-text)]">
            Request Your Seat
          </h2>
          <p className="mt-1.5 text-[14px] text-[#6B7280] dark:text-[var(--gbp-text2)]">
            By invitation only. A real person will reach out within 24 hours.
          </p>
        </div>

        {/* Row 1: Name + Email */}
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Full Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Maria Andrade"
              className={`${INPUT_BASE} ${err("name") ? INPUT_ERROR : INPUT_NORMAL}`}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@restaurant.com"
              className={`${INPUT_BASE} ${err("email") ? INPUT_ERROR : INPUT_NORMAL}`}
            />
          </div>
        </div>

        {/* Row 2: Phone + State */}
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              className={`${INPUT_BASE} ${INPUT_NORMAL}`}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">State *</label>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className={`${INPUT_BASE} cursor-pointer ${err("state") ? INPUT_ERROR : INPUT_NORMAL}`}
            >
              <option value="" disabled>Select state</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Restaurant */}
        <div className="mb-3">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Restaurant Name *</label>
          <input
            type="text"
            value={restaurant}
            onChange={(e) => setRestaurant(e.target.value)}
            placeholder="e.g. Red Salsa Kitchen"
            className={`${INPUT_BASE} ${err("restaurant") ? INPUT_ERROR : INPUT_NORMAL}`}
          />
        </div>

        {/* Locations */}
        <div className="mb-7">
          <label className="mb-2.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Number of Locations *</label>
          <div className="flex flex-wrap gap-2">
            {LOC_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setLocations(opt)}
                className={`rounded-[8px] border px-4 py-2 text-[13px] font-semibold transition-all ${
                  locations === opt
                    ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent)] text-white"
                    : err("locations")
                    ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-text2)]"
                    : "border-[#D1D5DB] text-[var(--gbp-text2)] hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] dark:border-[#343748]"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={status === "loading" || status === "success"}
          className={`w-full rounded-[10px] py-[15px] text-[15px] font-bold tracking-[0.01em] text-white transition-all disabled:cursor-not-allowed ${
            status === "success"
              ? "bg-emerald-500"
              : status === "error"
              ? "bg-[var(--gbp-text2)]"
              : "bg-[#111827] hover:-translate-y-px hover:bg-[#1F2937]"
          }`}
        >
          {status === "loading"
            ? "Sending..."
            : status === "success"
            ? "Seat Requested ✓"
            : status === "error"
            ? "Could not send. Try again"
            : "Request My Seat →"}
        </button>

        <p className="mt-3 text-center text-[11px] text-[#9CA3AF]">
          No credit card. No commitment. Just a conversation.
        </p>
      </div>
    </div>
  );
}
