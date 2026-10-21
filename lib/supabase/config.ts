// Shared by browser, SSR, proxy, and the privileged server client.
// Supabase SDKs append /auth/v1 and /rest/v1 themselves.
export function getSupabaseProjectUrl(value = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  let url: URL;
  try {
    url = new URL(value?.trim() ?? "");
  } catch {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL to the Supabase project URL.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.search || url.hash ||
      !["/", "/rest/v1", "/rest/v1/"].includes(url.pathname)) {
    throw new Error("Use the Supabase project root URL without credentials, query parameters, or an API endpoint path.");
  }
  // Accept the REST URL commonly copied from the Data API panel, but give
  // every SDK client the project origin so OAuth never reaches the REST gateway.
  return url.origin;
}

export function getSupabasePublicConfig() {
  // Direct process.env references are required for Next.js build-time inlining.
  const url = getSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!key) throw new Error("Set NEXT_PUBLIC_SUPABASE_ANON_KEY to the project's public API key.");
  return { url, key };
}
