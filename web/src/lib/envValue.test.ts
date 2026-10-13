import { describe, expect, it } from "vitest";
import { cleanEnv } from "./envValue";

describe("cleanEnv", () => {
  it("leaves a clean value alone", () => {
    expect(cleanEnv("mainnet")).toBe("mainnet");
    expect(cleanEnv("0x0D582d835E515CC0EC02C9b562F9120BF308CA2c")).toBe(
      "0x0D582d835E515CC0EC02C9b562F9120BF308CA2c",
    );
  });

  it("trims leading and trailing spaces, the bug the live site hit", () => {
    expect(cleanEnv(" 0x0D582d835E515CC0EC02C9b562F9120BF308CA2c")).toBe(
      "0x0D582d835E515CC0EC02C9b562F9120BF308CA2c",
    );
    expect(cleanEnv("mainnet  ")).toBe("mainnet");
    expect(cleanEnv("\t 5042 ")).toBe("5042");
  });

  it("strips a newline a pasted dashboard value drags along", () => {
    expect(cleanEnv("https://rpc.example.com\n")).toBe("https://rpc.example.com");
    expect(cleanEnv("\r\nmainnet\r\n")).toBe("mainnet");
  });

  it("strips one matching pair of surrounding quotes", () => {
    expect(cleanEnv('"mainnet"')).toBe("mainnet");
    expect(cleanEnv("'mainnet'")).toBe("mainnet");
    expect(cleanEnv('  " 0xabc "  ')).toBe("0xabc");
  });

  it("keeps quotes that are not a surrounding pair", () => {
    expect(cleanEnv('"mainnet')).toBe('"mainnet');
    expect(cleanEnv("mainnet'")).toBe("mainnet'");
    expect(cleanEnv("'mainnet\"")).toBe("'mainnet\"");
    expect(cleanEnv('"')).toBe('"');
  });

  it("does not strip quotes that belong to the value", () => {
    expect(cleanEnv('say "hi"')).toBe('say "hi"');
  });

  it("treats an empty or whitespace-only value as not set", () => {
    expect(cleanEnv("")).toBeUndefined();
    expect(cleanEnv("   ")).toBeUndefined();
    expect(cleanEnv("\n\t ")).toBeUndefined();
  });

  it("treats empty quotes as not set", () => {
    expect(cleanEnv('""')).toBeUndefined();
    expect(cleanEnv("''")).toBeUndefined();
    expect(cleanEnv('" "')).toBeUndefined();
  });

  it("passes undefined straight through", () => {
    expect(cleanEnv(undefined)).toBeUndefined();
  });
});
