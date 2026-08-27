const STAGING_HOST = "edekhbhal-staging.vercel.app";

function normalizeHost(value: string | undefined) {
  if (!value) return "";
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).host.toLowerCase();
  } catch {
    return value.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  }
}

export function isDemoDataEnabled() {
  if ((process.env.DEMO_DATA_ENABLED ?? "").toLowerCase() !== "true") return false;

  const appHost = normalizeHost(process.env.APP_URL);
  const vercelProductionHost = normalizeHost(process.env.VERCEL_PROJECT_PRODUCTION_URL);

  // Defense in depth: the feature must explicitly be enabled AND the deployment
  // must identify itself as the known eDekhbhal staging application.
  return appHost === STAGING_HOST || vercelProductionHost === STAGING_HOST;
}
