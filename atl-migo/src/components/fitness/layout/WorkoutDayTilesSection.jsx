import { useState } from "react";
import styles from "./WorkoutDayTilesSection.module.css";

function fmtInt(n) {
  return n == null || Number.isNaN(n) ? "—" : Math.round(n).toLocaleString();
}

function titleCase(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  return t[0].toUpperCase() + t.slice(1);
}

function Dots({ value = 0, max = 7 }) {
  const n = Math.max(0, Math.min(max, Number(value) || 0));
  return (
    <div className={styles.dots} aria-label={`${n} of ${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={`${styles.dot} ${i < n ? styles.dotOn : ""}`} />
      ))}
    </div>
  );
}

function SplitBadge({ split }) {
  const t = titleCase(split);
  if (!t) return null;
  return <span className={`${styles.badge} ${styles.splitPill}`}>{t}</span>;
}

function WorkoutDayTile({ w, onViewDay }) {
  const label = w.prettyDate || w.dateISO || "Workout day";

  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <div className={styles.date}>{label}</div>
        <SplitBadge split={w.split} />
      </div>

      <div className={styles.meta}>
        {fmtInt(w.exercisesCount)} exercises • {fmtInt(w.totalSets)} total sets
      </div>

      <div className={styles.spacer} />
      <Dots value={w.dots || 0} />

      <div className={styles.actions}>
        <button
          className={styles.btn}
          type="button"
          onClick={() => onViewDay?.(w.dateISO)}
          aria-label={`View workout for ${label}`}
        >
          View day →
        </button>
      </div>
    </div>
  );
}

export default function WorkoutDayTilesSection({
  workoutsByDay = [],
  onViewDay,
  initialLimit = 12,
}) {
  const step = initialLimit; // use the same increment as your initial page size
  const [limit, setLimit] = useState(initialLimit);

  const shown = workoutsByDay.slice(0, limit);
  const canLoadMore = limit < workoutsByDay.length;

  return (
    <section id="workout-tiles" className={styles.wrap} aria-label="Workouts">
      <div className={styles.head}>
        <h2 className={styles.title}>Workouts</h2>
        <div className={styles.count}>
          Showing {Math.min(limit, workoutsByDay.length)} of {workoutsByDay.length}
        </div>
      </div>

      <div className={styles.grid}>
        {shown.map((w, idx) => (
          <WorkoutDayTile key={w?.dateISO || idx} w={w} onViewDay={onViewDay} />
        ))}
      </div>

      <div className={styles.footer}>
        {canLoadMore ? (
          <button
            className={styles.loadMore}
            type="button"
            onClick={() => setLimit((n) => n + step)}
          >
            Load more
          </button>
        ) : null}
      </div>
    </section>
  );
}
