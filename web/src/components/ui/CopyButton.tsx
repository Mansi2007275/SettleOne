"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./CopyButton.module.css";

type Props = {
  /** Text to copy. Pass a function for a value that only exists in the browser, e.g. an absolute URL. */
  value: string | (() => string);
  /** What the button copies, e.g. "Copy payer address". Visible text on the labelled variant. */
  label: string;
  /** "button" is a labelled ticket button; "inline" is a small square punch beside mono text. */
  variant?: "button" | "inline";
  className?: string;
};

/** How long "Copied" stays up before the button goes quiet again. */
const HOLD_MS = 1500;

type State = "idle" | "copied" | "failed";

const FLAG: Record<State, string> = {
  idle: "",
  copied: "Copied",
  failed: "Couldn't copy",
};

export function CopyButton({ value, label, variant = "button", className }: Props) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    const text = typeof value === "function" ? value() : value;
    const ok = await writeClipboard(text);
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), HOLD_MS);
  }, [value]);

  const flag = FLAG[state];

  return (
    <span className={className ? `${styles.wrap} ${className}` : styles.wrap}>
      <button
        type="button"
        className={variant === "inline" ? styles.punch : "btn btn-small"}
        onClick={() => void copy()}
        aria-label={variant === "inline" ? label : undefined}
        title={label}
      >
        {variant === "inline" ? <Icon done={state === "copied"} /> : label}
      </button>
      {flag ? (
        <span className={styles.flag} data-state={state} aria-hidden="true">
          {flag}
        </span>
      ) : null}
      {/* The announcement lives here, so the button keeps one stable accessible name. */}
      <span className="visually-hidden" aria-live="polite">
        {flag ? `${label}: ${flag}` : ""}
      </span>
    </span>
  );
}

function Icon({ done }: { done: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {done ? (
        <path d="M4.5 12.5 9.8 17.8 19.5 6.6" />
      ) : (
        <>
          <rect x="9" y="9" width="11" height="11" rx="1.5" />
          <path d="M15 5.5H5.5A1.5 1.5 0 0 0 4 7v9.5" />
        </>
      )}
    </svg>
  );
}

/**
 * Copies with the Clipboard API, falling back to a selected textarea.
 *
 * navigator.clipboard is missing on an insecure origin and can reject when the document isn't
 * focused or permission is refused, so the fallback is a real path, not dead code. Returns false
 * when nothing reached the clipboard, so the button can say so instead of lying.
 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea.
  }
  return copyViaTextarea(text);
}

function copyViaTextarea(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  // Off-screen rather than hidden: a display:none element can't be selected.
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "-9999px";
  document.body.append(area);

  const selection = document.getSelection();
  const previous = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();

  // Put the reader's own selection back where it was.
  if (selection && previous) {
    selection.removeAllRanges();
    selection.addRange(previous);
  }
  return ok;
}
