import { useMemo, useState, useEffect } from "react";
import styles from "./MonthlyWorkoutCalendarTile.module.css";

function toISODateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISO(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d, delta) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function sameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export default function MonthlyWorkoutCalendarTile({
  workouts = [],
  getDate = (w) => w?.dateISO,
  selectedISO,
  todayISO,
  onSelectISO,
}) {
  const today = useMemo(() => (todayISO ? parseISO(todayISO) : new Date()), [todayISO]);

  const [monthAnchor, setMonthAnchor] = useState(() =>
    selectedISO ? startOfMonth(parseISO(selectedISO)) : startOfMonth(today)
  );

  useEffect(() => {
    if (!selectedISO) return;
    const next = startOfMonth(parseISO(selectedISO));
    if (!sameMonth(next, monthAnchor)) setMonthAnchor(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedISO]);

  const workoutSet = useMemo(() => {
    const s = new Set();
    for (const w of workouts || []) {
      const iso = String(getDate(w) || "").trim();
      if (iso) s.add(iso);
    }
    return s;
  }, [workouts, getDate]);

  const monthLabel = useMemo(() => {
    return monthAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [monthAnchor]);

  const workoutCountThisMonth = useMemo(() => {
    const ym = `${monthAnchor.getFullYear()}-${String(monthAnchor.getMonth() + 1).padStart(2, "0")}`;
    let c = 0;
    for (const iso of workoutSet) if (String(iso).startsWith(ym)) c++;
    return c;
  }, [monthAnchor, workoutSet]);

  const days = useMemo(() => {
    const first = startOfMonth(monthAnchor);
    const start = new Date(first);
    start.setDate(1 - first.getDay()); // sunday-start

    const out = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = toISODateLocal(d);

      out.push({
        iso,
        dayNum: d.getDate(),
        inMonth: d.getMonth() === monthAnchor.getMonth(),
        hasWorkout: workoutSet.has(iso),
        isSelected: selectedISO === iso,
        isToday: todayISO === iso,
        dateObj: d,
      });
    }
    return out;
  }, [monthAnchor, workoutSet, selectedISO, todayISO]);

  return (
    <div className={styles.tile}>
      <div className={styles.headerRow}>
        <div>
          <div className={styles.title}>MONTHLY</div>
          <div className={styles.subTitle}>{monthLabel}</div>
          <div className={styles.monthControls}>
            <button
              type="button"
              className={styles.monthBtn}
              onClick={() => setMonthAnchor((d) => addMonths(d, -1))}
              aria-label="Previous month"
            >
              ←
            </button>
            <button
              type="button"
              className={styles.monthBtn}
              onClick={() => setMonthAnchor((d) => addMonths(d, 1))}
              aria-label="Next month"
            >
              →
            </button>
          </div>
        </div>

        <div className={styles.miniStat} aria-label="Workouts this month">
          <div className={styles.miniStatNum}>{workoutCountThisMonth}</div>
          <div className={styles.miniStatLabel}>workouts</div>
        </div>
      </div>

      <div className={styles.weekdays} aria-hidden="true">
        {["S", "M", "T", "W", "T", "F", "S"].map((x) => (
          <div key={x} className={styles.weekday}>
            {x}
          </div>
        ))}
      </div>

      <div className={styles.grid} role="grid" aria-label="Workout calendar">
        {days.map((d) => {
          if (!d.inMonth) {
            // keep layout tight but de-emphasize out-of-month days
          }

          const cls = [
            styles.cell,
            d.inMonth ? "" : styles.cellDim,
            d.hasWorkout ? styles.cellWorkout : "",
            d.isToday ? styles.cellToday : "",
            d.isSelected ? styles.cellSelected : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={d.iso}
              type="button"
              className={cls}
              onClick={() => onSelectISO?.(d.iso)}
              aria-pressed={d.isSelected}
              aria-label={`${d.dateObj.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}${d.hasWorkout ? ", workout day" : ""}`}
            >
              <span className={styles.dayNum}>{d.dayNum}</span>
              {d.hasWorkout ? <span className={styles.check} aria-hidden="true">✓</span> : null}
            </button>
          );
        })}
      </div>

      <div className={styles.legend}>
        <span className={styles.legendDot} aria-hidden="true" />
        workout day
        <button
          type="button"
          className={styles.legendToday}
          onClick={() => onSelectISO?.(todayISO)}
        >
          Today
        </button>
      </div>
    </div>
  );
}
