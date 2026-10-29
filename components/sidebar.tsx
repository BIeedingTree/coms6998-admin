"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { Icon, type IconName } from "@/components/icons";

const groups: { title: string; links: { href: string; label: string; icon: IconName }[] }[] = [
  { title: "Overview", links: [{ href: "/admin", label: "Dashboard", icon: "dashboard" }] },
  { title: "Content", links: [
    { href: "/admin/media", label: "Media", icon: "media" },
    { href: "/admin/images", label: "Images", icon: "media" },
    { href: "/admin/generation-requests", label: "Generation Requests", icon: "media" },
    { href: "/admin/generation-examples", label: "Generation Examples", icon: "media" },
    { href: "/admin/terms", label: "Terms", icon: "media" },
  ] },
  { title: "AI Configuration", links: [
    { href: "/admin/prompt-chains", label: "Prompt Chains", icon: "sparkles" },
    { href: "/admin/prompt-chain-steps", label: "Prompt Chain Steps", icon: "sparkles" },
    { href: "/admin/prompt-chain-mix", label: "Prompt Chain Mix", icon: "sparkles" },
    { href: "/admin/llm-providers", label: "LLM Providers", icon: "sparkles" },
    { href: "/admin/llm-models", label: "LLM Models", icon: "sparkles" },
    { href: "/admin/llm-responses", label: "LLM Responses", icon: "sparkles" },
  ] },
  { title: "Access Management", links: [
    { href: "/admin/users", label: "Users", icon: "users" },
    { href: "/admin/allowed-signup-domains", label: "Allowed Signup Domains", icon: "shield" },
    { href: "/admin/whitelisted-emails", label: "Whitelisted Emails", icon: "shield" },
  ] },
  { title: "Engagement", links: [{ href: "/admin/ratings", label: "Ratings", icon: "ratings" }] },
];

export function Sidebar({ name, email }: { name: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const selected = groups.flatMap(g => g.links).find(link => link.href === "/admin" ? pathname === link.href : pathname === link.href || pathname.startsWith(link.href + "/"))?.href ?? "/admin";
  return (
    <aside className="sidebar">
      <Link href="/admin" className="brand">Say It Better<small>Administration</small></Link>
      <div className="mobile-nav"><label className="sr-only" htmlFor="mobile-section">Admin section</label><select id="mobile-section" value={selected} onChange={event => router.push(event.target.value)}>{groups.map(group => <optgroup label={group.title} key={group.title}>{group.links.map(link => <option key={link.href} value={link.href}>{link.label}</option>)}</optgroup>)}</select></div>
      <nav aria-label="Admin navigation">
        {groups.map(group => <div className="nav-group" key={group.title}><h2>{group.title}</h2>{group.links.map(link => {
          const active = link.href === "/admin" ? pathname === link.href : pathname === link.href || pathname.startsWith(link.href + "/");
          return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={active ? "nav-item active" : "nav-item"}><Icon name={link.icon} />{link.label}</Link>;
        })}</div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="account"><strong>{name}</strong><small title={email}>{email}</small><small>Superadmin</small></div>
        <form action={signOut}><button className="signout">Sign out</button></form>
      </div>
    </aside>
  );
}
