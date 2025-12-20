import { useEffect, useMemo, useState } from "react";
import styles from "./Fitness.module.css";

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
  if (!d) return "";
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

function paceFrom(distanceMiles, durationMin) {
  if (!distanceMiles || !durationMin) return null;
  const pace = durationMin / distanceMiles;
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}/mi`;
}

const toMinutes = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;

  const s = String(v).trim().toLowerCase();

  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);

  if (s.includes(":")) {
    const parts = s.split(":").map((x) => parseFloat(x) || 0);
    if (parts.length === 3) {
      const [hh, mm, ss] = parts;
      return hh * 60 + mm + ss / 60;
    }
    const [mm, ss] = parts;
    return mm + ss / 60;
  }

  const m = s.match(
    /(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?)?/
  );
  if (m) {
    const h = parseFloat(m[1] || 0);
    const min = parseFloat(m[2] || 0);
    const sec = parseFloat(m[3] || 0);
    if (h || min || sec) return h * 60 + min + sec / 60;
  }

  return 0;
};

const formatDuration = (minutesFloat) => {
  const totalSeconds = Math.round(minutesFloat * 60);
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  if (ss === 0) return `${mm} min`;
  if (mm === 0) return `${ss} sec`;
  return `${mm}m ${ss}s`;
};

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

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
    <div style={{ marginBottom: 12 }}>
      {fitbit.connected ? (
        <div>
          ✅ Fitbit connected
          {fitbit.lastSyncTime && (
            <div style={{ opacity: 0.75, fontSize: 13 }}>
              Last token refresh: {new Date(fitbit.lastSyncTime).toLocaleString()}
              {!fitbit.hasKV ? (
                <span style={{ marginLeft: 8, opacity: 0.8 }}>
                  (Tip: add KV to avoid refreshing every request)
                </span>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <div>❌ Fitbit not connected</div>
      )}
    </div>
  );
}

/* ================= Simple SVG Line Chart ================= */
function MiniLineChart({ data, valueKey, height = 140 }) {
  const w = 720;
  const h = height;
  const pad = 14;

  const values = data.map((d) => (d?.[valueKey] == null ? 0 : d[valueKey]));
  const max = Math.max(1, ...values);
  const min = Math.min(...values);

  const toX = (i) => {
    if (data.length <= 1) return pad;
    return pad + (i * (w - pad * 2)) / (data.length - 1);
  };

  const toY = (v) => {
    const range = Math.max(1, max - min);
    const t = (v - min) / range; // 0..1
    return h - pad - t * (h - pad * 2);
  };

  const pts = values.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const last = data[data.length - 1];
  const lastVal = last?.[valueKey];

  return (
    <div style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label="chart">
        <polyline fill="none" stroke="currentColor" strokeWidth="3" points={pts} opacity="0.85" />
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="currentColor" opacity="0.15" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.75 }}>
        <span>{data[0]?.date}</span>
        <span>Latest: {lastVal == null ? "—" : lastVal}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

/* ================= Modal ================= */
function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(920px, 100%)",
          background: "white",
          borderRadius: 16,
          padding: 16,
          maxHeight: "80vh",
          overflow: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ padding: "8px 10px", borderRadius: 10 }}>
            Close
          </button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
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
  const [selectedISO, setSelectedISO] = useState(() => new Date().toISOString().slice(0, 10));
  const [rangeDays, setRangeDays] = useState(30);
  const [metric, setMetric] = useState("steps"); // steps | caloriesOut | restingHeartRate
  const [workoutsOpen, setWorkoutsOpen] = useState(false);

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
        if (alive) setSheetErr("Could not load training log.");
      } finally {
        if (alive) setLoadingSheet(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Build workouts grouped by ISO date from Sheets
  const workoutsByISO = useMemo(() => {
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
    const cMin = col(headers, ["duration(min)", "duration (min)", "distance min", "minutes"]);
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

      const e = {
        date: curDate,
        iso: toISODateLocal(curDate),
        category: curCat,
        exercise: trim(r[cEx] ?? ""),
        weight: trim(r[cWt] ?? ""),
        sets: trim(r[cSets] ?? ""),
        reps: trim(r[cReps] ?? ""),
        miles: trim(r[cMi] ?? ""),
        minutes: trim(r[cMin] ?? ""),
        notes: trim(r[cNotes] ?? ""),
      };

      if (e.exercise || e.weight || e.sets || e.reps || e.miles || e.minutes || e.notes) {
        entries.push(e);
      }
    }

    const map = new Map();
    for (const e of entries) {
      if (!map.has(e.iso)) map.set(e.iso, []);
      map.get(e.iso).push(e);
    }
    return map;
  }, [rows]);

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
          setFitbitErr("Could not load Fitbit day summary (check Worker + CORS).");
        }
      } finally {
        if (alive) setFitbitLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedISO]);

  // Load Fitbit range for chart
  useEffect(() => {
    let alive = true;
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

  const selectedWorkouts = workoutsByISO.get(selectedISO) ?? [];
  const hasWorkout = selectedWorkouts.length > 0;

  const liftItems = selectedWorkouts.filter((x) => x.exercise && !trim(x.miles) && !trim(x.minutes));
  const runItems = selectedWorkouts.filter((x) => trim(x.miles) || trim(x.minutes));

  const runTotals = useMemo(() => {
    let miTotal = 0;
    let minTotal = 0;
    for (const r of runItems) {
      const d = parseFloat((r.miles || "").replace(/[^\d.]/g, ""));
      const m = toMinutes(r.minutes);
      if (!isNaN(d)) miTotal += d;
      if (!isNaN(m)) minTotal += m;
    }
    return {
      miles: miTotal,
      minutes: minTotal,
      pace: miTotal > 0 && minTotal > 0 ? paceFrom(miTotal, minTotal) : null,
    };
  }, [runItems]);

  const metricLabel =
    metric === "steps" ? "Steps" : metric === "caloriesOut" ? "Calories Out" : "Resting HR";

  // If HR is null across the entire range, chart looks flat; that's okay.
  const chartData = fitbitRange;

  return (
    <main className={styles.fitnessWrap}>
      <section className={styles.container}>
        <FitbitStatusBanner />

        <header className={styles.hero}>
          <h1>Fitness Dashboard</h1>
          <p className={styles.sub}>
            Fitbit daily stats + your logged workouts (Google Sheets).
          </p>
        </header>

        {/* Controls */}
        <section className={styles.panel}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Date</span>
                <input
                  type="date"
                  value={selectedISO}
                  onChange={(e) => setSelectedISO(e.target.value)}
                  style={{ padding: 10, borderRadius: 12, border: "1px solid rgba(0,0,0,0.15)" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Chart range</span>
                <select
                  value={rangeDays}
                  onChange={(e) => setRangeDays(clamp(parseInt(e.target.value, 10), 7, 180))}
                  style={{ padding: 10, borderRadius: 12, border: "1px solid rgba(0,0,0,0.15)" }}
                >
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                  <option value={180}>Last 180 days</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Metric</span>
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value)}
                  style={{ padding: 10, borderRadius: 12, border: "1px solid rgba(0,0,0,0.15)" }}
                >
                  <option value="steps">Steps</option>
                  <option value="caloriesOut">Calories Out</option>
                  <option value="restingHeartRate">Resting HR</option>
                </select>
              </label>
            </div>

            <button
              onClick={() => setSelectedISO(new Date().toISOString().slice(0, 10))}
              style={{ padding: "10px 12px", borderRadius: 12 }}
            >
              Jump to Today
            </button>
          </div>
        </section>

        {/* Fitbit overview */}
        <section className={styles.panel} style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Fitbit — {fmtDatePretty(selectedISO)}</h2>
            {fitbitLoading ? <span style={{ opacity: 0.7 }}>Loading…</span> : null}
          </div>

          {!!fitbitErr && <div className={`${styles.info} ${styles.error}`}>{fitbitErr}</div>}

          {!fitbitErr && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
              <StatCard label="Steps" value={fitbitDay?.steps ?? "—"} />
              <StatCard label="Calories Out" value={fitbitDay?.caloriesOut ?? "—"} />
              <StatCard
                label="Resting HR"
                value={fitbitDay?.restingHeartRate ?? "—"}
                suffix={fitbitDay?.restingHeartRate ? " bpm" : ""}
              />
            </div>
          )}

          {/* Chart */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>{metricLabel} Trend</h3>
              <span style={{ fontSize: 12, opacity: 0.7 }}>{rangeDays} days</span>
            </div>

            <div style={{ marginTop: 10 }}>
              {chartData.length ? (
                <MiniLineChart data={chartData} valueKey={metric} />
              ) : (
                <div className={styles.info}>No chart data yet.</div>
              )}
            </div>
          </div>
        </section>

        {/* Workouts (small footprint) */}
        <section className={styles.panel} style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0 }}>Workouts — {fmtDatePretty(selectedISO)}</h2>
              <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
                {loadingSheet ? "Loading training log…" : sheetErr ? sheetErr : hasWorkout ? "Workout logged" : "No workout logged"}
              </div>
            </div>

            <button
              onClick={() => setWorkoutsOpen(true)}
              disabled={!hasWorkout}
              style={{ padding: "10px 12px", borderRadius: 12, opacity: hasWorkout ? 1 : 0.55 }}
              title={!hasWorkout ? "No workout logged for this date" : "View details"}
            >
              View details
            </button>
          </div>

          {hasWorkout && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <span className={styles.chip}>{liftItems.length} lifts</span>
              <span className={styles.chip}>{runItems.length} runs</span>
              {runTotals.miles > 0 ? <span className={styles.chip}>{runTotals.miles.toFixed(2)} mi</span> : null}
              {runTotals.minutes > 0 ? <span className={styles.chip}>{formatDuration(runTotals.minutes)}</span> : null}
              {runTotals.pace ? <span className={styles.chip}>{runTotals.pace}</span> : null}
            </div>
          )}
        </section>

        <Modal open={workoutsOpen} onClose={() => setWorkoutsOpen(false)} title={`Workout Details — ${fmtDatePretty(selectedISO)}`}>
          {!hasWorkout ? (
            <div className={styles.info}>No workouts logged for this day.</div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {liftItems.length > 0 && (
                <div>
                  <h4 style={{ margin: "6px 0" }}>Lifts</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                    {liftItems.map((it, i) => (
                      <LiftCard key={i} item={it} />
                    ))}
                  </div>
                </div>
              )}

              {runItems.length > 0 && (
                <div>
                  <h4 style={{ margin: "6px 0" }}>Runs</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
                    {runItems.map((it, i) => (
                      <RunCard key={i} item={it} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>

        <footer className={styles.siteFoot}>© {new Date().getFullYear()} William Lopez</footer>
      </section>
    </main>
  );
}

/* ---------- Cards ---------- */
function StatCard({ label, value, suffix = "" }) {
  return (
    <div className={styles.card} style={{ padding: 14 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>
        {value}
        {suffix}
      </div>
    </div>
  );
}

function LiftCard({ item }) {
  return (
    <div className={styles.card} style={{ padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <strong>{item.exercise || "—"}</strong>
        {item.weight ? <span className={styles.pill}>{item.weight}</span> : null}
      </div>
      <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>
        Sets: {item.sets || "-"} · Reps: {item.reps || "-"}
      </div>
      {item.notes ? <div style={{ marginTop: 6, fontSize: 13, opacity: 0.7 }}>{item.notes}</div> : null}
    </div>
  );
}

function RunCard({ item }) {
  const dist = item.miles ? parseFloat(item.miles.replace(/[^\d.]/g, "")) : null;
  const mins = item.minutes ? toMinutes(item.minutes) : null;
  const pace = dist && mins ? paceFrom(dist, mins) : null;

  return (
    <div className={styles.card} style={{ padding: 12 }}>
      <div style={{ fontSize: 14 }}>
        <strong>Run</strong>
        {dist ? ` · ${dist} mi` : ""}
        {mins ? ` · ${formatDuration(mins)}` : ""}
        {pace ? ` · ${pace}` : ""}
      </div>
      {item.notes ? <div style={{ marginTop: 6, fontSize: 13, opacity: 0.7 }}>{item.notes}</div> : null}
    </div>
  );
}
