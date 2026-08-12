import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { assertNodeEngine } from "../../../scripts/assert-node-engine.mjs";

describe("Node engine gate", () => {
  it("accepts the frozen runtime range and rejects older or malformed versions", () => {
    expect(() => assertNodeEngine("v22.19.0")).not.toThrow();
    expect(() => assertNodeEngine("v22.23.2")).not.toThrow();
    expect(() => assertNodeEngine("v24.14.0")).not.toThrow();
    expect(() => assertNodeEngine("v22.18.9")).toThrow(">=22.19.0");
    expect(() => assertNodeEngine("v21.99.0")).toThrow(">=22.19.0");
    expect(() => assertNodeEngine("22.23.2")).toThrow("无法解析");
  });

  it("pins the selected runtime and guards every callable application lifecycle", async () => {
    const [version, root, server, web] = await Promise.all([
      readFile(".node-version", "utf8"),
      readFile("package.json", "utf8").then(JSON.parse),
      readFile("apps/anyteacher/package.json", "utf8").then(JSON.parse),
      readFile("apps/anyteacher/web/package.json", "utf8").then(JSON.parse),
    ]);
    expect(version).toBe("22.23.2\n");
    for (const hook of ["predev", "pretest", "pretypecheck", "prebuild", "prebuild:server", "prebuild:web"]) {
      expect(root.scripts[hook]).toBe("npm run runtime:check");
    }
    expect(server.scripts).toMatchObject({
      predev: "npm --prefix ../.. run runtime:check",
      preserver: "npm --prefix ../.. run runtime:check",
    });
    expect(web.scripts).toMatchObject({
      predev: "npm --prefix ../../.. run runtime:check",
      prebuild: "npm --prefix ../../.. run runtime:check",
      prepreview: "npm --prefix ../../.. run runtime:check",
    });
  });
});
