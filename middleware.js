import { withAuth } from "next-auth/middleware";
export default withAuth({ pages: { signIn: "/login" } });
export const config = { matcher: ["/((?!login|api|_next|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest).*)"] };
