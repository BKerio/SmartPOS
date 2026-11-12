/**
 * Flat "paper-cut" illustration for the login hero: a POS terminal prints a receipt while
 * coins pop out of it on a 6s loop. Animation lives in styles/smartpos.css (.lps-*).
 */
function LoginScene() {
  return (
    <div className="lps-stage" aria-hidden="true">
      <svg viewBox="0 0 360 320" className="lps-svg">
        <defs>
          {/* Receipt only shows above the printer slot */}
          <clipPath id="lps-slot">
            <rect x="0" y="0" width="360" height="152" />
          </clipPath>
        </defs>

        {/* dashed orbit rings */}
        <circle cx="180" cy="190" r="128" className="lps-ring" />
        <circle cx="180" cy="190" r="96" className="lps-ring" />

        {/* receipt */}
        <g clipPath="url(#lps-slot)">
          <g className="lps-receipt">
            <path d="M142 152 V70 l6 -6 6 6 6 -6 6 6 6 -6 6 6 6 -6 6 6 6 -6 6 6 6 -6 6 6 V152 Z" className="lps-paper" />
            <rect x="152" y="84" width="40" height="5" rx="2.5" className="lps-ink" />
            <rect x="152" y="98" width="56" height="5" rx="2.5" className="lps-ink lps-ink-soft" />
            <rect x="152" y="110" width="48" height="5" rx="2.5" className="lps-ink lps-ink-soft" />
            <rect x="152" y="126" width="56" height="7" rx="3.5" className="lps-ink" />
          </g>
        </g>

        {/* terminal: flat offset shadow, body, screen, keypad */}
        <rect x="104" y="160" width="168" height="126" rx="18" fill="#08458A" />
        <rect x="94" y="150" width="168" height="126" rx="18" className="lps-body" />
        <rect x="132" y="146" width="92" height="10" rx="5" fill="#0A1B2E" />
        <rect x="112" y="170" width="132" height="44" rx="9" fill="#0A1B2E" />
        <text x="124" y="198" className="lps-screen-label">KES</text>
        <text x="232" y="199" textAnchor="end" className="lps-screen-amount">250.00</text>
        {[0, 1, 2].map((r) =>
          [0, 1, 2, 3].map((c) => (
            <rect
              key={`${r}-${c}`}
              x={116 + c * 33}
              y={226 + r * 15}
              width="26"
              height="10"
              rx="5"
              className={r === 2 && c === 3 ? "lps-key lps-key-go" : "lps-key"}
            />
          )),
        )}

        {/* "tap" ripple on the green key */}
        <circle cx="228" cy="261" r="9" className="lps-tap" />
      </svg>

      {/* coins that fly out when the sale completes */}
      <span className="lps-coin lps-coin-1">KES</span>
      <span className="lps-coin lps-coin-2">KES</span>
      <span className="lps-coin lps-coin-3">KES</span>
    </div>
  );
}

export default LoginScene;
