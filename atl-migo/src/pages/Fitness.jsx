import { useEffect, useMemo, useState } from "react";
import styles from "./Fitness.module.css";
import FitbitTrendCharts from "../components/FitbitTrendCharts";

/** ===== External Sources ===== */
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZlEe5gpor6F0j6tRvsPrYhdrjOENGut0jUPdqTtyNYdefmRO72v1ogD9rLcUHN1HIJbMzkSfVNmRE/pub?gid=0&single=true&output=csv";

const FITBIT_API = "https://fitbit.wlopez2014.workers.dev";

/* ================= Helpers ================= */
const trim = (s) => (s ?? "").toString().trim();

function parseCSV(text) {
  const rows = [];
  let i = 0,
    cur = "",
    row = [],
    inQ = false;

  while (i < text.length) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 2;
        } else {
          inQ = false;
          i++;
        }
      } else {
        cur += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQ = true;
        i++;
      } else if (ch === ",") {
        row.push(cur);
        cur = "";
        i++;
      } else if (ch === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
        i++;
      } else if (ch === "\r") {
        i++;
      } else {
        cur += ch;
        i++;
      }
    }
  }
  row.push(cur);
  rows.push(row);
  if (rows.length && rows[rows.length - 1].every((c) => trim(c) === "")) rows.pop();
  return rows;
}

function parseMDY(str) {
  const t = trim(str);
  if (!t) return null;
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(t);
  if (!m) return null;
  let [, mm, dd, yy] = m.map(Number);
  if (yy < 100) yy += yy >= 70 ? 1900 : 2000;
  const d = new Date(yy, mm - 1, dd);
  return isNaN(+d) ? null : d;
}

const fmtDatePretty = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
};

const toISODateLocal = (d) => {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
};

