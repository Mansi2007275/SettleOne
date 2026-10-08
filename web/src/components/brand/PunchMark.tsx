/** The SettleOnce mark: a ticket with one punched hole. */
export function PunchMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        d="M4 7h24v6.2a2.8 2.8 0 0 0 0 5.6V25H4v-6.2a2.8 2.8 0 0 0 0-5.6Z"
        fill="#f7ddb8"
        stroke="#1c0f06"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d="M20 8.5v15" stroke="#1c0f06" strokeWidth="1.6" strokeDasharray="2 2" />
      <circle cx="24.3" cy="16" r="2.6" fill="#ff6b1a" stroke="#1c0f06" strokeWidth="1.6" />
      <path d="M8 12.5h8M8 16h6M8 19.5h7" stroke="#1c0f06" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
