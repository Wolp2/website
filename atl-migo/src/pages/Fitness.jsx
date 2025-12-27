import { useEffect, useMemo, useState } from "react";
import styles from "./Fitness.module.css";

import FitbitTrendCharts from "../components/fitness/FitbitTrendCharts";
import FitbitStatusBanner from "../components/fitness/FitbitStatusBanner";
import FitnessTile from "../components/fitness/FitnessTile";

import FitnessHeader from "../components/fitness/layout/FitnessHeader";
import FitnessControlBar from "../components/fitness/layout/FitnessControlBar";
import DailyWorkoutSummaryCard from "../components/fitness/layout/DailyWorkoutSummaryCard";
import WorkoutHistorySection from "../components/fitness/layout/WorkoutHistorySection";

import {
  buildExerciseIndex,
  buildLiftsByISO,
  buildTrendData,
  fmtDatePretty,
  groupExercisesBySplit,
  splitLabel,
  toISODateLocal,
} from "../lib/fitness/utils";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZlEe5gpor6F0j6tRvsPrYhdrjOENGut0jUPdqTtyNYdefmRO72v1ogD9rLcUHN1HIJbMzkSfVNmRE/pub?gid=1971811896&single=true&output=csv";

const FITBIT_API = "https://fitbit.wlopez2014.workers.dev";
const ALL_EXERCISES = "__ALL__";

const fmtMins = (m) => {
  if (m == null || !Number.isFinite(Number(m))) return "—";
  const n = Math.round(Number(m));
  const h = Math.floor(n / 60);
  const mm = n % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
};

function topLiftForDay(lifts = []) {
  if (!lifts.length) return null;
  let best = lifts[0];
  let bestW = Number(best.weight) || 0;
  for (const it of lifts) {
    const w = Number(it.weight) || 0;
    if (w > bestW) {
      best = it;
      bestW = w;
    }
  }
  return best;
}

