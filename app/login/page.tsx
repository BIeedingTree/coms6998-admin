import { LoginButton } from "@/components/login";

const reasons: Record<string, string> = {
  auth: "Sign-in was not completed. Please try again.",
  configuration: "Supabase authentication is not configured. Check the environment variables before signing in.",
  signout: "Sign-out could not be completed. Please try again.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <main className="login-page">
      <section className="login-card">
        <h1>Say It Better</h1>
        <h2>Administration</h2>
        <p>Sign in to manage users, captions, and ratings.</p>
        {reason && reasons[reason] && <p className="notice error" role="alert">{reasons[reason]}</p>}
        <LoginButton />
        <p className="login-help">Only accounts with superadmin access can continue.</p>
      </section>
    </main>
  );
}
