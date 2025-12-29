export default function FitnessHeader({
  styles,
  darkMode,
  onToggleDark,
  connected = false,
  lastSyncTime = null,
}) {
  const lastSyncLabel = lastSyncTime
    ? new Date(lastSyncTime).toLocaleString()
    : "—";

  return (
    <header className={styles.fitnessHeader}>
      <div className={styles.headerLeft}>
        <h1 className={styles.pageTitle}>Fitness Dashboard</h1>

        <div className={styles.headerMeta}>
          <span className={connected ? styles.statusOk : styles.statusErr}>
            {connected ? "Fitbit connected" : "Fitbit disconnected"}
          </span>
          <span className={styles.dot}>•</span>
          <span>Last synced {lastSyncLabel}</span>
        </div>
      </div>

      <button
        type="button"
        className={styles.darkToggle}
        onClick={onToggleDark}
        aria-label="Toggle dark mode"
        title="Toggle dark mode"
      >
        {darkMode ? "☀️" : "🌙"}
      </button>
    </header>
  );
}
