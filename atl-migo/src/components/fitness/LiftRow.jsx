import styles from "../../pages/Fitness.module.css";

function fmtWeight(w) {
  const s = String(w ?? "").trim();
  if (!s) return "";
  // If it's basically a number, add lb
  const n = parseFloat(s.replace(/[^\d.]+/g, ""));
  if (Number.isFinite(n) && s.replace(/[^\d.]+/g, "") === String(n)) return `${n} lb`;
  return s;
}

export default function LiftRow({ item, compact = false }) {
  const weightText = fmtWeight(item.weight);
  const hasCardio = item.miles || item.minutes;

  return (
    <div className={`${styles.liftCard} ${compact ? styles.liftCardCompact : ""}`}>
      <div className={styles.liftHead}>
        <div className={styles.liftName}>{item.exercise || "—"}</div>
        {weightText ? <div className={styles.pill}>{weightText}</div> : null}
      </div>

      <div className={styles.liftMeta}>
        {hasCardio ? (
          <>
            <span>Miles: {item.miles || "-"}</span>
            <span className={styles.dot}>•</span>
            <span>Minutes: {item.minutes || "-"}</span>
          </>
        ) : (
          <>
            <span>Sets: {item.sets || "-"}</span>
            <span className={styles.dot}>•</span>
            <span>Reps: {item.reps || "-"}</span>
          </>
        )}

        {item.category ? (
          <>
            <span className={styles.dot}>•</span>
            <span className={styles.muted}>{item.category}</span>
          </>
        ) : null}
      </div>

      {item.notes ? <div className={styles.liftNotes}>{item.notes}</div> : null}
    </div>
  );
}
