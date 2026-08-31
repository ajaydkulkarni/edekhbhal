const E2E_ALLOWED_APP_URLS = new Set([
  "https://edekhbhal-staging.vercel.app",
  "https://edekhbhal.vercel.app"
]);

function normalizeUrl(value: string | undefined) {
  return (value || "").trim().replace(/\/+$/, "");
}

export function isE2ETestingEnabled() {
  const appUrl = normalizeUrl(process.env.APP_URL);
  return process.env.E2E_TESTING_ENABLED === "true" && E2E_ALLOWED_APP_URLS.has(appUrl);
}

export function assertAllowedE2EBaseUrl(value: string) {
  const normalized = normalizeUrl(value);
  if (!E2E_ALLOWED_APP_URLS.has(normalized)) {
    throw new Error(
      `Refusing to run E2E against unapproved URL: ${normalized || "(empty)"}. ` +
      `Allowed targets: ${Array.from(E2E_ALLOWED_APP_URLS).join(", ")}`
    );
  }
  return normalized;
}
