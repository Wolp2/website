import LiftRow from "../LiftRow";
import { fmtDatePretty } from "../../../lib/fitness/utils";

export default function DailyWorkoutSummaryCard({ styles, iso, loading, error, lifts, topLift }) {
  return (
    <section className={styles.panel} style={{ marginTop: 14 }}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Workout — {fmtDatePretty(iso)}</h2>
        <div className={styles.sectionMeta}>
          {loading ? "Loading log…" : error ? "Sheets error" : `${lifts.length} lifts`}
        </div>
      </div>

      {error ? <div className={`${styles.info} ${styles.error}`}>{error}</div> : null}

      {!error && !loading && lifts.length === 0 ? (
        <div className={styles.info}>No lifts logged for this date.</div>
      ) : null}

      {/* Summary line (resume-worthy polish) */}
      {!error && lifts.length > 0 ? (
        <div className={styles.info} style={{ marginBottom: 10 }}>
          {topLift?.exercise ? (
            <>
              Top lift: <strong>{topLift.exercise}</strong>
              {topLift.weight ? ` — ${topLift.weight} lb` : ""}
            </>
          ) : (
            "Logged lifts shown below."
          )}
        </div>
      ) : null}

      {/* Keep your existing LiftRow UI (fast + safe) */}
      {!error && lifts.length > 0 ? (
        <div className={styles.liftGrid}>
          {lifts.map((it, i) => (
            <LiftRow key={`${it.iso}-${i}`} item={it} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