export default function Fitness() {
  // ===== Dark mode =====
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("fitness-dark") === "true"
  );

  useEffect(() => {
    localStorage.setItem("fitness-dark", String(darkMode));
  }, [darkMode]);

  // ===== Sticky layout: measure toolbar height so exerciseBar sits perfectly under it =====
  const [toolbarH, setToolbarH] = useState(104);

  // ===== Global controls =====
  const [selectedISO, setSelectedISO] = useState(() => toISODateLocal(new Date()));
  const [rangeDays, setRangeDays] = useState("daily"); // "daily" | 7 | 30 | 90
  const [metric, setMetric] = useState("steps"); // steps | caloriesOut | restingHeartRate | sleepQualityScore

  // ===== Sheet =====
  const [rows, setRows] = useState("");
  const [loadingSheet, setLoadingSheet] = useState(true);
  const [sheetErr, setSheetErr] = useState("");

  // ===== Fitbit =====
  const [fitbitDay, setFitbitDay] = useState(null);
  const [fitbitRange, setFitbitRange] = useState([]);
  const [fitbitErr, setFitbitErr] = useState("");
  const [fitbitLoading, setFitbitLoading] = useState(false);

  // ===== Lift history controls =====
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [selectedExercise, setSelectedExercise] = useState(ALL_EXERCISES);
  const [splitFilter, setSplitFilter] = useState("all"); // all | push | pull | legs | other
  const [historyLimit, setHistoryLimit] = useState(40);

  const metricLabel =
    metric === "steps"
      ? "Steps"
      : metric === "caloriesOut"
      ? "Calories Out"
      : metric === "restingHeartRate"
      ? "Resting HR"
      : "Sleep Quality";

  const better = metric === "restingHeartRate" ? "lower" : "higher";
  const goal = useMemo(() => (metric === "steps" ? 10000 : null), [metric]);

  // ===== Load Google Sheet rows (CSV) =====
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingSheet(true);
      setSheetErr("");

      try {
        const res = await fetch(SHEET_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const txt = await res.text();
        if (alive) setRows(txt);
      } catch (e) {
        console.error(e);
        if (alive) setSheetErr("Could not load training log (Google Sheets).");
      } finally {
        if (alive) setLoadingSheet(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // ===== Derived data =====
  const liftsByISO = useMemo(() => buildLiftsByISO(rows), [rows]);
  const exerciseIndex = useMemo(() => buildExerciseIndex(liftsByISO), [liftsByISO]);

  const exerciseGroups = useMemo(() => {
    return groupExercisesBySplit(exerciseIndex, exerciseQuery);
  }, [exerciseIndex, exerciseQuery]);

  const exerciseNames = useMemo(() => {
    if (splitFilter === "push") return [ALL_EXERCISES, ...exerciseGroups.push];
    if (splitFilter === "pull") return [ALL_EXERCISES, ...exerciseGroups.pull];
    if (splitFilter === "legs") return [ALL_EXERCISES, ...exerciseGroups.legs];
    if (splitFilter === "other") return [ALL_EXERCISES, ...exerciseGroups.other];
    return [
      ALL_EXERCISES,
      ...exerciseGroups.push,
      ...exerciseGroups.pull,
      ...exerciseGroups.legs,
      ...exerciseGroups.other,
    ];
  }, [exerciseGroups, splitFilter]);

  useEffect(() => {
    if (!selectedExercise) setSelectedExercise(ALL_EXERCISES);
    if (selectedExercise !== ALL_EXERCISES && !exerciseNames.includes(selectedExercise)) {
      setSelectedExercise(ALL_EXERCISES);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseNames.join("|")]);

  useEffect(() => {
    setHistoryLimit(40);
  }, [selectedExercise, exerciseQuery, splitFilter]);

  const selectedExerciseHistory = useMemo(() => {
    if (!selectedExercise) return [];

    const inSplit = (it) => {
      if (splitFilter === "all") return true;
      return (it.split || "").toLowerCase() === splitFilter;
    };

    if (selectedExercise === ALL_EXERCISES) {
      const all = [];
      for (const arr of exerciseIndex.values()) all.push(...arr);
      all.sort((a, b) => b.iso.localeCompare(a.iso));
      return all.filter(inSplit);
    }

    return (exerciseIndex.get(selectedExercise) ?? []).filter(inSplit);
  }, [exerciseIndex, selectedExercise, splitFilter]);

  // ===== Fitbit day summary for selected date =====
  useEffect(() => {
    let alive = true;

    (async () => {
      setFitbitLoading(true);
      setFitbitErr("");

      try {
        const r = await fetch(
          `${FITBIT_API}/fitbit/today?date=${encodeURIComponent(selectedISO)}&nocache=1`,
          { cache: "no-store" }
        );

        const text = await r.text();
        if (!r.ok) throw new Error(text);

        const data = JSON.parse(text);
        if (alive) setFitbitDay(data);
      } catch (e) {
        console.error(e);
        if (alive) {
          setFitbitDay(null);
          setFitbitErr("Could not load Fitbit day summary.");
        }
      } finally {
        if (alive) setFitbitLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [selectedISO]);

  // ===== Fitbit range only when user selects 7/30/90 =====
  useEffect(() => {
    let alive = true;

    if (rangeDays === "daily") {
      setFitbitRange([]);
      return () => {
        alive = false;
      };
    }

    (async () => {
      try {
        const r = await fetch(
          `${FITBIT_API}/fitbit/range?days=${encodeURIComponent(rangeDays)}`,
          { cache: "no-store" }
        );

        const text = await r.text();
        if (!r.ok) throw new Error(text);

        const payload = JSON.parse(text);
        if (!alive) return;

        setFitbitRange(payload.data ?? []);
      } catch (e) {
        console.error(e);
        if (alive) setFitbitRange([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [rangeDays]);

  const trendData = useMemo(() => buildTrendData(fitbitRange, metric), [fitbitRange, metric]);

  const selectedLifts = liftsByISO.get(selectedISO) ?? [];
  const topLift = useMemo(() => topLiftForDay(selectedLifts), [selectedLifts]);

  const sleepSub = useMemo(() => {
    const s = fitbitDay;
    if (!s) return fmtDatePretty(selectedISO);

    const stages = s.sleepStages || {};
    const parts = [];

    if (Number.isFinite(stages.rem)) parts.push(`REM ${Math.round(stages.rem)}m`);
    if (Number.isFinite(stages.deep)) parts.push(`Deep ${Math.round(stages.deep)}m`);
    if (Number.isFinite(stages.light)) parts.push(`Light ${Math.round(stages.light)}m`);
    if (Number.isFinite(stages.wake)) parts.push(`Awake ${Math.round(stages.wake)}m`);

    if (!parts.length && s.sleepMinutes != null) parts.push(`Asleep ${fmtMins(s.sleepMinutes)}`);

    return parts.length ? parts.join(" • ") : fmtDatePretty(selectedISO);
  }, [fitbitDay, selectedISO]);

  const historyTitle =
    selectedExercise === ALL_EXERCISES
      ? "All exercises"
      : selectedExercise || "Select an exercise";

  return (
    <main
      className={`${styles.fitnessWrap} ${darkMode ? styles.dark : ""}`}
      style={{ "--stickyToolbarH": `${toolbarH}px` }}
    >
      <section className={styles.container}>
        {/* HEADER (Status + Title) */}
        <FitnessHeader
          darkMode={darkMode}
          onToggleDark={() => setDarkMode((d) => !d)}
          statusSlot={<FitbitStatusBanner apiBase={FITBIT_API} />}
        />

        {/* STICKY CONTROL BAR (handled inside component) */}
        <FitnessControlBar
          styles={styles}
          selectedISO={selectedISO}
          onSelectedISO={setSelectedISO}
          rangeDays={rangeDays}
          onRangeDays={setRangeDays}
          metric={metric}
          onMetric={setMetric}
          onJumpToToday={() => setSelectedISO(toISODateLocal(new Date()))}
          onToolbarHeight={setToolbarH}
        />

        {/* MAIN STACK */}
        <div className={styles.stack}>
          {/* TODAY AT A GLANCE */}
          <section className={styles.tileGrid} aria-label="Today at a glance">
            <FitnessTile title="Steps" value={fitbitDay?.steps ?? "—"} sub={fmtDatePretty(selectedISO)} />
            <FitnessTile
              title="Calories Out"
              value={fitbitDay?.caloriesOut ?? "—"}
              sub={fmtDatePretty(selectedISO)}
            />
            <FitnessTile
              title="Resting HR"
              value={fitbitDay?.restingHeartRate ?? "—"}
              sub={fitbitDay?.restingHeartRate ? "bpm" : fmtDatePretty(selectedISO)}
            />
            <FitnessTile title="Sleep Quality" value={fitbitDay?.sleepQualityScore ?? "—"} sub={sleepSub} />
          </section>

          {/* TRENDS */}
          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Trends</h2>
              <div className={styles.sectionMeta}>
                {fitbitLoading ? "Loading daily summary…" : fmtDatePretty(selectedISO)}
              </div>
            </div>

            {!!fitbitErr && <div className={`${styles.info} ${styles.error}`}>{fitbitErr}</div>}

            <div className={styles.chartHead}>
              <h3 className={styles.chartTitle}>{metricLabel}</h3>
              <span className={styles.chartMeta}>
                {rangeDays === "daily" ? "Daily stats shown above" : `Last ${rangeDays} days`}
              </span>
            </div>

            <div className={styles.chartBox}>
              {rangeDays === "daily" ? (
                <div className={styles.info}>Select 7 / 30 / 90 days to load a trend chart.</div>
              ) : trendData.length ? (
                <FitbitTrendCharts
                  title={metricLabel}
                  data={trendData}
                  rangeDays={Number(rangeDays)}
                  goal={goal}
                  trendWindow={14}
                  better={better}
                />
              ) : (
                <div className={styles.info}>No chart data yet.</div>
              )}
            </div>
          </section>

          {/* DAILY WORKOUT SUMMARY */}
          <DailyWorkoutSummaryCard
            styles={styles}
            iso={selectedISO}
            loading={loadingSheet}
            error={sheetErr}
            lifts={selectedLifts}
            topLift={topLift}
          />

          {/* WORKOUT HISTORY */}
          <WorkoutHistorySection
            styles={styles}
            splitFilter={splitFilter}
            onSplitFilter={setSplitFilter}
            splitLabel={splitLabel}
            exerciseQuery={exerciseQuery}
            onExerciseQuery={setExerciseQuery}
            selectedExercise={selectedExercise}
            onSelectedExercise={setSelectedExercise}
            exerciseNames={exerciseNames}
            ALL_EXERCISES={ALL_EXERCISES}
            historyTitle={historyTitle}
            history={selectedExerciseHistory}
            historyLimit={historyLimit}
            onLoadMore={() => setHistoryLimit((n) => n + 40)}
            onShowAll={() => setHistoryLimit(selectedExerciseHistory.length)}
            onViewDay={(iso) => setSelectedISO(iso)}
          />
        </div>

        <footer className={styles.siteFoot}>© {new Date().getFullYear()} William Lopez</footer>
      </section>
    </main>
  );
}
