export const trim = (s) => (s ?? "").toString().trim();

const norm = (s) =>
  trim(s)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, ""); // remove spaces, punctuation, parentheses, etc.

/**
 * Minimal CSV parser (handles quoted cells, commas, newlines)
 * Returns: string[][] where row 0 is headers
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
    } else if (ch === ",") {
      row.push(cur);
      cur = "";
      i += 1;
    } else if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      i += 1;
    } else if (ch === "\r") {
      i += 1;
    } else {
      cur += ch;
      i += 1;
    }
  }

  row.push(cur);
  rows.push(row);

  // Drop completely empty trailing rows
  while (rows.length && rows[rows.length - 1].every((c) => trim(c) === "")) rows.pop();

  // Also drop any fully-empty rows in the middle (rare, but happens)
  return rows.filter((r) => !r.every((c) => trim(c) === ""));
}

/**
 * Find a column index by header aliases.
 * Matches loosely: "Date Filled" == "datefilled" == "DateFilled"
 */
export function colIndex(headers, aliases) {
  const hs = headers.map((h) => norm(h));

  for (const a of aliases) {
    const target = norm(a);

    // Exact normalized match
    let idx = hs.indexOf(target);
    if (idx !== -1) return idx;

    // Contains match (so "datefilled" will match "datefillediso" etc.)
    idx = hs.findIndex((h) => h === target || h.startsWith(target) || h.includes(target));
    if (idx !== -1) return idx;
  }

  return -1;
}
