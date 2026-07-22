import type { QboReportFrequency } from "./report-preferences.service";

export function getInitialQboReportFrequency(
  currentFrequency: QboReportFrequency,
  unsubscribeRequested: boolean,
): QboReportFrequency {
  return unsubscribeRequested ? "off" : currentFrequency;
}

export function getQboReportPreferenceConfirmation(frequency: QboReportFrequency): string {
  switch (frequency) {
    case "weekly":
      return "You'll keep getting your weekly report.";
    case "monthly":
      return "We'll send your report once a month from now on.";
    case "off":
      return "We've turned off the performance report. You'll still get account and service alerts.";
  }
}
