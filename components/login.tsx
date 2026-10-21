"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
export function LoginButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function login() {
    setPending(true); setError("");
    try {
      const { error } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { prompt: "select_account" } } });
      if (error) throw error;
    } catch { setError("Google sign-in could not be started. Check the Supabase configuration and try again."); setPending(false); }
  }
  return <>{error && <p role="alert" className="notice error">{error}</p>}<button className="button primary login-button" onClick={login} disabled={pending}><span className="google-g" aria-hidden="true">G</span>{pending ? "Connecting to Google…" : "Continue with Google"}<span aria-hidden="true">→</span></button></>;
}
