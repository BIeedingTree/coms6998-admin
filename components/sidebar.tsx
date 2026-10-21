"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { Icon, type IconName } from "@/components/icons";

const links: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/media", label: "Media", icon: "media" },
  { href: "/admin/ratings", label: "Ratings", icon: "ratings" },
];

export function Sidebar({ name, email }: { name: string; email: string }) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <Link href="/admin" className="brand">Say It Better<small>Administration</small></Link>
      <nav aria-label="Admin navigation">
        {links.map(link => {
          const active = link.href === "/admin" ? pathname === link.href : pathname.startsWith(link.href);
          return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={active ? "nav-item active" : "nav-item"}><Icon name={link.icon} />{link.label}</Link>;
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="account"><strong>{name}</strong><small title={email}>{email}</small><small>Superadmin</small></div>
        <form action={signOut}><button className="signout">Sign out</button></form>
      </div>
    </aside>
  );
}
