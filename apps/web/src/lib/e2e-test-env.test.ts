// The e2e overrides (MAILPIT_URL, E2E_PORT) accept only safe values (Sol R5 on #38).
import { describe, expect, it } from "vitest";
import { e2ePort, mailpitUrl } from "../../e2e/helpers/test-env";

describe("e2e test environment", () => {
  it("accepts loopback http(s) Mailpit URLs and the default", () => {
    expect(mailpitUrl({})).toBe("http://127.0.0.1:54324");
    expect(mailpitUrl({ MAILPIT_URL: "http://127.0.0.1:55524" })).toBe("http://127.0.0.1:55524");
    expect(mailpitUrl({ MAILPIT_URL: "http://localhost:8025/" })).toBe("http://localhost:8025");
    expect(mailpitUrl({ MAILPIT_URL: "https://[::1]:8025" })).toBe("https://[::1]:8025");
  });
  it.each(["https://mail.example.com", "http://10.0.0.5:8025", "ftp://127.0.0.1", "http://user:pw@127.0.0.1:8025", "http://127.0.0.1.example.com", "not a url"])(
    "refuses MAILPIT_URL=%s",
    (value) => expect(() => mailpitUrl({ MAILPIT_URL: value })).toThrow(/MAILPIT_URL/),
  );
  it("accepts unprivileged ports and the default", () => {
    expect(e2ePort({})).toBe(3100);
    expect(e2ePort({ E2E_PORT: "3400" })).toBe(3400);
    expect(e2ePort({ E2E_PORT: "65535" })).toBe(65535);
  });
  it.each(["80", "1023", "65536", "3400abc", "-1", "", "3.5"])("refuses E2E_PORT=%s", (value) =>
    expect(() => e2ePort({ E2E_PORT: value })).toThrow(/E2E_PORT/),
  );
});
