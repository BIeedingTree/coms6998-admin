import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminAccess } from "@/lib/auth";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const destination = (path: string) => {
    const response = NextResponse.redirect(new URL(path, url.origin));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  if (!code) return destination("/login?reason=auth");
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return destination("/login?reason=auth");
    const access = await getAdminAccess();
    if (access.status === "anonymous") return destination("/login?reason=auth");
    return destination(access.status === "authorized" ? "/admin" : `/access-denied?reason=${access.status}`);
  } catch { return destination("/login?reason=auth"); }
}
