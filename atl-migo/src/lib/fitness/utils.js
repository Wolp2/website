export const trim = (s) => (s ?? "").toString().trim();

const norm = (s) =>
  trim(s)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, ""); // drop spaces/punct

export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/** Normalized split labels for UI */
export const splitLabel = (k) =>
  k === "all" ? "All" :
  k === "push" ? "Push" :
  k === "pull" ? "Pull" :
  k === "legs" ? "Legs" : "Other";

/** Local ISO date (YYYY-MM-DD) using local time (not UTC). */
export function toISODateLocal(d) {
  const dt = new Date(d);
  const yr = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const da = String(dt.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

export function fmtDatePretty(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

/**
 * Parse M/D/Y or M-D-Y into a Date.
 * Returns null if invalid or out-of-range (prevents JS date rollover).
 */
export function parseMDY(str) {
  const t = trim(str);
  if (!t) return null;

  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(t);
  if (!m) return null;

  let mm = Number(m[1]);
  let dd = Number(m[2]);
  let yy = Number(m[3]);

  if (!Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(yy)) return null;
  if (yy < 100) yy += yy >= 70 ? 1900 : 2000;

  // quick range checks
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const dt = new Date(yy, mm - 1, dd);

  // prevent rollover (e.g. 2/31 -> 3/3)
  if (
    dt.getFullYear() !== yy ||
    dt.getMonth() !== mm - 1 ||
    dt.getDate() !== dd
  ) {
    return null;
  }

  return dt;
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
    idx = hs.findIndex((h) => h === target || h.startsWith(target));
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

/** Normalize split into push/pull/legs/other */
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
  ) return "legs";

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
  ) return "pull";

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
  ) return "push";

  return "other";
}

/** UI-friendly PPL label from a raw value (sheet) */
export function normalizePPLLabel(raw) {
  const s = trim(raw).toLowerCase();
  if (!s) return "Other";
  if (s.includes("push")) return "Push";
  if (s.includes("pull")) return "Pull";
  if (s.includes("leg")) return "Legs";
  if (s === "p") return "Push";
  if (s === "l") return "Legs";
  return "Other";
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
  const cMi = col(headers, ["miles", "distance(mi)", "distance", "distance mi"]);
  const cMin = col(headers, ["minutes", "duration(min)", "duration", "time"]);
  const cNotes = col(headers, ["notes", "comments", "note"]);

  const entries = [];

  for (const r of body) {
    if (!r || r.every((c) => trim(c) === "")) continue;

    const dateCell = cDate >= 0 ? trim(r[cDate]) : "";
    const dt = parseMDY(dateCell);
    if (!dt) continue;

    const exerciseRaw = cEx >= 0 ? trim(r[cEx]) : "";
    if (!exerciseRaw) continue;

    // If you want cardio later, remove this block and create a cardio feed.
    const miles = cMi >= 0 ? trim(r[cMi]) : "";
    const minutes = cMin >= 0 ? trim(r[cMin]) : "";
    if (miles || minutes) continue;

    const category = cCat >= 0 ? trim(r[cCat]) : "";
    const exercise = normalizeExerciseName(exerciseRaw);

    // ✅ split fields (raw + normalized display label)
    const splitKey = normalizeSplit(category, exercise); // push/pull/legs/other
    const split = splitLabel(splitKey); // Push/Pull/Legs/Other

    entries.push({
      date: dt,
      iso: toISODateLocal(dt),

      category,
      splitKey,
      split,

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
  if (!Array.isArray(fitbitRange) || !metric) return [];

  return fitbitRange
    .map((d) => {
      const date = d?.date ?? null;
      const v = Number(d?.[metric]);
      return { date, value: Number.isFinite(v) ? v : null };
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

// ===== Counterfactual / Insight Helpers =====
export function getInsightMode(now = new Date()) {
  const h = now.getHours();
  if (h < 10) return "reflection"; // morning
  if (h < 17) return "pacing"; // midday
  return "wrap"; // evening
}

export function mean(nums) {
  const xs = (nums || []).map(Number).filter((n) => Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function fmtInt(n) {
  return n == null || Number.isNaN(Number(n))
    ? "—"
    : Math.round(Number(n)).toLocaleString();
}

export function fmtMins(m) {
  if (m == null || !Number.isFinite(Number(m))) return "—";
  const n = Math.round(Number(m));
  const h = Math.floor(n / 60);
  const mm = n % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}
