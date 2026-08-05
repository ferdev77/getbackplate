"use client";

import { useState } from "react";

type FormState = "idle" | "submitting" | "success" | "error";

export function PublicReferralFormClient() {
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("submitting");
    setErrorMsg("");

    const fd = new FormData(e.currentTarget);
    const body = {
      referrerName: fd.get("referrer_name") as string,
      referrerEmail: fd.get("referrer_email") as string,
      vendorCompany: fd.get("vendor_company") as string,
      vendorContactName: fd.get("vendor_contact_name") as string,
      vendorEmail: fd.get("vendor_email") as string,
    };

    try {
      const res = await fetch("/api/refer/public", {
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
        border: "1px solid #e5e7f0",
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
        <p style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#1a1a1a", letterSpacing: "-0.01em" }}>
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
        background: "#FFFFFF",
        border: "1px solid #e5e7f0",
        borderRadius: 16,
        padding: 32,
      }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: "0 0 14px", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", color: "#8A8C95" }}>YOU</p>
          <label htmlFor="referrer_name" style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 6, letterSpacing: "-0.005em" }}>
            Your name<span style={{ color: "#c04a17", marginLeft: 2 }}>*</span>
          </label>
          <input
            type="text"
            id="referrer_name"
            name="referrer_name"
            required
            maxLength={200}
            placeholder="e.g. Maria Lopez"
            disabled={state === "submitting"}
            style={{
              width: "100%",
              fontFamily: "inherit",
              fontSize: 15,
              color: "#1a1a1a",
              background: "#F7F8FC",
              border: "1px solid #e5e7f0",
              borderRadius: 6,
              padding: "12px 14px",
              boxSizing: "border-box" as const,
              outline: "none",
              opacity: state === "submitting" ? 0.6 : 1,
            }}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <label htmlFor="referrer_email" style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 2, letterSpacing: "-0.005em" }}>
            Your email<span style={{ color: "#c04a17", marginLeft: 2 }}>*</span>
          </label>
          <p style={{ margin: "0 0 6px", fontSize: 11, color: "#8A8C95" }}>Where we send updates on this referral.</p>
          <input type="email" id="referrer_email" name="referrer_email" required autoComplete="email" placeholder="you@company.com" disabled={state === "submitting"} style={{ width: "100%", fontFamily: "inherit", fontSize: 15, color: "#1a1a1a", background: "#F7F8FC", border: "1px solid #e5e7f0", borderRadius: 6, padding: "12px 14px", boxSizing: "border-box" as const, outline: "none", opacity: state === "submitting" ? 0.6 : 1 }} />
        </div>

        <div style={{ marginTop: 28 }}>
          <p style={{ margin: "0 0 14px", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", color: "#8A8C95" }}>THE VENDOR YOU&apos;RE REFERRING</p>
          <label htmlFor="vendor_company" style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 6, letterSpacing: "-0.005em" }}>
            Vendor name<span style={{ color: "#c04a17", marginLeft: 2 }}>*</span>
          </label>
          <input type="text" id="vendor_company" name="vendor_company" required maxLength={200} placeholder="e.g. Taco Palenque" disabled={state === "submitting"} style={{ width: "100%", fontFamily: "inherit", fontSize: 15, color: "#1a1a1a", background: "#F7F8FC", border: "1px solid #e5e7f0", borderRadius: 6, padding: "12px 14px", boxSizing: "border-box" as const, outline: "none", opacity: state === "submitting" ? 0.6 : 1 }} />
        </div>

        <div style={{ marginTop: 16 }}>
          <label htmlFor="vendor_contact_name" style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 2, letterSpacing: "-0.005em" }}>
            Contact name at the vendor<span style={{ color: "#c04a17", marginLeft: 2 }}>*</span>
          </label>
          <p style={{ margin: "0 0 6px", fontSize: 11, color: "#8A8C95" }}>The name we address the intro to. A person, not &quot;Hello there.&quot;</p>
          <input type="text" id="vendor_contact_name" name="vendor_contact_name" required maxLength={200} placeholder="e.g. their AP manager" disabled={state === "submitting"} style={{ width: "100%", fontFamily: "inherit", fontSize: 15, color: "#1a1a1a", background: "#F7F8FC", border: "1px solid #e5e7f0", borderRadius: 6, padding: "12px 14px", boxSizing: "border-box" as const, outline: "none", opacity: state === "submitting" ? 0.6 : 1 }} />
        </div>

        <div style={{ marginTop: 16 }}>
          <label
            htmlFor="vendor_email"
            style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 6, letterSpacing: "-0.005em" }}
          >
            Vendor&apos;s email<span style={{ color: "#c04a17", marginLeft: 2 }}>*</span>
          </label>
          <input
            type="email"
            id="vendor_email"
            name="vendor_email"
            required
            placeholder="name@vendor.com"
            disabled={state === "submitting"}
            style={{
              width: "100%",
              fontFamily: "inherit",
              fontSize: 15,
              color: "#1a1a1a",
              background: "#F7F8FC",
              border: "1px solid #e5e7f0",
              borderRadius: 6,
              padding: "12px 14px",
              boxSizing: "border-box" as const,
              outline: "none",
              opacity: state === "submitting" ? 0.6 : 1,
            }}
          />
        </div>

        {state === "error" && (
          <p style={{ margin: "16px 0 0", fontSize: 13, color: "#b91c1c" }}>{errorMsg}</p>
        )}

        <div style={{ marginTop: 28 }}>
          <button
            type="submit"
            disabled={state === "submitting"}
            style={{
              width: "100%",
              background: state === "submitting" ? "#9c3a12" : "#c04a17",
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
