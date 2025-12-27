import styles from "../../../pages/Fitness.module.css";

export default function FitnessHeader({ darkMode, onToggleDark, statusSlot }) {
  return (
    <>
      <div className={styles.statusRow}>
        <div>{statusSlot}</div>

        <button
          type="button"
          className={styles.darkToggle}
          onClick={onToggleDark}
          aria-label="Toggle dark mode"
        >
          {darkMode ? "🔆 Light" : "🕶️ Dark"}
        </button>
      </div>

      <header className={styles.hero}>
        <h1>Fitness Dashboard</h1>
        <p className={styles.sub}>Fitbit stats + lift tracking (Google Sheets).</p>
      </header>
    </>
  );
}
