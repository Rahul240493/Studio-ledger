import "./settings";
import GoogleProvider from "next-auth/providers/google";
import { roleFor } from "./access";

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  // Write the real reason for a failed sign-in to Vercel's logs (Logs tab, search "SIGN-IN").
  logger: {
    error(code, meta) {
      const m = meta?.error || meta;
      console.error("SIGN-IN ERROR", code, m?.message || "", m?.error || "", m?.error_description || "", JSON.stringify(m?.data || m?.cause || "").slice(0, 300));
    },
  },
  callbacks: {
    // Only partners (from PARTNER_EMAILS) and people on the Team tab may sign in.
    async signIn({ user }) {
      const role = await roleFor(user?.email);
      return role ? true : "/login?error=AccessDenied";
    },
  },
};
