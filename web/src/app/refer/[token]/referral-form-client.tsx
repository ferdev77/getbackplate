"use client";

import { useState } from "react";

type Props = {
  token: string;
  referrerName: string;
  referrerInitials: string;
};

type FormState = "idle" | "submitting" | "success" | "error";

export function ReferralFormClient({ token, referrerName, referrerInitials }: Props) {
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("submitting");
    setErrorMsg("");

    const fd = new FormData(e.currentTarget);
    const body = {
      token,
      vendorCompany: fd.get("vendor_company") as string,
      vendorContactName: fd.get("vendor_contact") as string,
      vendorEmail: fd.get("vendor_email") as string,
      vendorPhone: fd.get("vendor_phone") as string,
    };

    try {
      const res = await fetch("/api/refer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(json.error ?? "Something went wrong. Please try again.");
        setState("error");
      } else {
        setState("success");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div style={{
        background: "#FFFFFF",
        border: "1px solid #E6E8EE",
        borderRadius: 16,
        padding: 32,
        textAlign: "center",
      }}>
        <div style={{
          width: 48, height: 48,
          background: "#E7F5EC",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px",
        }}>
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
            <path d="M3 8L6.5 11.5L13 5" stroke="#15803D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#14151A", letterSpacing: "-0.01em" }}>
          Referral sent!
        </p>
        <p style={{ margin: 0, fontSize: 14, color: "#595B66", lineHeight: 1.55 }}>
          We&apos;ll reach out to them shortly. Thanks for spreading the word!
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} autoComplete="on">

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#FFFFFF",
        border: "1px solid #E6E8EE",
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 24,
      }}>
        <div style={{
          flexShrink: 0,
          width: 36, height: 36,
          background: "#FCE9DF",
          color: "#A23E12",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: "-0.02em",
        }}>
          {referrerInitials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: "#8A8C95", marginBottom: 2 }}>
            Referring as
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#14151A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
            {referrerName}
          </div>
        </div>
      </div>

      <div style={{
        background: "#FFFFFF",
        border: "1px solid #E6E8EE",
        borderRadius: 16,
        padding: 32,
      }}>

        {(["vendor_company", "vendor_contact", "vendor_email", "vendor_phone"] as const).map((name, i) => {
          const labels: Record<string, string> = {
            vendor_company: "Vendor name",
            vendor_contact: "Contact name",
            vendor_email: "Contact email",
            vendor_phone: "Contact phone",
          };
          const placeholders: Record<string, string> = {
            vendor_company: "e.g. Hidalgo Distribution",
            vendor_contact: "Your contact at the vendor",
            vendor_email: "name@company.com",
            vendor_phone: "+1 (___) ___-____",
          };
          const types: Record<string, string> = {
            vendor_email: "email",
            vendor_phone: "tel",
          };

          return (
            <div key={name} style={{ marginBottom: i < 3 ? 20 : 0 }}>
              <label
                htmlFor={name}
                style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#14151A", marginBottom: 6, letterSpacing: "-0.005em" }}
              >
                {labels[name]}<span style={{ color: "#D4531A", marginLeft: 2 }}>*</span>
              </label>
              <input
                type={types[name] ?? "text"}
                id={name}
                name={name}
                required
                placeholder={placeholders[name]}
                disabled={state === "submitting"}
                style={{
                  width: "100%",
                  fontFamily: "inherit",
                  fontSize: 15,
                  color: "#14151A",
                  background: "#F7F8FC",
                  border: "1px solid #E6E8EE",
                  borderRadius: 6,
                  padding: "12px 14px",
                  boxSizing: "border-box" as const,
                  outline: "none",
                  opacity: state === "submitting" ? 0.6 : 1,
                }}
              />
            </div>
          );
        })}

        {state === "error" && (
          <p style={{ margin: "16px 0 0", fontSize: 13, color: "#b91c1c" }}>{errorMsg}</p>
        )}

        <div style={{ marginTop: 28 }}>
          <button
            type="submit"
            disabled={state === "submitting"}
            style={{
              width: "100%",
              background: state === "submitting" ? "#A23E12" : "#D4531A",
              color: "#FFFFFF",
              border: "none",
              fontFamily: "inherit",
              fontSize: 15,
              fontWeight: 600,
              padding: "14px 24px",
              borderRadius: 6,
              cursor: state === "submitting" ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {state === "submitting" ? "Sending…" : "Send referral"}
            {state !== "submitting" && (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3 8H13M13 8L8 3M13 8L8 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>

      </div>
    </form>
  );
}
