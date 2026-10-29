import Link from "next/link";
import { PAGE_SIZE } from "@/lib/data";
import { Icon, type IconName } from "@/components/icons";
export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p className="muted">{description}</p></div>{action}</header>;
}
export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty"><h3>{title}</h3><p>{children}</p></div>;
}
export function Search({ q, placeholder }: { q: string; placeholder: string }) {
  return <form className="search" role="search"><label className="sr-only" htmlFor="search">{placeholder}</label><span aria-hidden="true">⌕</span><input id="search" name="q" defaultValue={q} placeholder={placeholder} maxLength={100}/><button className="button secondary" type="submit">Search</button>{q && <Link className="text-link" href="?">Clear</Link>}</form>;
}
export function Pagination({ count, page, path, q = "", vote = "", view = "" }: { count: number; page: number; path: string; q?: string; vote?: string; view?: string }) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const href = (target: number) => `${path}?${new URLSearchParams({ page: String(target), ...(q ? { q } : {}), ...(vote ? { vote } : {}), ...(view ? { view } : {}) })}`;
  return <div className="pagination"><span>{count.toLocaleString()} records · Page {page} of {pages}</span><div>{page > 1 && <Link className="button secondary" href={href(Math.min(page - 1, pages))}>Previous</Link>}{page < pages && <Link className="button secondary" href={href(page + 1)}>Next <span aria-hidden="true">→</span></Link>}</div></div>;
}
export function Stat({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: IconName }) {
  return <article className="stat"><div className="stat-label">{label}<Icon name={icon}/></div><div className="stat-value">{value}</div><p>{detail}</p></article>;
}
