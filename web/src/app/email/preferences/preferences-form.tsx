"use client";

import { useState } from "react";
import type { QboReportFrequency } from "@/modules/integrations/qbo-r365/services/report-preferences.service";
import {
  getInitialQboReportFrequency,
  getQboReportPreferenceConfirmation,
} from "@/modules/integrations/qbo-r365/services/report-preference-ui";
import styles from "./preferences.module.css";

const OPTIONS: Array<{ value: QboReportFrequency; title: string; description: string }> = [
  { value: "weekly", title: "Weekly", description: "A performance summary every week." },
  { value: "monthly", title: "Monthly", description: "Just one summary a month." },
  { value: "off", title: "Turn off the report", description: "Stop the performance report emails entirely." },
];

export function PreferencesForm({
  token,
  email,
  currentFrequency,
  unsubscribeRequested,
}: {
  token: string;
  email: string;
  currentFrequency: QboReportFrequency;
  unsubscribeRequested: boolean;
}) {
  const [selected, setSelected] = useState(() =>
    getInitialQboReportFrequency(currentFrequency, unsubscribeRequested));
  const [savedFrequency, setSavedFrequency] = useState<QboReportFrequency | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const currentCadenceLabel = currentFrequency === "monthly" ? "monthly" : "weekly";

  async function savePreference() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/email/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token, frequency: selected }),
      });
      if (!response.ok) throw new Error();
      setSavedFrequency(selected);
    } catch {
      setError("This preferences link is invalid. Please check the link from your report.");
    } finally {
      setSaving(false);
    }
  }

  if (savedFrequency) {
    return (
      <div className={styles.saved} role="status" aria-live="polite">
        <div className={styles.check} aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <path d="M6 13.5l4.5 4.5L20 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2>Preferences saved</h2>
        <p>{getQboReportPreferenceConfirmation(savedFrequency)}</p>
        <button className={styles.undo} type="button" onClick={() => setSavedFrequency(null)}>
          Change again
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1>{unsubscribeRequested ? `Unsubscribe from the ${currentCadenceLabel} report?` : "How often should we email you?"}</h1>
      <p className={styles.lede}>
        {unsubscribeRequested
          ? "You can turn it off, or just switch to a lighter monthly cadence instead."
          : "Choose how often you'd like to receive your GetBackplate performance report."}
      </p>
      <p className={styles.forWho}>Managing preferences for <b>{email}</b></p>

      <fieldset className={styles.options}>
        <legend className={styles.srOnly}>Report frequency</legend>
        {OPTIONS.map((option) => (
          <label className={`${styles.option} ${selected === option.value ? styles.selected : ""}`} key={option.value}>
            <input
              className={styles.srOnly}
              type="radio"
              name="frequency"
              value={option.value}
              checked={selected === option.value}
              onChange={() => setSelected(option.value)}
            />
            <span className={styles.radio} aria-hidden="true" />
            <span>
              <span className={styles.optionTitle}>{option.title}</span>
              <span className={styles.optionDescription}>{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className={styles.alwaysOn}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 1.5l5.5 2.5v3.5c0 3-2.3 5.4-5.5 6.5-3.2-1.1-5.5-3.5-5.5-6.5V4L8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        <div><b>Account &amp; service alerts</b> (billing and important account notices) are always on and aren&apos;t affected by this setting.</div>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.save} type="button" disabled={saving} onClick={savePreference}>
        {saving ? "Saving..." : "Save preferences"}
      </button>
    </div>
  );
}
