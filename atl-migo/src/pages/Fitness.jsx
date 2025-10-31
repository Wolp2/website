import { useEffect, useMemo, useState } from "react";

/** ======= Published CSV URL here ======= */
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZlEe5gpor6F0j6tRvsPrYhdrjOENGut0jUPdqTtyNYdefmRO72v1ogD9rLcUHN1HIJbMzkSfVNmRE/pub?gid=0&single=true&output=csv";

/* ========= Helpers ========= */
const trim = (s) => (s ?? "").toString().trim();

function parseMDY(str) {
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(trim(str));
  if (!m) return null;
  let [, mm, dd, yy] = m.map(Number);
  if (yy < 100) yy += 2000;
  return new Date(yy, mm - 1, dd);
}

function inferCategory(exercise) {
  const e = (exercise || "").toLowerCase();
  if (/(bench|shoulder|tricep|overhead|dip|push)/.test(e)) return "Push";
  if (/(row|pullup|curl|lat|bicep|hamstring|deadlift)/.test(e)) return "Pull";
  if (/(squat|leg|calf|lunge)/.test(e)) return "Legs";
  if (/(run|cardio|bike|treadmill|mile)/.test(e)) return "Cardio";
  return "Other";
}

function parseCSV(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  const rows = [];
  for (const raw of lines) {
    if (!raw) continue;
    const out = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];

      if (ch === '"') {
        // Toggle quotes, unless it's an escaped quote ("")
        if (inQuotes && raw[i + 1] === '"') {
          cur += '"';
          i++; // skip the escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    rows.push(out);
  }
  return rows;
}

function catClass(cat) {
  const c = (cat || "").toLowerCase();
  if (c === "push") return "cat-push";
  if (c === "pull") return "cat-pull";
  if (c === "legs") return "cat-legs";
  if (c === "cardio") return "cat-cardio";
  return "cat-other";
}

/** Count sets from a reps string like "10/10/10-8" */
function inferSetsFromReps(repsStr) {
  if (!repsStr) return "";
  const normalized = String(repsStr).replace(/-/g, "/").replace(/\s+/g, "");
  return normalized.split("/").filter(Boolean).length || "";
}

/** Summarize the day's run (distance/duration/notes) once per day */
function getRunSummary(day) {
  if (!day?.items?.length) return null;
  const runs = day.items.filter(
    (it) =>
      trim(it.distance) ||
      trim(it.duration) ||
      /run|treadmill/i.test(it.exercise)
  );
  if (!runs.length) return null;

  const totalMiles = runs.reduce((s, it) => s + (parseFloat(it.distance) || 0), 0);
  const totalMins = runs.reduce((s, it) => s + (parseFloat(it.duration) || 0), 0);
  const notes = [...new Set(runs.map((r) => r.notes).filter(Boolean))].join(" · ");

  return {
    miles: totalMiles ? Math.round(totalMiles * 100) / 100 : null,
    mins: totalMins || null,
    notes,
  };
}

/* ========= Page ========= */
export default function Fitness() {
  const [days, setDays] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch(SHEET_URL, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((csv) => {
        if (cancelled) return;
        const rows = parseCSV(csv);
        if (rows.length < 2) throw new Error("CSV has no data rows.");

        // normalize header
        const header = rows[0].map((h) =>
          h.toLowerCase().replace(/\s+/g, "")
        );
        const idx = (name) => header.indexOf(name);

        const iDate = idx("date");
        const iCat = idx("category"); // may be -1
        const iEx = idx("exercise");
        const iW = idx("weight");
        // NEW: look for "sets" and "reps"; keep backward-compat for "reps/sets"
        const iSets = idx("sets");
        const iReps = idx("reps");
        const iRepsSets = idx("reps/sets"); // legacy
        const iD = idx("distance(mi)");
        const iT = idx("duration(min)");
        const iNotes = idx("notes");

        if (iDate === -1 || iEx === -1) {
          throw new Error(`Missing required columns. Found: [${rows[0].join(", ")}]`);
        }

        let lastDate = "";
        let lastCat = "";
        const entries = [];

        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r.length || r.every((c) => !trim(c))) continue;

          let d = trim(r[iDate]);
          let c = iCat >= 0 ? trim(r[iCat]) : "";
          const ex = trim(r[iEx]);

          const weight = iW >= 0 ? trim(r[iW]) : "";
          // prefer new columns; fallback to legacy "reps/sets"
          let reps = iReps >= 0 ? trim(r[iReps]) : "";
          let sets = iSets >= 0 ? trim(r[iSets]) : "";
          if (!reps && iRepsSets >= 0) reps = trim(r[iRepsSets]);
          if (!sets && reps) sets = inferSetsFromReps(reps);

          const dist = iD >= 0 ? trim(r[iD]) : "";
          const dur = iT >= 0 ? trim(r[iT]) : "";
          const notes = iNotes >= 0 ? trim(r[iNotes]) : "";

          if (d) lastDate = d;
          else d = lastDate;

          if (c) lastCat = c;
          else c = lastCat || inferCategory(ex);

          if (!d || !ex) continue;

          entries.push({
            dateStr: d,
            dateObj: parseMDY(d) || new Date(d),
            category: c,
            exercise: ex,
            weight,
            sets,
            reps,
            distance: dist,
            duration: dur,
            notes,
          });
        }

        // group by date
        const byDate = {};
        entries.forEach((e) => {
          const key = e.dateStr;
          if (!byDate[key]) {
            byDate[key] = {
              dateStr: key,
              dateObj: e.dateObj,
              category: e.category,
              items: [],
            };
          }
          if (!byDate[key].category && e.category) byDate[key].category = e.category;
          byDate[key].items.push(e);
        });

        const daysSorted = Object.values(byDate).sort(
          (a, b) => b.dateObj - a.dateObj
        );
        setDays(daysSorted);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setErr(e.message || "Failed to load sheet.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Weekly mileage (last 7 days)
  const last7dMiles = useMemo(() => {
    if (!days) return 0;
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    let total = 0;
    days.forEach((d) => {
      if (d.dateObj >= weekAgo) {
        d.items.forEach((it) => {
          const miles = parseFloat(it.distance);
          if (!isNaN(miles)) total += miles;
        });
      }
    });
    return Math.round(total * 100) / 100;
  }, [days]);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
      <h1>My Training Log</h1>
      <p className="muted">Live from Google Sheets — lifts + runs.</p>

      {err ? (
        <div className="card" style={{ border: "2px solid #e35151" }}>
          <p><strong>Couldn’t load the workout sheet.</strong> {err}</p>
          <p>Checklist:<br/>
            1) Use Vite dev server (<code>npm run dev</code>)<br/>
            2) Publish your tab as CSV (URL has <code>gid=…&output=csv</code>)
          </p>
        </div>
      ) : !days ? (
        <div className="card"><p>Loading…</p></div>
      ) : (
        <>
          <LatestCard day={days[0]} />

          {/* Weekly mileage */}
          <section
            className="card"
            style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}
          >
            <span className="badge cat-cardio">Last 7 days</span>
            <div><strong>{last7dMiles} miles</strong> logged in runs</div>
          </section>

          <h2 style={{ marginTop: 28 }}>Workout History</h2>
          <History days={days} />
        </>
      )}

      {/* Inline styles for badges/cards/rows */}
      <style>{`
        .badge { display:inline-block; padding:4px 10px; border-radius:999px; font-size:.85rem; font-weight:700; color:#fff; letter-spacing:.2px; }
        .cat-push  { background:#e35151; }
        .cat-pull  { background:#3b82f6; }
        .cat-legs  { background:#10b981; }
        .cat-cardio{ background:#8b5cf6; }
        .cat-other { background:#6b7280; }

        .card { background:#fff; border-radius:12px; padding:16px; margin:16px 0; box-shadow:0 6px 18px rgba(0,0,0,.08); }
        .muted { color:#666; font-size:.9rem; }

        .list { margin:10px 0 0; padding:0; list-style:none; }
        .row {
          display:grid;
          grid-template-columns: 1fr 110px 70px 1fr; /* Exercise | Weight | Sets | Reps */
          gap:10px;
          padding:10px 0;
          border-bottom:1px solid #eee;
          align-items:center;
        }
        .row:last-child { border-bottom:none; }
        .hdr { font-weight:700; border-bottom:2px solid #ddd; }
        .tag { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background:#f3f4f6; border-radius:6px; padding:2px 8px; text-align:center; }
        .exercise { font-weight:600; }
        @media (max-width:600px){ .row { grid-template-columns: 1fr 1fr; } }
      `}</style>
    </main>
  );
}

