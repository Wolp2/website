import { useEffect, useMemo, useState } from "react";

/** ===== CSV ===== */
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZlEe5gpor6F0j6tRvsPrYhdrjOENGut0jUPdqTtyNYdefmRO72v1ogD9rLcUHN1HIJbMzkSfVNmRE/pub?gid=0&single=true&output=csv";

/* ========= Helpers ========= */
const trim = (s) => (s ?? "").toString().trim();

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

  // pure number => already minutes (supports "29" or "29.5")
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);

  // mm:ss or hh:mm:ss
  if (s.includes(":")) {
    const parts = s.split(":").map((x) => parseFloat(x) || 0);
    if (parts.length === 3) {
      const [hh, mm, ss] = parts;
      return hh * 60 + mm + ss / 60;
    } else {
      const [mm, ss] = parts;
      return mm + ss / 60;
    }
  }

  // words: "29 minutes and 20 seconds", "1h 5m 30s", etc.
  const m = s.match(
    /(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?)?/
  );
  if (m) {
    const h = parseFloat(m[1] || 0);
    const min = parseFloat(m[2] || 0);
    const sec = parseFloat(m[3] || 0);
    if (h || min || sec) return h * 60 + min + sec / 60;
  }

  // last resort: strip to digits/colons and try again
  const cleaned = s.replace(/[^\d:.]/g, "");
  if (cleaned.includes(":")) return toMinutes(cleaned);
  if (/^\d+(\.\d+)?$/.test(cleaned)) return parseFloat(cleaned);

  return 0;
};

