import { createAuthClient } from "better-auth/client";

let client: ReturnType<typeof createAuthClient> | undefined;
function authClient() {
  // Lazy creation keeps anonymous/offline imports independent of auth and network availability.
  if (!client) client = createAuthClient({
    baseURL: window.location.origin, basePath: "/api/auth",
    fetchOptions: { credentials: "same-origin", retry: 0 },
  });
  return client;
}

export async function signInWithGitHub(): Promise<void> {
  const result = await authClient().signIn.social({ provider: "github", callbackURL: "/" });
  if (result.error) throw new Error("auth-unavailable");
}

export async function getSignedInUser(): Promise<{ id: string } | null> {
  const result = await authClient().getSession();
  if (result.error) throw new Error("auth-unavailable");
  return result.data ? { id: result.data.user.id } : null;
}

export async function signOut(): Promise<void> {
  const result = await authClient().signOut();
  if (result.error) throw new Error("auth-unavailable");
}
