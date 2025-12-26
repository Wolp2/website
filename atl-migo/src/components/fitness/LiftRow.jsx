import styles from "../../pages/Fitness.module.css";

export default function LiftRow({ item, compact = false }) {
  return (
    <div className={`${styles.liftCard} ${compact ? styles.liftCardCompact : ""}`}>
      <div className={styles.liftHead}>
        <div className={styles.liftName}>{item.exercise || "—"}</div>
        {item.weight ? <div className={styles.pill}>{item.weight}</div> : null}
      </div>

      <div className={styles.liftMeta}>
        <span>Sets: {item.sets || "-"}</span>
        <span className={styles.dot}>•</span>
        <span>Reps: {item.reps || "-"}</span>
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
