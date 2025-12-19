import { useEffect, useMemo, useState } from "react";
import styles from "./Fitness.module.css";

/** ===== CSV URL ===== */
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZlEe5gpor6F0j6tRvsPrYhdrjOENGut0jUPdqTtyNYdefmRO72v1ogD9rLcUHN1HIJbMzkSfVNmRE/pub?gid=0&single=true&output=csv";

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

const fmtDate = (d) =>
  d
    ? d.toLocaleDateString(undefined, {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      })
    : "";

function paceFrom(distanceMiles, durationMin) {
  if (!distanceMiles || !durationMin) return null;
  const pace = durationMin / distanceMiles; // min/mi
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}/mi`;
}

const toMinutes = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;

  const s = String(v).trim().toLowerCase();

  // numeric string => minutes
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);

  // mm:ss or hh:mm:ss
  if (s.includes(":")) {
    const parts = s.split(":").map((x) => parseFloat(x) || 0);
    if (parts.length === 3) {
      const [hh, mm, ss] = parts;
      return hh * 60 + mm + ss / 60;
    }
    const [mm, ss] = parts;
    return mm + ss / 60;
  }

  // words: "1h 5m 30s" or "29 minutes and 20 seconds"
  const m = s.match(
    /(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?)?/
  );
  if (m) {
    const h = parseFloat(m[1] || 0);
    const min = parseFloat(m[2] || 0);
    const sec = parseFloat(m[3] || 0);
    if (h || min || sec) return h * 60 + min + sec / 60;
  }

  const cleaned = s.replace(/[^\d:.]/g, "");
  if (cleaned.includes(":")) return toMinutes(cleaned);
  if (/^\d+(\.\d+)?$/.test(cleaned)) return parseFloat(cleaned);
  return 0;
};

const formatDuration = (minutesFloat) => {
  const totalSeconds = Math.round(minutesFloat * 60);
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  const minLabel = mm === 1 ? "minute" : "minutes";
  const secLabel = ss === 1 ? "second" : "seconds";
  if (ss === 0) return `${mm} ${minLabel}`;
  if (mm === 0) return `${ss} ${secLabel}`;
  return `${mm} ${minLabel} and ${ss} ${secLabel}`;
};

const col = (headers, names) => {
  const h = headers.map((x) => trim(x).toLowerCase());
  for (const n of names) {
    const i = h.indexOf(n.toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
};

/* ================= Fitbit Banner ================= */
function FitbitStatusBanner() {
  const [fitbit, setFitbit] = useState({ connected: false, lastSyncTime: null });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/fitbit/status");
        const data = await res.json();
        setFitbit(data);
      } catch {
        // If the endpoint fails, just show "not connected"
        setFitbit({ connected: false, lastSyncTime: null });
      }
    })();
  }, []);

  return (
    <div style={{ marginBottom: 12 }}>
      {fitbit.connected ? (
        <div>
          ✅ Fitbit connected
          {fitbit.lastSyncTime && (
            <div>Last sync: {new Date(fitbit.lastSyncTime).toLocaleString()}</div>
          )}
        </div>
      ) : (
        <div>
          ❌ Fitbit not connected — <a href="/fitbit/login">Connect</a>
        </div>
      )}
    </div>
  );
}

/* ================= Component ================= */
export default function Fitness() {
  // State
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [visibleSessions, setVisibleSessions] = useState(7);
  const [visibleRuns, setVisibleRuns] = useState(10);

  // Load CSV
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const res = await fetch(SHEET_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const txt = await res.text();
        if (alive) setRows(parseCSV(txt));
      } catch (e) {
        console.error(e);
        if (alive) setErr("Could not load training log.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Transform data
  const {
    latestDate,
    latestLifts,
    latestTag,
    latestRuns,
    runTotalsLatest,
    historyAll,
    runsAll,
  } = useMemo(() => {
    if (!rows.length)
      return {
        latestDate: null,
        latestLifts: [],
        latestTag: "",
        latestRuns: [],
        runTotalsLatest: { miles: 0, minutes: 0, pace: null },
        historyAll: [],
        runsAll: [],
      };

    const headers = rows[0];
    const body = rows.slice(1);

    // Columns
    const cDate = col(headers, ["date"]);
    const cCat = col(headers, ["category", "tag", "focus", "split", "type"]);
    const cEx = col(headers, ["exercise"]);
    const cWt = col(headers, ["weight", "load", "lbs"]);
    const cSets = col(headers, ["sets"]);
    const cReps = col(headers, ["reps"]);
    const cMi = col(headers, ["distance (mi)", "distance mi", "miles"]);
    const cMin = col(headers, ["duration(min)", "duration (min)", "distance min", "minutes"]);
    const cNotes = col(headers, ["notes", "comments", "note"]);

    // Build entries (support repeated date/category rows)
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

    if (!entries.length)
      return {
        latestDate: null,
        latestLifts: [],
        latestTag: "",
        latestRuns: [],
        runTotalsLatest: { miles: 0, minutes: 0, pace: null },
        historyAll: [],
        runsAll: [],
      };

    // Group by date
    const byDate = new Map();
    for (const e of entries) {
      const k = e.date.toDateString();
      if (!byDate.has(k)) byDate.set(k, []);
      byDate.get(k).push(e);
    }

    // Dates newest→oldest
    const dates = [...byDate.values()].map((v) => v[0].date).sort((a, b) => b - a);

    const latestDate = dates[0];
    const latestRows = byDate.get(latestDate.toDateString()) ?? [];

    const latestTag =
      latestRows.find((x) => trim(x.category))?.category ||
      latestRows.find((x) => trim(x.exercise))?.category ||
      "";

    // Identify runs
    const isRun = (r) =>
      (trim(r.miles) && trim(r.miles) !== "0") ||
      (trim(r.minutes) && trim(r.minutes) !== "0");

    const latestRuns = latestRows.filter(isRun);
    const latestLifts = latestRows.filter((r) => !isRun(r) && r.exercise);

    // Totals for latest day (runs)
    let miTotal = 0,
      minTotal = 0;
    for (const r of latestRuns) {
      const d = parseFloat((r.miles || "").replace(/[^\d.]/g, ""));
      const m = toMinutes(r.minutes);
      if (!isNaN(d)) miTotal += d;
      if (!isNaN(m)) minTotal += m;
    }

    const runTotalsLatest = {
      miles: miTotal,
      minutes: minTotal,
      pace: miTotal > 0 && minTotal > 0 ? paceFrom(miTotal, minTotal) : null,
    };

    // History (exclude latest)
    const historyAll = dates.slice(1).map((d) => ({
      date: d,
      tag: (byDate.get(d.toDateString()).find((x) => trim(x.category)) || {}).category || "",
      items: byDate.get(d.toDateString()),
    }));

    // Flat runs list (newest→oldest by date)
    const runsAll = dates.flatMap((d) =>
      byDate
        .get(d.toDateString())
        .filter(isRun)
        .map((r) => ({ ...r, date: d }))
    );

    return {
      latestDate,
      latestLifts,
      latestTag,
      latestRuns,
      runTotalsLatest,
      historyAll,
      runsAll,
    };
  }, [rows]);

  // Derived views
  const shownHistory = historyAll.slice(0, visibleSessions);
  const canShowMoreSessions = visibleSessions < historyAll.length;
  const shownRuns = runsAll.slice(0, visibleRuns);
  const canShowMoreRuns = visibleRuns < runsAll.length;

  return (
    <main className={styles.fitnessWrap}>
      <section className={styles.container}>
        {/* ✅ Fitbit status banner */}
        <FitbitStatusBanner />

        <header className={styles.hero}>
          <h1>My Training Log</h1>
          <p className={styles.sub}>Live from Google Sheets — lifts + runs.</p>
        </header>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>
              Latest Workout — {latestDate ? fmtDate(latestDate) : "—"}
            </h2>
            {latestTag ? <span className={styles.tag}>{latestTag}</span> : null}
          </div>

          {loading && <div className={styles.info}>Loading…</div>}
          {!!err && <div className={`${styles.info} ${styles.error}`}>{err}</div>}

          {!loading && !err && (
            <>
              <div className={styles.workoutLog}>
                {latestLifts.map((w, i) => (
                  <LiftCard key={i} item={w} />
                ))}
                {latestLifts.length === 0 && (
                  <div className={styles.info}>No lifts logged for the latest date.</div>
                )}
              </div>

              <div className={styles.runsLatest}>
                <h3 className={styles.sectionTitle}>Latest Run</h3>
                {latestRuns.length === 0 ? (
                  <div className={styles.info}>No runs logged for the latest date.</div>
                ) : (
                  <div className={styles.totals}>
                    {runTotalsLatest.miles > 0 && (
                      <span className={styles.chip}>{runTotalsLatest.miles.toFixed(2)} mi</span>
                    )}
                    {runTotalsLatest.minutes > 0 && (
                      <span className={styles.chip}>{formatDuration(runTotalsLatest.minutes)}</span>
                    )}
                    {runTotalsLatest.pace && (
                      <span className={styles.chip}>{runTotalsLatest.pace}</span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {!loading && !err && historyAll.length > 0 && (
          <section className={styles.history}>
            <div className={styles.historyBar}>
              <h3 className={styles.historyTitle}>Recent Workouts</h3>
              <div className={styles.historyActions}>
                {canShowMoreSessions ? (
                  <>
                    <button className={styles.btn} onClick={() => setVisibleSessions((n) => n + 7)}>
                      Show 7 more
                    </button>
                    <button className={styles.btn} onClick={() => setVisibleSessions(historyAll.length)}>
                      Show all
                    </button>
                  </>
                ) : historyAll.length > 7 ? (
                  <button className={styles.btn} onClick={() => setVisibleSessions(7)}>
                    Collapse
                  </button>
                ) : null}
              </div>
            </div>

            {shownHistory.map((h, i) => (
              <details key={i} className={styles.historyDay}>
                <summary>
                  <span>{fmtDate(h.date)}</span>
                  {h.tag ? <em className={styles.smallTag}>{h.tag}</em> : null}
                </summary>
                <div className={styles.historyItems}>
                  {h.items.map((it, j) =>
                    trim(it.miles) || trim(it.minutes) ? (
                      <RunCard key={j} item={it} compact />
                    ) : it.exercise ? (
                      <LiftCard key={j} item={it} compact />
                    ) : null
                  )}
                </div>
              </details>
            ))}
          </section>
        )}

        {!loading && !err && runsAll.length > 0 && (
          <section className={styles.runsHistory}>
            <div className={styles.historyBar}>
              <h3 className={styles.historyTitle}>Runs History</h3>
              <div className={styles.historyActions}>
                {canShowMoreRuns ? (
                  <>
                    <button className={styles.btn} onClick={() => setVisibleRuns((n) => n + 10)}>
                      Show 10 more
                    </button>
                    <button className={styles.btn} onClick={() => setVisibleRuns(runsAll.length)}>
                      Show all
                    </button>
                  </>
                ) : runsAll.length > 10 ? (
                  <button className={styles.btn} onClick={() => setVisibleRuns(10)}>
                    Collapse
                  </button>
                ) : null}
              </div>
            </div>

            <div className={styles.runsTable}>
              {shownRuns.map((r, i) => (
                <div key={i} className={styles.runsRow}>
                  <div className={`${styles.col} ${styles.date}`}>{fmtDate(r.date)}</div>
                  <div className={`${styles.col} ${styles.dist}`}>Distance: {r.miles || ""}</div>
                  <div className={`${styles.col} ${styles.time}`}>Time: {r.minutes || ""}</div>
                  <div className={`${styles.col} ${styles.notes}`}>Notes: {r.notes || ""}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className={styles.siteFoot}>© {new Date().getFullYear()} William Lopez</footer>
      </section>
    </main>
  );
}

/* ---------- Cards ---------- */
function LiftCard({ item, compact }) {
  return (
    <div className={`${styles.card} ${compact ? styles.compact : ""}`}>
      <div className={styles.head}>
        <h4 className={styles.title}>{item.exercise || "—"}</h4>
        {item.weight ? <span className={styles.pill}>{item.weight}</span> : null}
      </div>
      <div className={styles.kv}>
        <strong>Sets:</strong> {item.sets || "-"}
      </div>
      <div className={styles.kv}>
        <strong>Reps:</strong> {item.reps || "-"}
      </div>
    </div>
  );
}

function RunCard({ item, compact }) {
  const dist = item.miles ? parseFloat(item.miles.replace(/[^\d.]/g, "")) : null;
  const mins = item.minutes ? toMinutes(item.minutes) : null;
  const pace = dist && mins ? paceFrom(dist, mins) : null;

  return (
    <div className={`${styles.card} ${compact ? styles.compact : ""}`}>
      <div className={styles.kv}>
        <strong>Run:</strong> {dist ? `${dist} mi` : ""}
        {mins ? ` · ${formatDuration(mins)}` : ""}
        {pace ? ` · ${pace}` : ""}
      </div>
      {item.notes && (
        <div className={styles.kv} style={{ color: "#64748b" }}>
          {item.notes}
        </div>
      )}
    </div>
  );
}