const col = (headers, names) => {
  const h = headers.map((x) => trim(x).toLowerCase());
  for (const n of names) {
    const i = h.indexOf(n.toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
};

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

const parseWeightLbs = (w) => {
  const n = parseFloat(String(w || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const bestWeightInHistory = (hist) => {
  let best = null;
  for (const it of hist || []) {
    const w = parseWeightLbs(it?.weight);
    if (w == null) continue;
    best = best == null ? w : Math.max(best, w);
  }
  return best;
};

const normalizeExerciseName = (name) => {
  let s = trim(name).toLowerCase();
  s = s.replace(/\s+/g, " ");
  s = s.replace(/benchpress/g, "bench press");
  s = s.replace(/\s+at home\b/g, "");
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
};

const normalizeSplit = (category, exerciseName) => {
  const cat = trim(category).toLowerCase();
  const ex = trim(exerciseName).toLowerCase();

  // Your special-case fix
  if (ex.includes("back extension") || ex.includes("hyperextension")) return "pull";

  if (cat.includes("push")) return "push";
  if (cat.includes("pull")) return "pull";
  if (cat.includes("leg")) return "legs";

  if (
    ex.includes("squat") ||
    ex.includes("lunge") ||
    ex.includes("deadlift") ||
    ex.includes("romanian") ||
    ex.includes("rdl") ||
    ex.includes("leg press") ||
    ex.includes("leg extension") ||
    ex.includes("leg curl") ||
    ex.includes("calf") ||
    ex.includes("glute") ||
    ex.includes("hamstring") ||
    ex.includes("quad") ||
    ex.includes("hip thrust")
  )
    return "legs";

  if (
    ex.includes("row") ||
    ex.includes("pulldown") ||
    ex.includes("pull up") ||
    ex.includes("pullup") ||
    ex.includes("lat") ||
    ex.includes("face pull") ||
    ex.includes("rear delt") ||
    ex.includes("shrug") ||
    ex.includes("curl")
  )
    return "pull";

  if (
    ex.includes("bench") ||
    ex.includes("incline") ||
    ex.includes("press") ||
    ex.includes("overhead") ||
    ex.includes("chest") ||
    ex.includes("fly") ||
    ex.includes("dips") ||
    ex.includes("skull crusher") ||
    ex.includes("lateral raise") ||
    ex.includes("tricep")
  )
    return "push";

  return "other";
};

const splitLabel = (k) => (k === "push" ? "Push" : k === "pull" ? "Pull" : k === "legs" ? "Legs" : "Other");

/* ================= Fitbit Status Banner ================= */
function FitbitStatusBanner() {
  const [fitbit, setFitbit] = useState({ connected: false, lastSyncTime: null, hasKV: false });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${FITBIT_API}/fitbit/status`, { cache: "no-store" });
        const data = await res.json();
        if (alive) setFitbit(data);
      } catch {
        if (alive) setFitbit({ connected: false, lastSyncTime: null, hasKV: false });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className={styles.statusBanner}>
      {fitbit.connected ? (
        <div className={styles.statusOk}>
          ✅ Fitbit connected
          {fitbit.lastSyncTime && (
            <div className={styles.statusSub}>Last token refresh: {new Date(fitbit.lastSyncTime).toLocaleString()}</div>
          )}
        </div>
      ) : (
        <div className={styles.statusBad}>❌ Fitbit not connected</div>
      )}
    </div>
  );
}

/* ================= Component ================= */
export default function Fitness() {
  // Sheets
  const [rows, setRows] = useState([]);
  const [loadingSheet, setLoadingSheet] = useState(true);
  const [sheetErr, setSheetErr] = useState("");

  // Fitbit
  const [fitbitDay, setFitbitDay] = useState(null);
  const [fitbitRange, setFitbitRange] = useState([]);
  const [fitbitErr, setFitbitErr] = useState("");
  const [fitbitLoading, setFitbitLoading] = useState(false);

  // UI
  const [selectedISO, setSelectedISO] = useState(() => toISODateLocal(new Date()))
  const [rangeDays, setRangeDays] = useState("daily"); // "daily" | 7 | 30 | 90
  const [metric, setMetric] = useState("steps"); // steps | caloriesOut | restingHeartRate

  // Exercise progress UI
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [selectedExercise, setSelectedExercise] = useState("");
  const [splitFilter, setSplitFilter] = useState("all"); // all | push | pull | legs | other

  const metricLabel = metric === "steps" ? "Steps" : metric === "caloriesOut" ? "Calories Out" : "Resting HR";

  // Load Sheets CSV
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingSheet(true);
      setSheetErr("");
      try {
        const res = await fetch(SHEET_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const txt = await res.text();
        if (alive) setRows(parseCSV(txt));
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

  // Build lifts grouped by ISO date from Sheets (LIFTS ONLY)
  const liftsByISO = useMemo(() => {
    if (!rows.length) return new Map();

    const headers = rows[0];
    const body = rows.slice(1);

    const cDate = col(headers, ["date"]);
    const cCat = col(headers, ["category", "tag", "focus", "split", "type"]);
    const cEx = col(headers, ["exercise"]);
    const cWt = col(headers, ["weight", "load", "lbs"]);
    const cSets = col(headers, ["sets"]);
    const cReps = col(headers, ["reps"]);
    const cMi = col(headers, ["distance (mi)", "distance mi", "miles"]);
    const cMin = col(headers, ["duration(min)", "duration (min)", "minutes", "duration"]);
    const cNotes = col(headers, ["notes", "comments", "note"]);

    let curDate = null;
    let curCat = "";
    const entries = [];

    for (const r of body) {
      const dateCell = trim(r[cDate] ?? "");
      const catCell = trim(r[cCat] ?? "");
      if (dateCell) curDate = parseMDY(dateCell) ?? curDate;
      if (catCell) curCat = catCell;
      if (!curDate) continue;

      const exerciseRaw = trim(r[cEx] ?? "");
      const miles = trim(r[cMi] ?? "");
      const minutes = trim(r[cMin] ?? "");

      if (!exerciseRaw) continue;
      if (miles || minutes) continue;

      const exercise = normalizeExerciseName(exerciseRaw);

      entries.push({
        date: curDate,
        iso: toISODateLocal(curDate),
        category: curCat,
        exercise,
        weight: trim(r[cWt] ?? ""),
        sets: trim(r[cSets] ?? ""),
        reps: trim(r[cReps] ?? ""),
        notes: trim(r[cNotes] ?? ""),
      });
    }

    const map = new Map();
    for (const e of entries) {
      if (!map.has(e.iso)) map.set(e.iso, []);
      map.get(e.iso).push(e);
    }

    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => (a.exercise || "").localeCompare(b.exercise || ""));
      map.set(k, arr);
    }

    return map;
  }, [rows]);

  // Exercise index: exerciseName -> entries sorted newest first
  const exerciseIndex = useMemo(() => {
    const map = new Map();
    for (const [iso, lifts] of liftsByISO.entries()) {
      for (const it of lifts) {
        const name = trim(it.exercise);
        if (!name) continue;
        if (!map.has(name)) map.set(name, []);
        map.get(name).push({ ...it, iso });
      }
    }

    for (const [name, arr] of map.entries()) {
      arr.sort((a, b) => b.iso.localeCompare(a.iso));
      map.set(name, arr);
    }

    return map;
  }, [liftsByISO]);

  // Group exercises by split based on most-recent entry's category
  const exerciseGroups = useMemo(() => {
    const baseNames = Array.from(exerciseIndex.keys());

    const filtered = !exerciseQuery
      ? baseNames
      : baseNames.filter((n) => n.toLowerCase().includes(exerciseQuery.toLowerCase()));

    filtered.sort((a, b) => {
      const aIso = exerciseIndex.get(a)?.[0]?.iso || "0000-00-00";
      const bIso = exerciseIndex.get(b)?.[0]?.iso || "0000-00-00";
      return bIso.localeCompare(aIso);
    });

    const groups = { push: [], pull: [], legs: [], other: [] };

    for (const name of filtered) {
      const last = exerciseIndex.get(name)?.[0];
      const split = normalizeSplit(last?.category, name);
      (groups[split] ?? groups.other).push(name);
    }

    return groups;
  }, [exerciseIndex, exerciseQuery]);

  const exerciseNames = useMemo(() => {
    return [...exerciseGroups.push, ...exerciseGroups.pull, ...exerciseGroups.legs, ...exerciseGroups.other];
  }, [exerciseGroups]);

  const selectedExerciseHistory = useMemo(() => {
    if (!selectedExercise) return [];
    return exerciseIndex.get(selectedExercise) ?? [];
  }, [exerciseIndex, selectedExercise]);

  useEffect(() => {
    if (!selectedExercise && exerciseNames.length) setSelectedExercise(exerciseNames[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseNames.length]);

  // Load Fitbit day summary for selected date
  useEffect(() => {
    let alive = true;
    (async () => {
      setFitbitLoading(true);
      setFitbitErr("");
      try {
        const r = await fetch(`${FITBIT_API}/fitbit/summary?date=${encodeURIComponent(selectedISO)}`, {
          cache: "no-store",
        });

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

  // Load Fitbit range for chart ONLY when user selects 7/30/90
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
        const r = await fetch(`${FITBIT_API}/fitbit/range?days=${encodeURIComponent(rangeDays)}`, {
          cache: "no-store",
        });
        const text = await r.text();
        if (!r.ok) throw new Error(text);
        const payload = JSON.parse(text);
        if (alive) setFitbitRange(payload.data ?? []);
      } catch (e) {
        console.error(e);
        if (alive) setFitbitRange([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [rangeDays]);

  const trendData = useMemo(() => {
    const key = metric;
    return (fitbitRange ?? []).map((d) => ({
      date: d.date,
      value: Number(d?.[key] ?? 0),
    }));
  }, [fitbitRange, metric]);

  const selectedLifts = liftsByISO.get(selectedISO) ?? [];

  const goal = useMemo(() => {
    if (metric === "steps") return 10000;
    return null;
  }, [metric]);

  return (
    <main className={styles.fitnessWrap}>
      <section className={styles.container}>
        <FitbitStatusBanner />

        <header className={styles.hero}>
          <h1>Fitness Dashboard</h1>
          <p className={styles.sub}>Fitbit stats + lift tracking (Google Sheets).</p>
        </header>

        {/* Controls */}
        <section className={styles.panel}>
          <div className={styles.controlsRow}>
            <div className={styles.controlsGroup}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Date</span>
                <input
                  className={styles.input}
                  type="date"
                  value={selectedISO}
                  onChange={(e) => setSelectedISO(e.target.value)}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Chart range</span>
                <select
                  className={styles.select}
                  value={String(rangeDays)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "daily") return setRangeDays("daily");
                    const n = clamp(parseInt(v, 10), 7, 90);
                    setRangeDays(n);
                  }}
                >
                  <option value="daily">Daily stats (default)</option>
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Metric</span>
                <select className={styles.select} value={metric} onChange={(e) => setMetric(e.target.value)}>
                  <option value="steps">Steps</option>
                  <option value="caloriesOut">Calories Out</option>
                  <option value="restingHeartRate">Resting HR</option>
                </select>
              </label>
            </div>

            <button className={styles.btn} onClick={() => setSelectedISO(toISODateLocal(new Date()))}>
              Jump to Today
            </button>
          </div>
        </section>

        {/* Tiles */}
        <section className={styles.tileGrid}>
          <Tile title="Steps" value={fitbitDay?.steps ?? "—"} sub={fmtDatePretty(selectedISO)} />
          <Tile title="Calories Out" value={fitbitDay?.caloriesOut ?? "—"} sub={fmtDatePretty(selectedISO)} />
          <Tile
            title="Resting HR"
            value={fitbitDay?.restingHeartRate ?? "—"}
            sub={fitbitDay?.restingHeartRate ? "bpm" : fmtDatePretty(selectedISO)}
          />
        </section>

        {/* Fitbit Chart */}
        <section className={styles.panel} style={{ marginTop: 14 }}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Fitbit Trend</h2>
            <div className={styles.sectionMeta}>{fitbitLoading ? "Loading daily summary…" : fmtDatePretty(selectedISO)}</div>
          </div>

          {!!fitbitErr && <div className={`${styles.info} ${styles.error}`}>{fitbitErr}</div>}

          <div className={styles.chartHead}>
            <h3 className={styles.chartTitle}>{metricLabel}</h3>
            <span className={styles.chartMeta}>
              {rangeDays === "daily" ? "Daily stats shown above" : `${rangeDays} days`}
            </span>
          </div>

          <div className={styles.chartBox}>
            {rangeDays === "daily" ? (
              <div className={styles.info}>
                Select 7 / 30 / 90 days to load a trend chart. (Daily stats are shown above by default.)
              </div>
            ) : trendData.length ? (
              <FitbitTrendCharts title={metricLabel} data={trendData} rangeDays={Number(rangeDays)} goal={goal} trendWindow={14} />
            ) : (
              <div className={styles.info}>No chart data yet.</div>
            )}
          </div>
        </section>

        {/* Lifts for selected day */}
        <section className={styles.panel} style={{ marginTop: 14 }}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Lifts — {fmtDatePretty(selectedISO)}</h2>
            <div className={styles.sectionMeta}>
              {loadingSheet ? "Loading log…" : sheetErr ? "Sheets error" : `${selectedLifts.length} lifts`}
            </div>
          </div>

          {sheetErr ? <div className={`${styles.info} ${styles.error}`}>{sheetErr}</div> : null}

          {!sheetErr && !loadingSheet && selectedLifts.length === 0 ? (
            <div className={styles.info}>No lifts logged for this date.</div>
          ) : null}

          {!sheetErr && selectedLifts.length > 0 ? (
            <div className={styles.liftGrid}>
              {selectedLifts.map((it, i) => (
                <LiftRow key={`${it.iso}-${i}`} item={it} />
              ))}
            </div>
          ) : null}
        </section>

        {/* Progress by Exercise */}
        <section className={styles.panel} style={{ marginTop: 14 }}>
          {/* Header with tabs on the right */}
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>Progress by Exercise</h2>
              <div className={styles.sectionMeta}>Pick an exercise to see your history</div>
            </div>

            <div className={styles.splitTabs}>
              <button
                type="button"
                className={`${styles.tabBtn} ${splitFilter === "all" ? styles.tabBtnActive : ""}`}
                onClick={() => setSplitFilter("all")}
              >
                All
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${splitFilter === "push" ? styles.tabBtnActive : ""}`}
                onClick={() => setSplitFilter("push")}
              >
                Push
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${splitFilter === "pull" ? styles.tabBtnActive : ""}`}
                onClick={() => setSplitFilter("pull")}
              >
                Pull
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${splitFilter === "legs" ? styles.tabBtnActive : ""}`}
                onClick={() => setSplitFilter("legs")}
              >
                Legs
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${splitFilter === "other" ? styles.tabBtnActive : ""}`}
                onClick={() => setSplitFilter("other")}
              >
                Other
              </button>
            </div>
          </div>

          {/* Cards FIRST */}
          {(() => {
            const groupsToShow = splitFilter === "all" ? ["push", "pull", "legs", "other"] : [splitFilter];

            return (
              <div className={styles.splitSections}>
                {groupsToShow.map((g) => {
                  const list = exerciseGroups[g] ?? [];
                  if (!list.length) return null;

                  return (
                    <div key={g} className={styles.splitSection}>
                      <div className={styles.splitHeader}>
                        <h3 className={styles.splitTitle}>{splitLabel(g)}</h3>
                        <span className={styles.splitCount}>{list.length} exercises</span>
                      </div>

                      <div className={styles.exerciseGrid}>
                        {list.slice(0, 18).map((name) => {
                          const hist = exerciseIndex.get(name) ?? [];
                          const last = hist[0];
                          const best = bestWeightInHistory(hist);

                          return (
                            <button
                              key={name}
                              type="button"
                              className={`${styles.exerciseCard} ${name === selectedExercise ? styles.exerciseCardActive : ""}`}
                              onClick={() => setSelectedExercise(name)}
                            >
                              <div className={styles.exerciseName}>{name}</div>

                              <div className={styles.exerciseLast}>
                                <span className={styles.muted}>{last?.iso ? fmtDatePretty(last.iso) : "—"}</span>

                                <div className={styles.badgeRow}>
                                  {last?.weight ? <span className={styles.pill}>Last: {last.weight}</span> : null}
                                  {best != null ? <span className={styles.pillAlt}>Best: {best} lb</span> : null}
                                </div>
                              </div>

                              <div className={styles.exerciseMeta}>Sets: {last?.sets || "-"} • Reps: {last?.reps || "-"}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Search + Exercise dropdown BELOW cards */}
          <div className={styles.exerciseBar}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Search</span>
              <input
                className={styles.input}
                value={exerciseQuery}
                onChange={(e) => setExerciseQuery(e.target.value)}
                placeholder="bench, incline, squat..."
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Exercise</span>
              <select className={styles.select} value={selectedExercise} onChange={(e) => setSelectedExercise(e.target.value)}>
                {exerciseNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>

            <button
              className={styles.btn}
              onClick={() => {
                const first = selectedExerciseHistory[0];
                if (first?.iso) setSelectedISO(first.iso);
              }}
              disabled={!selectedExerciseHistory.length}
              title="Jump date picker to most recent entry"
            >
              Jump to Latest
            </button>
          </div>

          {/* Results */}
          <div className={styles.tableWrap}>
            <div className={styles.tableHead}>
              <h3 className={styles.chartTitle} style={{ margin: 0 }}>
                {selectedExercise || "Select an exercise"}
              </h3>
              <span className={styles.chartMeta}>
                {selectedExerciseHistory.length ? `${selectedExerciseHistory.length} entries` : "No entries"}
              </span>
            </div>

            {selectedExerciseHistory.length ? (
              <div className={styles.table}>
                <div className={`${styles.tr} ${styles.th}`}>
                  <div>Date</div>
                  <div>Weight</div>
                  <div>Sets</div>
                  <div>Reps</div>
                  <div>Notes</div>
                  <div></div>
                </div>

                {selectedExerciseHistory.slice(0, 40).map((it, idx) => (
                  <div key={`${it.iso}-${idx}`} className={styles.tr}>
                    <div>{fmtDatePretty(it.iso)}</div>
                    <div>{it.weight || "—"}</div>
                    <div>{it.sets || "—"}</div>
                    <div>{it.reps || "—"}</div>
                    <div className={styles.notesCell}>{it.notes || ""}</div>
                    <div>
                      <button className={styles.linkBtn} onClick={() => setSelectedISO(it.iso)}>
                        View day
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.info}>No history for this exercise yet.</div>
            )}
          </div>
        </section>

        <footer className={styles.siteFoot}>© {new Date().getFullYear()} William Lopez</footer>
      </section>
    </main>
  );
}

/* ---------- UI Pieces ---------- */
function Tile({ title, value, sub }) {
  return (
    <div className={styles.tile}>
      <div className={styles.tileTitle}>{title}</div>
      <div className={styles.tileValue}>{value ?? "—"}</div>
      <div className={styles.tileSub}>{sub ?? ""}</div>
    </div>
  );
}

function LiftRow({ item, compact = false }) {
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
