/**
 * Small RFC 4180 CSV reader (no dependency): quoted fields with embedded delimiters, quotes ("") and newlines, CRLF or LF,
 * a leading UTF-8 BOM. The delimiter is sniffed from the first line (comma, semicolon or tab; comma when unsure), so a
 * spreadsheet exported with a European locale reads the same.
 */

export interface ParsedCsv {
  headers: string[];
  /** Data rows (without the header), each padded / trimmed to `headers.length`. Fully blank lines are dropped. */
  rows: Array<{ line: number; cells: string[] }>;
}

const DELIMITERS = [',', ';', '\t'] as const;

function sniffDelimiter(text: string): string {
  let firstLine = '';
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    firstLine += ch;
  }
  let best = ',';
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

/** Splits CSV text into records. Each record carries the 1-based line it starts on (as a spreadsheet shows it). */
export function parseCsvRecords(input: string, delimiter?: string): Array<{ line: number; cells: string[] }> {
  const text = input.startsWith('﻿') ? input.slice(1) : input;
  const delim = delimiter ?? sniffDelimiter(text);
  const records: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const endField = () => { cells.push(field); field = ''; };
  const endRecord = () => {
    endField();
    records.push({ line: recordLine, cells });
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') inQuotes = true;
    else if (ch === delim) endField();
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else field += ch;
  }
  if (field !== '' || cells.length > 0) endRecord();
  return records;
}

/** Header row + data rows. Headers are trimmed; blank data lines are skipped. Returns `null` for an empty file. */
export function parseCsv(input: string, delimiter?: string): ParsedCsv | null {
  const records = parseCsvRecords(input, delimiter).filter((r) => r.cells.some((c) => c.trim() !== ''));
  if (records.length === 0) return null;
  const [head, ...rest] = records;
  const headers = head.cells.map((h) => h.trim());
  const rows = rest.map((r) => {
    const padded = r.cells.slice(0, headers.length);
    while (padded.length < headers.length) padded.push('');
    return { line: r.line, cells: padded };
  });
  return { headers, rows };
}

/** Quotes one value for CSV output when it needs it. */
export function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n;\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
