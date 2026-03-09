import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { findOrCreateGoogleCustomer } from "@/lib/customer-account";

const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

const providers: NextAuthOptions["providers"] = [];

if (googleClientId && googleClientSecret) {
  providers.push(
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    })
  );
} else {
  providers.push(
    CredentialsProvider({
      name: "disabled",
      credentials: {},
      async authorize() {
        return null;
      },
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      const email = user.email?.toLowerCase().trim();
      if (!email) return false;

      if (account?.provider === "google") {
        await findOrCreateGoogleCustomer({
          email,
          firstName: user.name?.split(" ")[0] || "",
          lastName: user.name?.split(" ").slice(1).join(" ") || "",
        });
      }
      return true;
    },
  },
};

export function isGoogleOAuthConfigured() {
  return Boolean(googleClientId && googleClientSecret);
}

