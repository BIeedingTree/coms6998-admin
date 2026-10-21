import { requireAdmin } from "@/lib/auth";
import { displayName } from "@/lib/media";
import { Sidebar } from "@/components/sidebar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, user } = await requireAdmin();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <Sidebar name={displayName(profile)} email={user.email ?? ""} />
      <main id="main" className="main">{children}</main>
    </div>
  );
}
