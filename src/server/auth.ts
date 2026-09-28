import { betterAuth } from "better-auth";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";
import type Database from "better-sqlite3";
import type { Config } from "./config";

export function createAuth(db: Database.Database, config: Config) {
  return betterAuth({
    database: db,
    secret: config.authSecret,
    baseURL: config.publicOrigin,
    trustedOrigins: [config.publicOrigin],
    socialProviders: {
      github: {
        clientId: config.githubClientId, clientSecret: config.githubClientSecret,
        disableDefaultScope: true, scope: ["read:user", "user:email"],
      },
    },
    advanced: {
      useSecureCookies: config.publicOrigin.startsWith("https:"), crossSubDomainCookies: { enabled: false },
      disableCSRFCheck: false, disableOriginCheck: false,
    },
    session: { cookieCache: { enabled: false } },
    logger: { disabled: true },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export const toAuthHandler = (auth: Auth) => toNodeHandler(auth);

export function createUserResolver(auth: Auth) {
  return async function resolveUser(headers: IncomingHttpHeaders): Promise<{ id: string } | null> {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
    return session ? { id: session.user.id } : null;
  };
}
