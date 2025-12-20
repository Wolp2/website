export const trim = (s) => (s ?? "").toString().trim();

/**
 * Minimal CSV parser (handles quoted cells, commas, newlines)
 * Returns: rows[][] (array of rows, each row array of cell strings)
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

  // drop trailing blank line if present
  if (rows.length && rows[rows.length - 1].every((c) => trim(c) === "")) rows.pop();
  return rows;
}

export function colIndex(headers, names) {
  const h = headers.map((x) => trim(x).toLowerCase());
  for (const n of names) {
    const idx = h.indexOf(n.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}
