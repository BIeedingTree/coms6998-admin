import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { Icon } from "@/components/icons";
export default async function AccessDenied({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const configuration = (await searchParams).reason === "configuration";
  return <main className="message-page"><section className="panel message-card"><span className="icon-tile"><Icon name="shield"/></span><p className="eyebrow">RESTRICTED WORKSPACE</p><h1>{configuration ? "Admin access needs setup" : "Access denied"}</h1><p>{configuration ? "The server cannot verify your admin role. Check SUPABASE_SERVICE_ROLE_KEY and confirm that profiles.is_superadmin exists in this Supabase project. Access stays closed until verification succeeds." : "Your account is signed in, but it does not have superadmin access. The project owner must set profiles.is_superadmin to TRUE in Supabase."}</p><div className="form-actions"><form action={signOut}><button className="button secondary">Sign out</button></form><Link className="button primary" href="/admin">Check access again</Link></div></section></main>;
}
