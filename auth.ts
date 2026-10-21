import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { resolveRole, type Role } from "@/lib/roles";

declare module "next-auth" {
  interface Session {
    role?: Role;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    // Only emails that map to a role may sign in at all.
    async signIn({ profile }) {
      if (!profile?.email_verified) return false;
      return (await resolveRole(profile.email)) !== null;
    },
    async jwt({ token }) {
      // Re-resolve on each token refresh so removing someone from the sheet revokes access.
      token.role = await resolveRole(token.email);
      return token;
    },
    async session({ session, token }) {
      session.role = (token.role as Role | null) ?? undefined;
      return session;
    },
  },
});
