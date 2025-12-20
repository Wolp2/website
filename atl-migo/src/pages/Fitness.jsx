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
    <div className={styles.statusBanner}>
      {fitbit.connected ? (
        <div className={styles.statusOk}>
          ✅ Fitbit connected
          {fitbit.lastSyncTime && (
            <div className={styles.statusSub}>
              Last token refresh: {new Date(fitbit.lastSyncTime).toLocaleString()}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.statusBad}>❌ Fitbit not connected</div>
      )}
    </div>
  );
}

/* ================= Simple SVG Line Chart ================= */
function MiniLineChart({ data, valueKey, height = 180 }) {
  const w = 720;
  const h = height;
  const pad = 16;

  const values = data.map((d) => (d?.[valueKey] == null ? 0 : Number(d[valueKey]) || 0));
  const max = Math.max(1, ...values);
  const min = Math.min(...values);

  const toX = (i) => {
    if (data.length <= 1) return pad;
    return pad + (i * (w - pad * 2)) / (data.length - 1);
  };

  const toY = (v) => {
    const range = Math.max(1e-9, max - min);
    const t = (v - min) / range;
    return h - pad - t * (h - pad * 2);
  };

  const pts = values.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const last = data[data.length - 1];
  const lastVal = last?.[valueKey];

  return (
    <div className={styles.chartWrap}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label="chart">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="currentColor" opacity="0.12" />
        <polyline fill="none" stroke="currentColor" strokeWidth="3" points={pts} opacity="0.9" />
      </svg>
      <div className={styles.chartFooter}>
        <span>{data[0]?.date ?? "—"}</span>
        <span>Latest: {lastVal == null ? "—" : lastVal}</span>
        <span>{data[data.length - 1]?.date ?? "—"}</span>
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
  const [rangeDays, setRangeDays] = useState("daily"); // "daily" | 7 | 30 | 90
  const [metric, setMetric] = useState("steps"); // steps | caloriesOut | restingHeartRate
  const [historyDays, setHistoryDays] = useState(30);

  const metricLabel =
    metric === "steps" ? "Steps" : metric === "caloriesOut" ? "Calories Out" : "Resting HR";

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

  // Build workouts grouped by ISO date from Sheets (LIFTS ONLY)
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

      const exercise = trim(r[cEx] ?? "");
      const miles = trim(r[cMi] ?? "");
      const minutes = trim(r[cMin] ?? "");

      // Only keep lift rows (exercise exists AND not a run row)
      if (!exercise) continue;
      if (miles || minutes) continue;

      const e = {
        date: curDate,
        iso: toISODateLocal(curDate),
        category: curCat,
        exercise,
        weight: trim(r[cWt] ?? ""),
        sets: trim(r[cSets] ?? ""),
        reps: trim(r[cReps] ?? ""),
        notes: trim(r[cNotes] ?? ""),
      };

      entries.push(e);
    }

    const map = new Map();
    for (const e of entries) {
      if (!map.has(e.iso)) map.set(e.iso, []);
      map.get(e.iso).push(e);
    }

    // Sort each day's lifts in a stable way (exercise name)
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => (a.exercise || "").localeCompare(b.exercise || ""));
      map.set(k, arr);
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

  // Selected day lifts
  const selectedLifts = liftsByISO.get(selectedISO) ?? [];

  // History list (recent days with lifts)
  const historyList = useMemo(() => {
    const allDays = Array.from(liftsByISO.keys()).sort((a, b) => b.localeCompare(a)); // newest first
    const limited = allDays.slice(0, clamp(historyDays, 1, 365));
    return limited.map((iso) => ({ iso, lifts: liftsByISO.get(iso) ?? [] }));
  }, [liftsByISO, historyDays]);

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

            <button
              className={styles.btn}
              onClick={() => setSelectedISO(new Date().toISOString().slice(0, 10))}
            >
              Jump to Today
            </button>
          </div>
        </section>

        {/* ===== Tiles (Fitbit) ===== */}
        <section className={styles.tileGrid}>
          <Tile title="Steps" value={fitbitDay?.steps ?? "—"} sub={fmtDatePretty(selectedISO)} />
          <Tile title="Calories Out" value={fitbitDay?.caloriesOut ?? "—"} sub={fmtDatePretty(selectedISO)} />
          <Tile
            title="Resting HR"
            value={fitbitDay?.restingHeartRate ?? "—"}
            sub={fitbitDay?.restingHeartRate ? "bpm" : fmtDatePretty(selectedISO)}
          />
        </section>

        {/* ===== Fitbit Chart + Errors ===== */}
        <section className={styles.panel} style={{ marginTop: 14 }}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Fitbit Trend</h2>
            <div className={styles.sectionMeta}>
              {fitbitLoading ? "Loading daily summary…" : fmtDatePretty(selectedISO)}
            </div>
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
            ) : fitbitRange.length ? (
              <MiniLineChart data={fitbitRange} valueKey={metric} />
            ) : (
              <div className={styles.info}>No chart data yet.</div>
            )}
          </div>
        </section>

        {/* ===== Lifts (Selected Date) ===== */}
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

        {/* ===== Lift History ===== */}
        <section className={styles.panel} style={{ marginTop: 14 }}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Lift History</h2>
            <div className={styles.sectionMeta}>Browse prior days from Sheets</div>
          </div>

          <div className={styles.historyBar}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Show last</span>
              <select
                className={styles.select}
                value={historyDays}
                onChange={(e) => setHistoryDays(clamp(parseInt(e.target.value, 10) || 30, 1, 365))}
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>365 days</option>
              </select>
            </label>

            <button className={styles.btn} onClick={() => setSelectedISO(new Date().toISOString().slice(0, 10))}>
              Today
            </button>
          </div>

          {loadingSheet ? (
            <div className={styles.info}>Loading history…</div>
          ) : sheetErr ? (
            <div className={`${styles.info} ${styles.error}`}>{sheetErr}</div>
          ) : historyList.length === 0 ? (
            <div className={styles.info}>No lift history found yet.</div>
          ) : (
            <div className={styles.historyList}>
              {historyList.map(({ iso, lifts }) => (
                <details key={iso} className={styles.historyDay}>
                  <summary className={styles.historySummary}>
                    <span className={styles.historyDate}>{fmtDatePretty(iso)}</span>
                    <span className={styles.historyCount}>{lifts.length} lifts</span>
                    <button
                      className={styles.linkBtn}
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedISO(iso);
                      }}
                      title="Jump to this date"
                    >
                      View
                    </button>
                  </summary>

                  <div className={styles.historyItems}>
                    {lifts.map((it, idx) => (
                      <LiftRow key={`${iso}-${idx}`} item={it} compact />
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
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
