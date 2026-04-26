function isTruthyEnvValue(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isReviewEnabled(): boolean {
  return isTruthyEnvValue(process.env.REVIEW_ENABLED);
}

export function isAdminModeEnabled(): boolean {
  return isTruthyEnvValue(process.env.ADMIN_MODE_ENABLED);
}

export function isPublicAdminModeEnabled(): boolean {
  return isTruthyEnvValue(process.env.NEXT_PUBLIC_ADMIN_MODE_ENABLED);
}

