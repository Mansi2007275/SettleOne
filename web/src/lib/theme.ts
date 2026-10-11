/**
 * Which theme the desk is wearing.
 *
 * Light is the default. A visitor who has never chosen gets whatever their system asks for;
 * once they press the toggle, that choice is remembered in this browser and wins from then on.
 * Nothing here touches the chain or an invoice: it is a display preference only.
 */

export type Theme = "light" | "dark";

export const THEMES = ["light", "dark"] as const satisfies readonly Theme[];

/** Same `settleonce.*.v1` shape as the desk and crash-test keys. */
export const THEME_KEY = "settleonce.theme.v1";

/** The attribute globals.css keys the dark palette off. */
export const THEME_ATTR = "data-theme";

export const DEFAULT_THEME: Theme = "light";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/**
 * The theme to show, from what storage holds and what the system asks for.
 * Pure on purpose: this is the one rule the inline script below also has to obey.
 */
export function resolveTheme(stored: string | null, systemPrefersDark: boolean): Theme {
  if (isTheme(stored)) return stored;
  return systemPrefersDark ? "dark" : "light";
}

export function otherTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

/** The toggle's accessible name says where the press goes, not where you are. */
export function themeToggleLabel(theme: Theme): string {
  return `Switch to ${otherTheme(theme)} theme`;
}

export function readStoredTheme(): Theme | null {
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    return isTheme(raw) ? raw : null;
  } catch {
    /* storage can be unavailable (private mode); fall back to the system preference */
    return null;
  }
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* the theme still applies to this page, it just won't be remembered */
  }
}

export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** What the document is wearing right now, as set by the inline script or the last toggle. */
export function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute(THEME_ATTR);
  return isTheme(attr) ? attr : DEFAULT_THEME;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute(THEME_ATTR, theme);
}

/**
 * Runs in <head>, synchronously, before the first paint, so someone on the dark theme never
 * sees a flash of the light one. It is spelled out rather than imported because it has to be
 * inline, and it mirrors resolveTheme() exactly: theme.test.ts runs this string to prove it.
 */
export const THEME_INIT_SCRIPT = `(function(){var t=null;try{t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)})}catch(e){}if(t!==${JSON.stringify("light")}&&t!==${JSON.stringify(
  "dark",
)}){try{t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){t=${JSON.stringify(
  DEFAULT_THEME,
)}}}document.documentElement.setAttribute(${JSON.stringify(THEME_ATTR)},t)})()`;
