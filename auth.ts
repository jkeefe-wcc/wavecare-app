import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { resolveIdentity, type Role } from "@/lib/roles";

declare module "next-auth" {
  interface Session {
    role?: Role;
    nurseId?: string;
  }
}

const RECHECK_MS = 5 * 60 * 1000; // re-read the sheet at most every 5 minutes per session

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    // Only emails that map to a role may sign in at all.
    async signIn({ profile }) {
      if (!profile?.email_verified) return false;
      return (await resolveIdentity(profile.email)).role !== null;
    },
    async jwt({ token }) {
      const checkedAt = (token.checkedAt as number | undefined) ?? 0;
      if (Date.now() - checkedAt > RECHECK_MS) {
        try {
          const id = await resolveIdentity(token.email);
          token.role = id.role;
          token.nurseId = id.nurseId;
          token.checkedAt = Date.now();
        } catch (err) {
          // Sheet unreachable: keep the last known role, retry next request; no role yet = no access.
          console.error("role re-check failed", err);
          if (token.role === undefined) token.role = null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.role = (token.role as Role | null) ?? undefined;
      session.nurseId = (token.nurseId as string | undefined) ?? undefined;
      return session;
    },
  },
});
