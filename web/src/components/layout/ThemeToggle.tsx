"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  currentTheme,
  DEFAULT_THEME,
  otherTheme,
  storeTheme,
  themeToggleLabel,
  type Theme,
} from "@/lib/theme";
import styles from "./ThemeToggle.module.css";

/**
 * Switches the desk between the light and dark palettes and remembers the choice in this browser.
 *
 * The icon is chosen by CSS from [data-theme], which the inline script in layout.tsx sets before
 * the first paint, so nothing here repaints on load. Only the accessible name needs React, and it
 * catches up on the first client render.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => setTheme(currentTheme()), []);

  function flip() {
    const next = otherTheme(currentTheme());
    applyTheme(next);
    storeTheme(next);
    setTheme(next);
  }

  const label = themeToggleLabel(theme);

  return (
    <button type="button" className={`btn ${styles.toggle}`} onClick={flip} aria-label={label} title={label}>
      <svg
        className={styles.moon}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M20.5 14.2A8.6 8.6 0 1 1 11.3 3.5a6.7 6.7 0 0 0 9.2 10.7Z" />
      </svg>
      <svg
        className={styles.sun}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
      </svg>
    </button>
  );
}
