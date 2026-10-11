import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchRevocation } from "./revocation";

class FakeDoc extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
  show() {
    this.visibilityState = "visible";
    this.dispatchEvent(new Event("visibilitychange"));
  }
  hide() {
    this.visibilityState = "hidden";
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

describe("watchRevocation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const start = (recheck: (() => Promise<boolean>) | undefined, doc = new FakeDoc()) => {
    const onRevoke = vi.fn();
    const stop = watchRevocation({ recheck, onRevoke, intervalMs: 60_000, timeoutMs: 1_000, doc });
    return { onRevoke, stop, doc };
  };

  it("rechecks every minute and keeps playing while the clip stays allowed", async () => {
    const recheck = vi.fn(async () => true);
    const { onRevoke } = start(recheck);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(recheck).toHaveBeenCalledTimes(3);
    expect(onRevoke).not.toHaveBeenCalled();
  });

  it("revokes once when the clip is disabled, and stops checking", async () => {
    let allowed = true;
    const recheck = vi.fn(async () => allowed);
    const { onRevoke } = start(recheck);
    await vi.advanceTimersByTimeAsync(60_000);
    allowed = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onRevoke).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(recheck).toHaveBeenCalledTimes(2);
    expect(onRevoke).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a check errors or never answers", async () => {
    const failing = start(() => Promise.reject(new Error("synthetic")));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(failing.onRevoke).toHaveBeenCalledTimes(1);

    const hung = start(() => new Promise<boolean>(() => {}));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(hung.onRevoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(hung.onRevoke).toHaveBeenCalledTimes(1);

    const missing = start(undefined);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(missing.onRevoke).toHaveBeenCalledTimes(1);
  });

  it("checks again when the page becomes visible, not when it is hidden", async () => {
    const recheck = vi.fn(async () => false);
    const { onRevoke, doc } = start(recheck);
    doc.hide();
    await vi.advanceTimersByTimeAsync(0);
    expect(recheck).not.toHaveBeenCalled();
    doc.show();
    await vi.advanceTimersByTimeAsync(0);
    expect(recheck).toHaveBeenCalledTimes(1);
    expect(onRevoke).toHaveBeenCalledTimes(1);
  });

  it("runs one check at a time", async () => {
    const recheck = vi.fn(() => new Promise<boolean>((r) => setTimeout(() => r(true), 500)));
    const { doc } = start(recheck);
    doc.show();
    doc.show();
    await vi.advanceTimersByTimeAsync(0);
    expect(recheck).toHaveBeenCalledTimes(1);
  });

  it("does nothing after it is stopped, even if a check answers late", async () => {
    let answer: (v: boolean) => void = () => {};
    const { onRevoke, stop, doc } = start(() => new Promise<boolean>((r) => (answer = r)));
    doc.show();
    stop();
    answer(false);
    await vi.advanceTimersByTimeAsync(300_000);
    doc.show();
    expect(onRevoke).not.toHaveBeenCalled();
  });
});
