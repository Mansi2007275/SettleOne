import { describe, expect, it } from "vitest";
import { demoToolsVisible } from "./demoGate";

describe("demo tools on testnet", () => {
  it("are always there, with or without the query", () => {
    expect(demoToolsVisible({ network: "testnet", search: "" })).toBe(true);
    expect(demoToolsVisible({ network: "testnet", search: "?demo=1" })).toBe(true);
    expect(demoToolsVisible({ network: "testnet", search: "?demo=0" })).toBe(true);
  });
});

describe("demo tools on mainnet", () => {
  it("are hidden by default", () => {
    expect(demoToolsVisible({ network: "mainnet", search: "" })).toBe(false);
    expect(demoToolsVisible({ network: "mainnet", search: "?foo=bar" })).toBe(false);
  });

  it("come back only for the exact ?demo=1 opt-in", () => {
    expect(demoToolsVisible({ network: "mainnet", search: "?demo=1" })).toBe(true);
    expect(demoToolsVisible({ network: "mainnet", search: "?a=b&demo=1" })).toBe(true);
    expect(demoToolsVisible({ network: "mainnet", search: "demo=1" })).toBe(true);
  });

  it("is not fooled by a truthy-looking value", () => {
    expect(demoToolsVisible({ network: "mainnet", search: "?demo=true" })).toBe(false);
    expect(demoToolsVisible({ network: "mainnet", search: "?demo=" })).toBe(false);
    expect(demoToolsVisible({ network: "mainnet", search: "?demo" })).toBe(false);
    expect(demoToolsVisible({ network: "mainnet", search: "?demo=11" })).toBe(false);
  });
});
