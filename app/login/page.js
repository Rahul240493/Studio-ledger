"use client";
import { signIn } from "next-auth/react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

const MESSAGES = {
  AccessDenied: "That Google account doesn't have access. Ask a partner to add you under Team access.",
  Configuration: "The app's sign-in settings aren't complete yet. Check NEXTAUTH_SECRET, NEXTAUTH_URL and the Google client ID and secret in Vercel, then redeploy.",
  OAuthSignin: "Google sign-in couldn't start. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel.",
  OAuthCallback: "Google sent you back but the app couldn't finish signing in. Check the redirect URI in Google Cloud matches this site exactly.",
  Callback: "Google sent you back but the app couldn't finish signing in. Check the redirect URI in Google Cloud matches this site exactly.",
};

function Login() {
  const err = useSearchParams().get("error");
  return (
    <main className="login">
      <div className="login-box">
        <div className="brand big">Studio Ledger</div>
        <p className="muted">Madking Studios · Space &amp; Gravity</p>
        {err && <div className="banner">{MESSAGES[err] || "Sign-in didn't work. Try again."}<div className="hint" style={{ marginTop: 6 }}>Code: {err}</div></div>}
        <button className="btn primary wide-btn" onClick={() => signIn("google", { callbackUrl: "/" })}>Sign in with Google</button>
      </div>
    </main>
  );
}
export default function Page() { return <Suspense><Login /></Suspense>; }
