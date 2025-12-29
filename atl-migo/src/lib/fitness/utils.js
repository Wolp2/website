export const trim = (s) => (s ?? "").toString().trim();

const norm = (s) =>
  trim(s)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, ""); // drop spaces/punct

export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export const splitLabel = (k) =>
  k === "push" ? "Push" : k === "pull" ? "Pull" : k === "legs" ? "Legs" : "Other";

export function toISODateLocal(d) {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

export function fmtDatePretty(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
}

export function parseMDY(str) {
  const t = trim(str);
  if (!t) return null;
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(t);
  if (!m) return null;
  let [, mm, dd, yy] = m.map(Number);
  if (yy < 100) yy += yy >= 70 ? 1900 : 2000;
  const d = new Date(yy, mm - 1, dd);
  return Number.isNaN(+d) ? null : d;
}

/**
 * Find column index by header aliases (fuzzy).
 * Matches: "DateFilled" == "datefilled" == "Date Filled"
 * Also allows partials: alias "date" matches "datefilled".
 */
export function col(headers, aliases) {
  const hs = (headers || []).map((h) => norm(h));

  for (const a of aliases) {
    const target = norm(a);

    // exact normalized match
    let idx = hs.indexOf(target);
    if (idx !== -1) return idx;

    // partial match
    idx = hs.findIndex((h) => h === target || h.startsWith(target) || h.includes(target));
    if (idx !== -1) return idx;
  }

  return -1;
}

/**
 * CSV parser (handles quotes)
 * Returns rows: string[][]
 */
export function parseCSV(text) {
  const rows = [];
  let i = 0;
  let cur = "";
  let row = [];
  let inQ = false;

  while (i < text.length) {
    const ch = text[i];

    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 2;
        } else {
          inQ = false;
          i += 1;
        }
      } else {
        cur += ch;
        i += 1;
      }
      continue;
    }

    if (ch === '"') {
      inQ = true;
      i += 1;
      continue;
    }

    if (ch === ",") {
      row.push(cur);
      cur = "";
      i += 1;
      continue;
    }

    if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      i += 1;
      continue;
    }

    if (ch === "\r") {
      i += 1;
      continue;
    }

    cur += ch;
    i += 1;
  }

  row.push(cur);
  rows.push(row);

  while (rows.length && rows[rows.length - 1].every((c) => trim(c) === "")) rows.pop();
  return rows.filter((r) => !r.every((c) => trim(c) === ""));
}

export function normalizeExerciseName(name) {
  let s = trim(name).toLowerCase();
  s = s.replace(/\s+/g, " ");
  s = s.replace(/benchpress/g, "bench press");
  s = s.replace(/\s+at home\b/g, "");
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function normalizeSplit(category, exerciseName) {
  const cat = trim(category).toLowerCase();
  const ex = trim(exerciseName).toLowerCase();

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
}

export function parseWeightLbs(w) {
  const n = parseFloat(String(w || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function bestWeightInHistory(hist) {
  let best = null;
  for (const it of hist || []) {
    const w = parseWeightLbs(it?.weight);
    if (w == null) continue;
    best = best == null ? w : Math.max(best, w);
  }
  return best;
}

/**
 * Build lifts grouped by ISO date from CSV text OR parsed rows.
 * CleanLog-friendly: prefers DateFilled/CategoryFilled when present.
 */
export function buildLiftsByISO(csvOrRows) {
  const rows = Array.isArray(csvOrRows) ? csvOrRows : parseCSV(String(csvOrRows || ""));
  if (!rows.length) return new Map();

  const headers = rows[0];
  const body = rows.slice(1);

  const cDate = col(headers, ["datefilled", "date", "day"]);
  const cCat = col(headers, ["categoryfilled", "category", "tag", "focus", "split", "type"]);
  const cEx = col(headers, ["exercise", "movement", "lift"]);
  const cWt = col(headers, ["weight", "load", "lbs"]);
  const cSets = col(headers, ["sets"]);
  const cReps = col(headers, ["reps"]);
  const cMi = col(headers, ["miles", "distance(mi)", "distance(mi)", "distance", "distance mi"]);
  const cMin = col(headers, ["minutes", "duration(min)", "duration", "time"]);
  const cNotes = col(headers, ["notes", "comments", "note"]);

  const entries = [];

  for (const r of body) {
    // Skip totally blank rows
    if (!r || r.every((c) => trim(c) === "")) continue;

    const dateCell = cDate >= 0 ? trim(r[cDate]) : "";
    const dt = parseMDY(dateCell);
    if (!dt) continue;

    const exerciseRaw = cEx >= 0 ? trim(r[cEx]) : "";
    if (!exerciseRaw) continue;

    // If you *want* cardio later, remove this block and create a cardio feed
    const miles = cMi >= 0 ? trim(r[cMi]) : "";
    const minutes = cMin >= 0 ? trim(r[cMin]) : "";
    if (miles || minutes) continue;

    const category = cCat >= 0 ? trim(r[cCat]) : "";
    const exercise = normalizeExerciseName(exerciseRaw);

    entries.push({
      date: dt,
      iso: toISODateLocal(dt),
      category,
      exercise,
      weight: cWt >= 0 ? trim(r[cWt]) : "",
      sets: cSets >= 0 ? trim(r[cSets]) : "",
      reps: cReps >= 0 ? trim(r[cReps]) : "",
      notes: cNotes >= 0 ? trim(r[cNotes]) : "",
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
}

export function buildExerciseIndex(liftsByISO) {
  const map = new Map();

  for (const [iso, lifts] of (liftsByISO || new Map()).entries()) {
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
}

export function groupExercisesBySplit(exerciseIndex, exerciseQuery = "") {
  const baseNames = Array.from((exerciseIndex || new Map()).keys());

  const q = trim(exerciseQuery).toLowerCase();
  const filtered = !q ? baseNames : baseNames.filter((n) => n.toLowerCase().includes(q));

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
}

export function buildTrendData(fitbitRange, metric) {
  if (!fitbitRange || !metric) return [];

  const series = fitbitRange?.[metric];
  if (!Array.isArray(series)) return [];

  return series
    .map((p) => {
      const date = p?.date ?? null;
      const v = Number(p?.value);
      return {
        date,
        value: Number.isFinite(v) ? v : null,
      };
    })
    .filter((p) => p.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function getExtremes(points, better = "higher") {
  const clean = (points ?? []).filter((p) => Number.isFinite(p?.value));
  if (!clean.length) return null;

  const minP = clean.reduce((a, b) => (b.value < a.value ? b : a));
  const maxP = clean.reduce((a, b) => (b.value > a.value ? b : a));

  const best = better === "lower" ? minP : maxP;
  const worst = better === "lower" ? maxP : minP;
  return { best, worst, min: minP, max: maxP };
}