/* ====== UI pieces ====== */

function LatestCard({ day }) {
  if (!day) return null;
  const badge = <span className={`badge ${catClass(day.category)}`}>{day.category || "Other"}</span>;
  const run = getRunSummary(day);

  return (
    <section className="card" style={{ border: "2px solid #10b981" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Latest Workout — {day.dateStr}</h2>
        {badge}
      </div>

      {run && (
        <div className="run-summary" style={{
          marginTop: 6, display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap"
        }}>
          <span className="badge cat-cardio">Run</span>
          <span className="tag">{run.miles ?? "-"} mi</span>
          <span className="tag">{run.mins ?? "-"} min</span>
          {run.notes && <span className="tag" title={run.notes}>Notes: {run.notes}</span>}
        </div>
      )}

      <ul className="list">
        <HeaderRow />
        {day.items.map((it, i) => (
          <Row key={i} item={it} />
        ))}
      </ul>
    </section>
  );
}

function History({ days }) {
  return (
    <section>
      {days.map((day) => {
        const run = getRunSummary(day);
        return (
          <article className="card" key={day.dateStr + (day.items?.length || 0)}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ margin: "0 0 6px" }}>{day.dateStr}</h3>
              <span className={`badge ${catClass(day.category)}`}>{day.category || "Other"}</span>
            </div>

            {run && (
              <div className="run-summary" style={{
                marginTop: 6, display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap"
              }}>
                <span className="badge cat-cardio">Run</span>
                <span className="tag">{run.miles ?? "-"} mi</span>
                <span className="tag">{run.mins ?? "-"} min</span>
                {run.notes && <span className="tag" title={run.notes}>Notes: {run.notes}</span>}
              </div>
            )}

            <ul className="list">
              <HeaderRow />
              {day.items.map((it, i) => (
                <Row key={i} item={it} />
              ))}
            </ul>
          </article>
        );
      })}
    </section>
  );
}

function HeaderRow() {
  return (
    <li className="row hdr">
      <span className="exercise">Exercise</span>
      <span className="tag">Weight</span>
      <span className="tag">Sets</span>
      <span className="tag">Reps</span>
    </li>
  );
}

function Row({ item }) {
  // Show lift metrics in rows; runs are summarized once per day above
  const setsDisplay = item.sets || (item.reps ? inferSetsFromReps(item.reps) : "-");
  const repsDisplay = item.reps || "-";

  return (
    <li className="row">
      <span className="exercise">{item.exercise}</span>
      <span className="tag">{item.weight || "-"}</span>
      <span className="tag">{setsDisplay}</span>
      <span className="tag">{repsDisplay}</span>
    </li>
  );
}