const formatDuration = (minutesFloat) => {
  const totalSeconds = Math.round(minutesFloat * 60);
  let mm = Math.floor(totalSeconds / 60);
  let ss = totalSeconds % 60;
  if (ss === 60) { mm += 1; ss = 0; }
  return ss ? `${mm}:${String(ss).padStart(2, "0")}` : `${mm} min`;
};

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
const col = (headers, names) => {
  const h = headers.map((x) => trim(x).toLowerCase());
  for (const n of names) {
    const i = h.indexOf(n.toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
};

/* ========= Component ========= */
export default function Fitness() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [visibleSessions, setVisibleSessions] = useState(7);
  const [visibleRuns, setVisibleRuns] = useState(10);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const res = await fetch(SHEET_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const txt = await res.text();
        if (!alive) return;
        setRows(parseCSV(txt));
      } catch (e) {
        console.error(e);
        if (alive) setErr("Could not load training log.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => void (alive = false);
  }, []);

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

    // Identify columns
    const cDate = col(headers, ["date"]);
    const cCat = col(headers, ["category", "tag", "focus", "split", "type"]);
    const cEx = col(headers, ["exercise"]);
    const cWt = col(headers, ["weight", "load", "lbs"]);
    const cSets = col(headers, ["sets"]);
    const cReps = col(headers, ["reps"]);
    const cMi = col(headers, ["distance (mi)", "distance mi", "miles"]);
    const cMin = col(headers, ["duration(min)", "duration (min)", "distance min", "minutes"]);
    const cNotes = col(headers, ["notes", "comments", "note"]);

    // Forward-fill Date/Category rows (blank under a date)
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

      // keep rows that have any content
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

    // Sort dates newest→oldest
    const dates = [...byDate.values()].map((v) => v[0].date).sort((a, b) => b - a);

    const latestDate = dates[0];
    const latestRows = byDate.get(latestDate.toDateString()) ?? [];

    const latestTag =
      latestRows.find((x) => trim(x.category))?.category ||
      latestRows.find((x) => trim(x.exercise))?.category ||
      "";

    // Split lifts vs runs (runs have miles or minutes filled)
    const isRun = (r) =>
      (trim(r.miles) && trim(r.miles) !== "0") || (trim(r.minutes) && trim(r.minutes) !== "0");

    const latestRuns = latestRows.filter(isRun);
    const latestLifts = latestRows.filter((r) => !isRun(r) && r.exercise);

    // Totals for latest day (runs only)
    let miTotal = 0,
      minTotal = 0;
    for (const r of latestRuns) {
      const d = parseFloat(r.miles.replace(/[^\d.]/g, ""));
      const m = toMinutes(r.minutes);               // <-- changed
      if (!isNaN(d)) miTotal += d;
      if (!isNaN(m)) minTotal += m;
    }
    const runTotalsLatest = {
      miles: miTotal,
      minutes: minTotal,
      pace: miTotal > 0 && minTotal > 0 ? paceFrom(miTotal, minTotal) : null,
    };

    // Session history (exclude latest)
    const historyAll = dates.slice(1).map((d) => ({
      date: d,
      tag:
        (byDate.get(d.toDateString()).find((x) => trim(x.category)) || {}).category || "",
      items: byDate.get(d.toDateString()),
    }));

    // Flat runs list newest→oldest (for Runs History)
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

  const shownHistory = historyAll.slice(0, visibleSessions);
  const canShowMoreSessions = visibleSessions < historyAll.length;

  const shownRuns = runsAll.slice(0, visibleRuns);
  const canShowMoreRuns = visibleRuns < runsAll.length;

  return (
    <main className="fitness-wrap">
      <section className="container">
        <header className="hero">
          <h1>My Training Log</h1>
          <p className="sub">Live from Google Sheets — lifts + runs.</p>
        </header>

        {/* ===== Latest Workout (lifts only) ===== */}
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">
              Latest Workout — {latestDate ? fmtDate(latestDate) : "—"}
            </h2>
            {latestTag ? <span className="tag">{latestTag}</span> : null}
          </div>

          {loading && <div className="info">Loading…</div>}
          {!!err && <div className="info error">{err}</div>}

          {!loading && !err && (
            <>
              <div className="workout-log">
                {latestLifts.map((w, i) => (
                  <LiftCard key={i} item={w} />
                ))}
                {latestLifts.length === 0 && (
                  <div className="info">No lifts logged for the latest date.</div>
                )}
              </div>

              {/* ===== Latest Run (separate) ===== */}
              <div className="runs-latest">
                <h3 className="section-title">Latest Run</h3>
                {latestRuns.length === 0 ? (
                  <div className="info">No runs logged for the latest date.</div>
                ) : (
                  <>
                    <div className="totals">
                      {runTotalsLatest.miles > 0 && (
                        <span className="chip">{runTotalsLatest.miles.toFixed(2)} mi</span>
                      )}
                      {runTotalsLatest.minutes > 0 && (
                        <span className="chip">{formatDuration(runTotalsLatest.minutes)}</span>
                      )}
                      {runTotalsLatest.pace && (
                        <span className="chip">{runTotalsLatest.pace}</span>
                      )}
                    </div>
                    <div className="run-list">
                      {latestRuns.map((r, i) => (
                        <div key={i} className="run-row">
                          <span className="run-meta">
                            {parseFloat(r.miles || 0) || ""}{r.miles ? " mi" : ""}
                            {r.minutes ? ` · ${formatDuration(toMinutes(r.minutes))}` : ""}
                          </span>
                          {r.notes && <span className="run-notes">{r.notes}</span>}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </section>

        {/* ===== Session History ===== */}
        {!loading && !err && historyAll.length > 0 && (
          <section className="history">
            <div className="history-bar">
              <h3 className="history-title">Recent Workouts</h3>
              <div className="history-actions">
                {canShowMoreSessions ? (
                  <>
                    <button className="btn" onClick={() => setVisibleSessions((n) => n + 7)}>
                      Show 7 more
                    </button>
                    <button className="btn" onClick={() => setVisibleSessions(historyAll.length)}>
                      Show all
                    </button>
                  </>
                ) : historyAll.length > 7 ? (
                  <button className="btn" onClick={() => setVisibleSessions(7)}>
                    Collapse
                  </button>
                ) : null}
              </div>
            </div>

            {shownHistory.map((h, i) => (
              <details key={i} className="history-day">
                <summary>
                  <span>{fmtDate(h.date)}</span>
                  {h.tag ? <em className="small-tag">{h.tag}</em> : null}
                </summary>
                <div className="history-items">
                  {h.items.map((it, j) =>
                    (trim(it.miles) || trim(it.minutes)) ? (
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

        {/* ===== Runs History (flat list) ===== */}
        {!loading && !err && runsAll.length > 0 && (
          <section className="runs-history">
            <div className="history-bar">
              <h3 className="history-title">Runs History</h3>
              <div className="history-actions">
                {canShowMoreRuns ? (
                  <>
                    <button className="btn" onClick={() => setVisibleRuns((n) => n + 10)}>
                      Show 10 more
                    </button>
                    <button className="btn" onClick={() => setVisibleRuns(runsAll.length)}>
                      Show all
                    </button>
                  </>
                ) : runsAll.length > 10 ? (
                  <button className="btn" onClick={() => setVisibleRuns(10)}>
                    Collapse
                  </button>
                ) : null}
              </div>
            </div>

            <div className="runs-table">
              {shownRuns.map((r, i) => (
                <div key={i} className="runs-row">
                  <div className="col date">{fmtDate(r.date)}</div>
                  <div className="col dist">Distance: {r.miles || ""}</div>
                  <div className="col time">Time: {r.minutes || ""}</div>
                  <div className="col notes">Notes: {r.notes || ""}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="site-foot">© {new Date().getFullYear()} William Lopez</footer>
      </section>

      {/* ===== Styles ===== */}
      <style>{`
        :root { --bg:#f6f7fb; --text:#0f172a; --muted:#64748b; --card:#fff; --line:#e5e7eb; --accent:#16a34a; --accent2:#22c55e; }
        .fitness-wrap { background:var(--bg); min-height:100dvh; color:var(--text); }
        .container { max-width:860px; margin:0 auto; padding:1rem clamp(1rem,3vw,1.25rem) 2rem; }

        .hero h1 { font-size:clamp(1.7rem,4vw,2.4rem); margin:0; font-weight:800; letter-spacing:-.02em; }
        .sub { margin:.2rem 0 1rem; color:var(--muted); }

        .panel { background:var(--card); border:1px solid #d1fae5; border-radius:16px; padding:1rem; box-shadow:0 2px 6px rgba(0,0,0,.04); }
        .panel-head { display:flex; align-items:center; gap:.6rem; margin-bottom:.6rem; }
        .panel-title { margin:0; font-size:1.1rem; font-weight:700; }
        .tag { background:linear-gradient(135deg,var(--accent2),var(--accent)); color:#fff; padding:.2rem .6rem; border-radius:999px; font-size:.8rem; }

        .workout-log { display:flex; flex-direction:column; gap:.8rem; }
        .card { background:#fff; border:1px solid var(--line); border-radius:14px; padding:.85rem; }
        .card.compact { padding:.7rem; }
        .head { display:flex; justify-content:space-between; align-items:baseline; gap:.5rem; padding-bottom:.35rem; margin-bottom:.45rem; border-bottom:1px solid #eee; }
        .title { margin:0; font-size:1.05rem; font-weight:700; }
        .pill { background:#e6f6ee; color:#256d40; padding:.2rem .55rem; border-radius:8px; font-size:.9rem; white-space:nowrap; }
        .kv { margin:.22rem 0; font-size:.95rem; }

        .runs-latest { margin-top:1rem; }
        .section-title { font-size:1.05rem; margin:.2rem 0 .5rem; font-weight:700; }
        .totals { display:flex; gap:.5rem; flex-wrap:wrap; margin-bottom:.6rem; }
        .chip { background:#eef2ff; border:1px solid var(--line); padding:.2rem .55rem; border-radius:999px; font-size:.9rem; }
        .run-list { display:flex; flex-direction:column; gap:.4rem; }
        .run-row { background:#fff; border:1px dashed var(--line); border-radius:10px; padding:.6rem .7rem; display:flex; flex-direction:column; gap:.25rem; }
        .run-meta { font-size:.95rem; }
        .run-notes { color:var(--muted); font-size:.9rem; }

        .info { background:#f9fafb; border:1px solid var(--line); border-radius:12px; padding:.8rem 1rem; }
        .info.error { border-color:#fecaca; background:#fff1f2; }

        .history { margin-top:1rem; }
        .history-bar { display:flex; justify-content:space-between; align-items:center; gap:.6rem; margin-bottom:.5rem; }
        .history-title { margin:0; font-size:1.05rem; font-weight:700; }
        .history-actions { display:flex; gap:.4rem; }
        .btn { appearance:none; border:1px solid var(--line); background:#fff; border-radius:8px; padding:.35rem .6rem; font-size:.9rem; }
        .btn:active { transform: translateY(1px); }

        .history-day { background:#fff; border:1px solid var(--line); border-radius:12px; margin-bottom:.6rem; padding:.2rem .6rem; }
        .history-day summary { cursor:pointer; display:flex; align-items:center; gap:.5rem; padding:.5rem 0; list-style:none; }
        .history-day summary::-webkit-details-marker { display:none; }
        .small-tag { color:var(--muted); font-style:normal; font-size:.9rem; }
        .history-items { padding:.2rem 0 .6rem; display:flex; flex-direction:column; gap:.5rem; }

        .runs-history { margin-top:1rem; }
        .runs-table { display:flex; flex-direction:column; gap:.5rem; }
        .runs-row { display:grid; grid-template-columns: 110px 90px 100px 1fr; gap:.5rem; background:#fff; border:1px solid var(--line); border-radius:10px; padding:.55rem .7rem; }
        .runs-row .col { font-size:.95rem; }
        .runs-row .notes { color:var(--muted); }
        @media (max-width: 480px){
          .runs-row { grid-template-columns: 95px 80px 90px 1fr; }
        }

        .site-foot { text-align:center; color:var(--muted); margin-top:1.25rem; font-size:.9rem; }
      `}</style>
    </main>
  );
}

/* ---------- Cards ---------- */
function LiftCard({ item, compact }) {
  return (
    <div className={`card ${compact ? "compact" : ""}`}>
      <div className="head">
        <h4 className="title">{item.exercise || "—"}</h4>
        {item.weight ? <span className="pill">{item.weight}</span> : null}
      </div>
      <div className="kv"><strong>Sets:</strong> {item.sets || "-"}</div>
      <div className="kv"><strong>Reps:</strong> {item.reps || "-"}</div>
    </div>
  );
}
function RunCard({ item, compact }) {
  const dist = item.miles ? parseFloat(item.miles.replace(/[^\d.]/g, "")) : null;
  const mins = item.minutes ? toMinutes(item.minutes) : null; // <-- changed
  const pace = dist && mins ? paceFrom(dist, mins) : null;
  return (
    <div className={`card ${compact ? "compact" : ""}`}>
      <div className="kv">
        <strong>Run:</strong> {dist ? `${dist} mi` : ""}{mins ? ` · ${formatDuration(mins)}` : ""}{pace ? ` · ${pace}` : ""}
      </div>
      {item.notes && <div className="kv" style={{color:"#64748b"}}>{item.notes}</div>}
    </div>
  );
}
