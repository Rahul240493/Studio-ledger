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
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // Only partners (from PARTNER_EMAILS) and people on the Team tab may sign in.
    async signIn({ user }) {
      const role = await roleFor(user?.email);
      return role ? true : "/login?error=AccessDenied";
    },
  },
};
