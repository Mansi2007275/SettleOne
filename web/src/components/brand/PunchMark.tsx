import styles from "./PunchMark.module.css";

/** The SettleOnce mark: a ticket with one punched hole. Colours come from the theme tokens. */
export function PunchMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        d="M4 7h24v6.2a2.8 2.8 0 0 0 0 5.6V25H4v-6.2a2.8 2.8 0 0 0 0-5.6Z"
        className={styles.paper}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d="M20 8.5v15" className={styles.line} strokeWidth="1.6" strokeDasharray="2 2" />
      <circle cx="24.3" cy="16" r="2.6" className={styles.hole} strokeWidth="1.6" />
      <path d="M8 12.5h8M8 16h6M8 19.5h7" className={styles.line} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
