import { betterAuth } from "better-auth";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { APIError, createAuthMiddleware } from "better-auth/api";
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
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!["/sign-in/social", "/link-social"].includes(ctx.path) || ctx.body?.provider !== "github"
          || ctx.body.scopes === undefined) return;
        const scopes: unknown = ctx.body.scopes;
        if (!Array.isArray(scopes) || scopes.some((scope) => scope !== "read:user" && scope !== "user:email")) {
          throw new APIError("BAD_REQUEST", { code: "OAUTH_SCOPE_NOT_ALLOWED", message: "OAuth scope not allowed" });
        }
        // Better Auth appends request scopes: retain only the fixed server-configured permissions.
        return { context: { body: { ...ctx.body, scopes: [] } } };
      }),
    },
    advanced: {
      useSecureCookies: config.publicOrigin.startsWith("https:"), crossSubDomainCookies: { enabled: false },
      disableCSRFCheck: false, disableOriginCheck: false,
    },
    session: { cookieCache: { enabled: false } },
    logger: { disabled: true },
    // Unexpected errors must reach Express's sanitizer, not better-call's raw console fallback.
    onAPIError: { throw: true },
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
