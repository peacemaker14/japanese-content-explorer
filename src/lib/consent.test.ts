import { describe, it, expect } from "vitest";
import { safeNext } from "./consent";
import { authorizedCron } from "./cron-auth";
describe("safe next destination", () => {
  it("retains only local discovery destinations", () => {
    for (const path of [
      "/?interest=gaming&transcript=available",
      "/saved",
      "/interests",
      "/videos/abcdefghijk?returnTo=%2F%3Finterest%3Dgaming",
    ])
      expect(safeNext(path)).toBe(path);
    expect(safeNext("/explore?interest=gaming")).toBe("/?interest=gaming");
    for (const value of [
      "//evil.com",
      "https://evil.com",
      "/\\evil.com",
      "/api/cron",
      "/videos/no",
      "/%2f%2fevil.com",
    ])
      expect(safeNext(value)).toBe("/");
  });
  it("fails cron authorization closed", () => {
    expect(authorizedCron(null, "secret")).toBe(false);
    expect(authorizedCron("Bearer undefined", undefined)).toBe(false);
    expect(authorizedCron("Bearer wrong", "secret")).toBe(false);
    expect(authorizedCron("Bearer secret", "secret")).toBe(true);
  });
});
