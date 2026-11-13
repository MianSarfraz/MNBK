import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const app = path.resolve(__dirname, "../app");
const ROUTES = [
  "", "auth", "(app)/dashboard", "(app)/weekly", "(app)/patheer", "(app)/patheer/[id]", "(app)/rehra", "(app)/nakasi",
  "(app)/sales", "(app)/sales/new", "(app)/sales/[id]", "(app)/stock", "(app)/expenses", "(app)/owners", "(app)/reports",
  "(app)/history", "(app)/seasons", "(app)/qualities", "(app)/people/[kind]", "(app)/party/[id]",
];

describe("App routes", () => {
  it.each(ROUTES)("has a page for /%s", (r) => {
    expect(fs.existsSync(path.join(app, r, "page.tsx"))).toBe(true);
  });
  it("signed-in pages share the owner shell", () => {
    expect(fs.readFileSync(path.join(app, "(app)/layout.tsx"), "utf8")).toContain("AppShell");
  });
});
