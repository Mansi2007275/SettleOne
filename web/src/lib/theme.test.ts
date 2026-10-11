import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  isTheme,
  otherTheme,
  resolveTheme,
  THEME_ATTR,
  THEME_INIT_SCRIPT,
  THEME_KEY,
  themeToggleLabel,
  type Theme,
} from "./theme";

describe("isTheme", () => {
  it("accepts exactly the two themes", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
  });

  it("rejects anything else, including near misses from storage", () => {
    for (const value of ["Dark", "DARK", "light ", "", "auto", null, undefined, 0, {}]) {
      expect(isTheme(value)).toBe(false);
    }
  });
});

describe("resolveTheme", () => {
  it("honours a stored choice over the system preference", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("follows the system on a first visit", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  it("ignores a corrupted stored value and asks the system instead", () => {
    expect(resolveTheme("", true)).toBe("dark");
    expect(resolveTheme("Dark", false)).toBe("light");
    expect(resolveTheme("{}", false)).toBe("light");
  });

  it("defaults to light when nothing is known", () => {
    expect(resolveTheme(null, false)).toBe(DEFAULT_THEME);
  });
});

describe("otherTheme", () => {
  it("flips, and flipping twice is a round trip", () => {
    expect(otherTheme("light")).toBe("dark");
    expect(otherTheme("dark")).toBe("light");
    for (const theme of ["light", "dark"] as Theme[]) {
      expect(otherTheme(otherTheme(theme))).toBe(theme);
    }
  });
});

describe("themeToggleLabel", () => {
  it("names the theme the press switches to", () => {
    expect(themeToggleLabel("light")).toBe("Switch to dark theme");
    expect(themeToggleLabel("dark")).toBe("Switch to light theme");
  });
});

/**
 * The pre-paint script is a string, so run it for real. Its three free identifiers
 * (localStorage, matchMedia, document) become parameters here, which shadows the globals and
 * lets each case stub them, including the ones that throw.
 */
function runInitScript(options: { stored?: string | null; storageThrows?: boolean; prefersDark?: boolean }): {
  attribute: string | undefined;
  queries: string[];
} {
  const written: Record<string, string> = {};
  const queries: string[] = [];

  const localStorage = {
    getItem(key: string): string | null {
      if (options.storageThrows) throw new Error("storage denied");
      expect(key).toBe(THEME_KEY);
      return options.stored ?? null;
    },
  };

  const matchMedia = (query: string) => {
    queries.push(query);
    if (options.prefersDark === undefined) throw new Error("matchMedia unavailable");
    return { matches: query.includes("dark") ? options.prefersDark : false };
  };

  const document = {
    documentElement: {
      setAttribute(name: string, value: string) {
        written[name] = value;
      },
    },
  };

  new Function("localStorage", "matchMedia", "document", THEME_INIT_SCRIPT)(localStorage, matchMedia, document);

  return { attribute: written[THEME_ATTR], queries };
}

describe("THEME_INIT_SCRIPT", () => {
  it("is safe to inline in a <script> tag", () => {
    expect(THEME_INIT_SCRIPT).not.toContain("</script");
    expect(THEME_INIT_SCRIPT).toContain(THEME_KEY);
    expect(THEME_INIT_SCRIPT).toContain(THEME_ATTR);
  });

  it("agrees with resolveTheme on every input", () => {
    const cases: { stored: string | null; prefersDark: boolean }[] = [
      { stored: "dark", prefersDark: false },
      { stored: "light", prefersDark: true },
      { stored: null, prefersDark: true },
      { stored: null, prefersDark: false },
      { stored: "", prefersDark: true },
      { stored: "Dark", prefersDark: false },
      { stored: "auto", prefersDark: true },
    ];

    for (const { stored, prefersDark } of cases) {
      expect(runInitScript({ stored, prefersDark }).attribute).toBe(resolveTheme(stored, prefersDark));
    }
  });

  it("asks the system only when there is no stored choice", () => {
    expect(runInitScript({ stored: "dark", prefersDark: true }).queries).toEqual([]);
    expect(runInitScript({ stored: null, prefersDark: true }).queries).toEqual(["(prefers-color-scheme: dark)"]);
  });

  it("still sets a theme when localStorage throws", () => {
    expect(runInitScript({ storageThrows: true, prefersDark: true }).attribute).toBe("dark");
    expect(runInitScript({ storageThrows: true, prefersDark: false }).attribute).toBe("light");
  });

  it("falls back to light when matchMedia is unavailable too", () => {
    expect(runInitScript({ stored: null }).attribute).toBe(DEFAULT_THEME);
    expect(runInitScript({ storageThrows: true }).attribute).toBe(DEFAULT_THEME);
  });

  it("always writes an attribute, so [data-theme] is never missing", () => {
    expect(runInitScript({ stored: "light", prefersDark: false }).attribute).toBeDefined();
    expect(runInitScript({ storageThrows: true }).attribute).toBeDefined();
  });
});
