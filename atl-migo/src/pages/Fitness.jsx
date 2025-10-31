import { useEffect, useMemo, useState } from "react";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZlEe5gpor6F0j6tRvsPrYhdrjOENGut0jUPdqTtyNYdefmRO72v1ogD9rLcUHN1HIJbMzkSfVNmRE/pub?gid=0&single=true&output=csv";

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

function paceFrom(distanceMiles, durationMin) {
  if (!distanceMiles || !durationMin) return null;
  const pace = durationMin / distanceMiles; // min per mile
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}/mi`;
}

export default function Fitness() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

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

  const { latestDate, latestItems, latestTag, history } = useMemo(() => {
    if (!rows.length) return { latestDate: null, latestItems: [], latestTag: "", history: [] };
    const headers = rows[0];
    const body = rows.slice(1);

    // Flexible header mapping
    const cDate = col(headers, ["date", "workout date", "day"]);
    const cTag = col(headers, ["tag", "focus", "split", "type", "bodypart"]);
    const cEx = col(headers, ["exercise", "movement"]);
    const cSets = col(headers, ["sets"]);
    const cReps = col(headers, ["reps"]);
    const cWt = col(headers, ["weight", "load", "lbs"]);
    // Optional cardio columns if you keep them in the sheet
    const cDist = col(headers, ["distance", "miles", "mi"]);
    const cTime = col(headers, ["time", "duration", "mins", "minutes"]);

    // ---- Forward-fill Date & Tag as we scan down the sheet ----
    let curDate = null;
    let curTag = "";
    const entries = [];
    for (const r of body) {
      const dateCell = trim(r[cDate] ?? "");
      const tagCell = trim(r[cTag] ?? "");
      if (dateCell) curDate = parseMDY(dateCell) ?? curDate; // keep last valid date
      if (tagCell) curTag = tagCell;

      if (!curDate) continue; // skip pre-header junk

      const ex = trim(r[cEx] ?? "");
      const sets = trim(r[cSets] ?? "");
      const reps = trim(r[cReps] ?? "");
      const weight = trim(r[cWt] ?? "");
      const distance = trim(r[cDist] ?? "");
      const duration = trim(r[cTime] ?? "");

      if (!(ex || reps || weight || distance || duration)) continue;

      entries.push({
        date: curDate,
        tag: curTag,
        exercise: ex,
        sets,
        reps,
        weight,
        distance,
        duration,
      });
    }

    if (!entries.length) return { latestDate: null, latestItems: [], latestTag: "", history: [] };

    // Group by date
    const byDate = new Map();
    for (const e of entries) {
      const key = e.date.toDateString();
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(e);
    }

    // Find latest date
    const allDates = [...byDate.values()].map((list) => list[0].date);
    allDates.sort((a, b) => b - a);
    const latestDate = allDates[0];

    const latestItems = byDate.get(latestDate.toDateString()) ?? [];
    const latestTag = latestItems.find((x) => x.tag)?.tag ?? "";

    // Build recent history (last 7 sessions excluding latest)
    const historyDates = allDates.slice(1, 8);
    const history = historyDates.map((d) => ({
      date: d,
      tag: (byDate.get(d.toDateString()).find((x) => x.tag) || {}).tag || "",
      items: byDate.get(d.toDateString()),
    }));

    return { latestDate, latestItems, latestTag, history };
  }, [rows]);

  return (
    <main className="fitness-wrap">
      <section className="container">
        <header className="hero">
          <h1>My Training Log</h1>
          <p className="sub">Live from Google Sheets — lifts + runs.</p>
        </header>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">
              Latest Workout — {latestDate ? fmtDate(latestDate) : "—"}
            </h2>
            {latestTag ? <span className="tag">{latestTag}</span> : null}
          </div>

          {loading && <div className="info">Loading latest session…</div>}
          {!!err && <div className="info error">{err}</div>}

          {!loading && !err && (
            <div className="workout-log">
              {latestItems.map((w, i) => (
                <ExerciseOrRun key={i} item={w} />
              ))}
              {latestItems.length === 0 && (
                <div className="info">No entries for the latest date.</div>
              )}
            </div>
          )}
        </section>

        {/* ---- Recent history ---- */}
        {!loading && !err && history.length > 0 && (
          <section className="history">
            <h3 className="history-title">Recent Workouts</h3>
            {history.map((h, i) => (
              <details key={i} className="history-day">
                <summary>
                  <span>{fmtDate(h.date)}</span>
                  {h.tag ? <em className="small-tag">{h.tag}</em> : null}
                </summary>
                <div className="history-items">
                  {h.items.map((it, j) => (
                    <ExerciseOrRun key={j} item={it} compact />
                  ))}
                </div>
              </details>
            ))}
          </section>
        )}

        <footer className="site-foot">© {new Date().getFullYear()} William Lopez</footer>
      </section>

      <style>{`
        :root {
          --bg: #f6f7fb;
          --text: #0f172a;
          --muted: #64748b;
          --card: #ffffff;
          --line: #e5e7eb;
          --accent: #16a34a;
          --accent2: #22c55e;
        }
        .fitness-wrap { background: var(--bg); min-height: 100dvh; color: var(--text); }
        .container { max-width: 860px; margin: 0 auto; padding: 1rem clamp(1rem, 3vw, 1.25rem) 2rem; }

        .hero h1 { font-size: clamp(1.7rem, 4vw, 2.4rem); margin: 0; font-weight: 800; letter-spacing: -0.02em; }
        .sub { margin: .2rem 0 1rem; color: var(--muted); }

        .panel { background: var(--card); border: 1px solid #d1fae5; border-radius: 16px; padding: 1rem; box-shadow: 0 2px 6px rgba(0,0,0,.04); }
        .panel-head { display:flex; align-items:center; gap:.6rem; margin-bottom:.75rem; }
        .panel-title { margin:0; font-size:1.1rem; font-weight:700; }
        .tag { background: linear-gradient(135deg, var(--accent2), var(--accent)); color:#fff; padding:.2rem .6rem; border-radius:999px; font-size:.8rem; }

        .workout-log { display:flex; flex-direction:column; gap:.8rem; }

        .card { background:#fff; border:1px solid var(--line); border-radius:14px; padding:.85rem; }
        .card.compact { padding:.7rem; }
        .head { display:flex; justify-content:space-between; align-items:baseline; gap:.5rem; padding-bottom:.35rem; margin-bottom:.45rem; border-bottom:1px solid #eee; }
        .title { font-size:1.05rem; font-weight:700; margin:0; }
        .pill { background:#e6f6ee; color:#256d40; padding:.2rem .55rem; border-radius:8px; font-size:.9rem; white-space:nowrap; }

        .kv { margin:.22rem 0; font-size:.95rem; }
        .muted { color: var(--muted); }

        .run-line { display:flex; flex-wrap:wrap; gap:.5rem 1rem; font-size:.95rem; }
        .run-chip { background:#eef2ff; border:1px solid #e5e7eb; padding:.15rem .5rem; border-radius:8px; }

        .info { background:#f9fafb; border:1px solid var(--line); border-radius:12px; padding:.8rem 1rem; }
        .info.error { border-color:#fecaca; background:#fff1f2; }

        .history { margin-top:1rem; }
        .history-title { margin:.2rem 0 .6rem; font-size:1.05rem; font-weight:700; color:#0f172a; }
        .history-day { background:#fff; border:1px solid var(--line); border-radius:12px; margin-bottom:.6rem; padding:.2rem .6rem; }
        .history-day summary { cursor:pointer; display:flex; align-items:center; gap:.5rem; padding:.5rem 0; list-style:none; }
        .history-day summary::-webkit-details-marker { display:none; }
        .small-tag { color: var(--muted); font-style:normal; font-size:.9rem; }

        .history-items { padding: .2rem 0 .6rem; display:flex; flex-direction:column; gap:.5rem; }

        .site-foot { text-align:center; color:var(--muted); margin-top:1.25rem; font-size:.9rem; }
      `}</style>
    </main>
  );
}

/* ---------- Small renderer that shows either a Lift card or a Run card ---------- */
function ExerciseOrRun({ item, compact }) {
  const isRun =
    /run|jog|treadmill|mile|miles|cardio/i.test(item.exercise || "") ||
    item.distance ||
    item.duration ||
    /run|cardio/i.test(item.tag || "");

  if (isRun) {
    // try to parse distance/time for pace
    const dist = parseFloat((item.distance || "").replace(/[^\d.]/g, "")) || null;
    const mins = parseFloat((item.duration || "").replace(/[^\d.]/g, "")) || null;
    const pace = paceFrom(dist, mins);

    return (
      <div className={`card ${compact ? "compact" : ""}`}>
        <div className="head">
          <h4 className="title">{item.exercise || "Run"}</h4>
        </div>
        <div className="run-line">
          {dist != null && <span className="run-chip">{dist} mi</span>}
          {mins != null && <span className="run-chip">{mins} min</span>}
          {pace && <span className="run-chip">{pace}</span>}
          {!dist && !mins && item.reps && <span className="muted">{item.reps}</span>}
        </div>
      </div>
    );
  }

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
