"use client";
export default function AdminError({ reset }: { reset: () => void }) {
  return <section className="panel message-card" role="alert"><h1>Data could not be loaded</h1><p>Check your connection, the server’s Supabase credentials, and database permissions. No database policies were changed. Missing data is not shown as zero.</p><button className="button primary" onClick={reset}>Try again</button></section>;
}
