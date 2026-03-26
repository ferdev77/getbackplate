"use client";

import { useState } from "react";

export function RecurrenceSelector({
  initialType = "daily",
  initialDays = [],
}: {
  initialType?: string;
  initialDays?: number[];
}) {
  const [type, setType] = useState<string>(initialType);
  const [days, setDays] = useState<number[]>(initialDays);

  const toggleDay = (day: number) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const daysOfWeek = [
    { value: 1, label: "L" },
    { value: 2, label: "M" },
    { value: 3, label: "M" },
    { value: 4, label: "J" },
    { value: 5, label: "V" },
    { value: 6, label: "S" },
    { value: 0, label: "D" },
  ];

  return (
    <div className="mt-2 rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] p-3">
      <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#888]">
        Frecuencia
      </label>
      <select
        name="recurrence_type"
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="mb-3 w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-white px-3 py-2 text-sm text-[#111]"
      >
        <option value="daily">Diaria</option>
        <option value="weekly">Semanal</option>
        <option value="monthly">Mensual</option>
        <option value="yearly">Anual</option>
        <option value="custom_days">Días Específicos</option>
      </select>

      {type === "custom_days" && (
        <div>
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#888]">
            Días de la semana
          </label>
          <div className="flex gap-1.5">
            {daysOfWeek.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                className={`h-8 w-8 rounded-full text-xs font-bold transition-colors ${
                  days.includes(d.value)
                    ? "bg-[#111] text-white"
                    : "bg-[#e8e8e8] text-[#555] hover:bg-[#ddd]"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
      
      <input type="hidden" name="custom_days" value={JSON.stringify(days)} />
    </div>
  );
}
