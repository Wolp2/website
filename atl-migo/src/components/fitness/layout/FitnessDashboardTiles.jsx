import styles from "./FitnessDashboardTiles.module.css";
import { Dumbbell, TrendingUp } from "lucide-react";
import MonthlyWorkoutCalendarTile from "../../MonthlyWorkoutCalendarTile";

import CoachBrainTile from "../CoachBrainTile";

const fmtInt = (n) =>
  n == null || Number.isNaN(n) ? "—" : Math.round(n).toLocaleString();

function niceWeight(w) {
  const n = Number(w);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "BW";
  return `${Math.round(n)} lb`;
}

function repsText(it) {
  const r = it?.reps;
  if (r == null) return "—";
  const s = String(r).trim();
  return s || "—";
}

function setsText(it) {
  const s = Number(it?.sets);
  if (Number.isFinite(s) && s > 0) return `${s}`;
  return "—";
}

function exerciseName(it) {
  return String(it?.exercise || it?.name || "").trim() || "Exercise";
}

function splitBadgeText(split) {
  const s = String(split || "").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

/** Prefer selected day workout if it exists, otherwise most recent before selected */
function pickWorkoutForSelected(workoutsByDay, selectedISO) {
  if (!Array.isArray(workoutsByDay) || workoutsByDay.length === 0) return null;
  if (!selectedISO) return null;

  const exact = workoutsByDay.find((w) => w?.dateISO === selectedISO);
  if (exact && Array.isArray(exact.lifts) && exact.lifts.length) return exact;

  // fallback: most recent workout before selected day
  const prev = workoutsByDay.find(
    (w) =>
      w?.dateISO &&
      w.dateISO < selectedISO &&
      Array.isArray(w.lifts) &&
      w.lifts.length
  );
  return prev || null;
}

/** ---------- UI ---------- */
function Tile({ title, icon, active = false, className = "", children }) {
  const cls = `${styles.tile} ${active ? styles.activeTile : ""} ${className}`.trim();

  return (
    <div className={cls}>
      <div className={styles.tileHead}>
        <div className={styles.tileTitle}>{title}</div>
        <span className={styles.iconChip} aria-hidden="true">
          {icon}
        </span>
      </div>
      {children}
    </div>
  );
}

function SplitBadge({ split }) {
  const t = splitBadgeText(split);
  if (!t) return null;
  return <span className={styles.splitPill}>{t}</span>;
}

function ExerciseAccordion({ it, defaultOpen = false }) {
  const name = exerciseName(it);
  const weight = niceWeight(it?.weight);
  const sets = setsText(it);
  const reps = repsText(it);
  const notes = String(it?.notes || it?.note || "").trim();

  return (
    <details className={styles.acc} open={defaultOpen}>
      <summary className={styles.accSummary}>
        <div className={styles.accTitle}>{name}</div>
        <div className={styles.accRight}>
          <span className={styles.workPill}>{weight}</span>
          <span className={styles.chev}>▾</span>
        </div>
      </summary>

      <div className={styles.accBody}>
        <div className={styles.accMeta}>
          <div>
            <span className={styles.k}>Sets</span> <b>{sets}</b>
          </div>
          <div>
            <span className={styles.k}>Reps</span> <b>{reps}</b>
          </div>
        </div>

        {notes ? <div className={styles.accNotes}>{notes}</div> : null}
      </div>
    </details>
  );
}

export default function FitnessDashboardTiles({
  todayISO,
  selectedISO,
  workoutsByDay = [],

  // kept for compatibility (not used anymore here)
  fitbitCaloriesByDay = [],
  fitbitDay,

  currentMetric,
  currentRangeDays,
  onSelectMetric,
  onSelectRangeDays,

  // calendar -> page selection
  onSelectDate,

  // Coach Props
  coachDateLabel,
  coachToday,
  coachModel,
}) {
  // ✅ Show the selected day's workout (or fallback to most recent before it)
  const workoutForTile = pickWorkoutForSelected(workoutsByDay, selectedISO || todayISO);

  const handlePickMetric = (m) => {
    if (typeof onSelectMetric === "function") onSelectMetric(m);

    // If you're in daily mode, jumping to a trend makes more sense as 7-day
    if (currentRangeDays === "daily" && typeof onSelectRangeDays === "function") {
      onSelectRangeDays("7");
    }
  };

  const workoutTitle = selectedISO
    ? `Workout — ${workoutForTile?.prettyDate || selectedISO}`
    : workoutForTile?.dateISO
    ? `Workout — ${workoutForTile.prettyDate || workoutForTile.dateISO}`
    : "Workout";

  const IconWorkout = <Dumbbell size={20} strokeWidth={2.5} />;
  const IconVolume = <TrendingUp size={20} strokeWidth={2.5} />;

  return (
    <div className={styles.grid}>
      {/* 1) Workout (driven by selectedISO) */}
      <Tile title={workoutTitle} icon={IconWorkout}>
        {workoutForTile ? (
          <>
            <div className={styles.workHeaderRow}>
              <SplitBadge split={workoutForTile.split} />
              <div className={styles.workHeaderMeta}>
                {fmtInt(workoutForTile.exercisesCount)} exercises •{" "}
                {fmtInt(workoutForTile.totalSets)} sets
              </div>
            </div>

            <div className={styles.workList}>
              {(workoutForTile.lifts || []).slice(0, 5).map((it, idx) => (
                <ExerciseAccordion
                  key={`${exerciseName(it)}-${idx}`}
                  it={it}
                  defaultOpen={idx === 0}
                />
              ))}
            </div>
          </>
        ) : (
          <div className={styles.emptyBox}>
            <div className={styles.emptyTitle}>No workout logged</div>
            <div className={styles.muted}>
              Click a date in the calendar to load that day’s workout.
            </div>
          </div>
        )}
      </Tile>

      {/* 2) Monthly (clickable dates -> onSelectDate) */}
      <Tile title="Monthly" icon={IconVolume}>
        <MonthlyWorkoutCalendarTile
          workouts={workoutsByDay}
          getDate={(w) => w.dateISO}
          selectedISO={selectedISO}
          todayISO={todayISO}
          onSelectISO={(iso) => {
            if (typeof onSelectDate === "function") onSelectDate(iso);
          }}
        />
      </Tile>

      {/* 3) Coach Brain (2x tile) */}
      <Tile
        title="Coach"
        icon={<span style={{ fontSize: 18, fontWeight: 900 }}>🧠</span>}
        className={styles.tileSpan2}
      >
        <CoachBrainTile
          dateLabel={coachDateLabel}
          model={coachModel}
          today={coachToday}
          onPickMetric={handlePickMetric}
          activeMetric={currentMetric}
          activeRangeDays={currentRangeDays}
        />
      </Tile>
    </div>
  );
}
