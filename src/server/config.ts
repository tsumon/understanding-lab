export type Config = Readonly<{
  publicOrigin: string;
  port: number;
  dbPath: string;
  authSecret: string;
  githubClientId: string;
  githubClientSecret: string;
  tutorEnabled: boolean;
  tutorModel: string;
  transcribeModel: string;
  openaiApiKey: string;
  openaiBaseURL: string;
}>;

/** Only server entry points read environment; importing modules has no configuration side effects. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const fail = () => { throw new Error("configuration"); };
  const required = (key: string) => env[key]?.trim() || fail();
  const origin = required("PUBLIC_ORIGIN");
  let url: URL;
  try { url = new URL(origin); } catch { return fail(); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.origin !== origin || url.username || url.password
    || (url.protocol !== "https:" && !(url.protocol === "http:" && local && env.NODE_ENV !== "production"))) fail();
  const authSecret = required("BETTER_AUTH_SECRET");
  if (authSecret.length < 32) fail();
  const rawPort = env.PORT ?? "3001";
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isSafeInteger(port) || port < 1 || port > 65535) fail();
  const enabled = env.TUTOR_ENABLED ?? "false";
  if (!["false", "true"].includes(enabled)) fail();
  return {
    publicOrigin: url.origin, port, dbPath: env.DB_PATH?.trim() || "./data/understanding.sqlite",
    authSecret, githubClientId: required("GITHUB_CLIENT_ID"), githubClientSecret: required("GITHUB_CLIENT_SECRET"),
    tutorEnabled: enabled === "true", tutorModel: env.TUTOR_MODEL?.trim() || "",
    transcribeModel: env.TRANSCRIBE_MODEL?.trim() || "", openaiApiKey: env.OPENAI_API_KEY?.trim() || "",
    openaiBaseURL: env.OPENAI_BASE_URL?.trim() || "",
  };
}
