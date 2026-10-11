import { createHttp, type Http, type HttpOptions } from "./http";

export const REPO_URL = "https://github.com/ZeroSum-Solutions/spindle";
export const VERSION = "0.1";

export type Env = Readonly<Record<string, string | undefined>>;

export interface EvidenceContext {
  http: Http;
  env: Env;
  now: () => Date;
  /** Contact email from SPINDLE_CONTACT_EMAIL. Throws a clear error when unset. */
  requireEmail(): string;
  /** User-Agent string. Carries `mailto:` when the contact email is set. */
  userAgent(): string;
}

export interface ContextOptions extends Omit<HttpOptions, "now"> {
  env?: Env;
  now?: () => Date;
}

export function createContext(options: ContextOptions = {}): EvidenceContext {
  const env: Env = options.env ?? globalThis.process?.env ?? {};
  const email = env.SPINDLE_CONTACT_EMAIL?.trim() || undefined;
  const now = options.now ?? (() => new Date());
  return {
    http: createHttp({ ...options, now: () => now().getTime() }),
    env,
    now,
    requireEmail() {
      if (!email) {
        throw new Error(
          "SPINDLE_CONTACT_EMAIL is not set. Evidence APIs ask for a contact email in requests; set it in your environment (see .env.example).",
        );
      }
      return email;
    },
    userAgent() {
      const contact = email ? `; mailto:${email}` : "";
      return `Spindle/${VERSION} (+${REPO_URL}${contact})`;
    },
  };
}
