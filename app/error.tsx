"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="message-page"><section className="panel message-card" role="alert"><h1>Workspace unavailable</h1><p>We could not verify access or connect to Supabase. Check the application configuration and try again.</p><button className="button primary" onClick={reset}>Try again</button></section></main>;
}
