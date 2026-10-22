"use client";
import { signIn } from "next-auth/react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function Login() {
  const err = useSearchParams().get("error");
  return (
    <main className="login">
      <div className="login-box">
        <div className="brand big">Studio Ledger</div>
        <p className="muted">Madking Studios · Space &amp; Gravity</p>
        {err && <div className="banner">{err === "AccessDenied" ? "That Google account doesn't have access. Ask a partner to add you under Team access." : "Sign-in didn't work. Try again."}</div>}
        <button className="btn primary wide-btn" onClick={() => signIn("google", { callbackUrl: "/" })}>Sign in with Google</button>
      </div>
    </main>
  );
}
export default function Page() { return <Suspense><Login /></Suspense>; }
