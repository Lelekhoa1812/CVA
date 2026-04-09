// Root Cause vs Logic:
// Root Cause: deployments that mount the app under a base path still hard-coded "/" API calls, so the client kept hitting the wrong route and received 404s.
// Logic: normalize the configured base path and prefix every API route with it before calling fetch so the browser always reaches the correct handler.
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "";

function normalizeBasePath(value: string) {
  if (!value) return "";
  const withoutTrailingSlash = value.replace(/\/+$/, "");
  if (!withoutTrailingSlash) return "";
  return withoutTrailingSlash.startsWith("/") ? withoutTrailingSlash : `/${withoutTrailingSlash}`;
}

const BASE_PATH = normalizeBasePath(rawBasePath);

export function buildApiUrl(route: string) {
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return `${BASE_PATH}${normalizedRoute}`;
}
