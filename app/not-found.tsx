import Link from "next/link";
export default function NotFound() { return <section className="panel message-card"><h1>Record not found</h1><p>This page or media item may have been removed.</p><Link className="button primary" href="/admin">Return to dashboard</Link></section>; }
