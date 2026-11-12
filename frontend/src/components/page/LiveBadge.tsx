/** Small "Live" indicator for pages that update themselves when new payments arrive. */
function LiveBadge({ live }: { live: boolean }) {
  return (
    <span
      className={`live-badge${live ? " on" : ""}`}
      role="status"
      title={live ? "New payments appear automatically" : "Reconnecting… checking for new payments every 30 seconds"}
    >
      <span className="live-dot" aria-hidden="true" />
      {live ? "Live" : "Reconnecting"}
    </span>
  );
}

export default LiveBadge;
