export type BillingOnboardingTrack = "platform" | "integration";

export function shouldEnableRegistrationModule(
  module: { code: string; isCore: boolean },
  track: BillingOnboardingTrack,
) {
  return track === "integration" ? module.code === "dashboard" : module.isCore;
}
