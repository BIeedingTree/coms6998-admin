import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseProjectUrl } from "@/lib/supabase/config";

// This is the ONLY privileged-client factory. It is never exported. Identity
// comes from Supabase Auth, and the role comes from the database on every call.
export async function getAdminAccess() {
  const session = await createClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return { status: "anonymous" as const };
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return { status: "configuration" as const };
  const db = createSupabaseClient(getSupabaseProjectUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  // The old app's column grants exclude is_superadmin. This narrowly scoped
  // privileged lookup runs before any admin data is read or client is returned.
  const { data: profile, error: profileError } = await db.from("profiles")
    .select("id,first_name,last_name,is_superadmin").eq("id", user.id).maybeSingle();
  if (profileError) return { status: "configuration" as const };
  if (profile?.is_superadmin !== true) return { status: "denied" as const };
  return { status: "authorized" as const, db, user, profile };
}

export async function requireAdmin() {
  const access = await getAdminAccess();
  if (access.status === "anonymous") redirect("/login");
  if (access.status !== "authorized") redirect(`/access-denied?reason=${access.status}`);
  return access;
}
