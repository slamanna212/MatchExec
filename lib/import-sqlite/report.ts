import type { ImportReport, Issue } from './types';

const MAX_STORED = 100;

/** The report persisted in system_status.report (lists are capped; counts stay exact). */
export function toStoredReport(r: ImportReport): Record<string, unknown> {
  return {
    ...r,
    repairs: r.repairs.slice(0, MAX_STORED),
    repairsTruncated: Math.max(0, r.repairs.length - MAX_STORED),
    issues: r.issues.slice(0, MAX_STORED),
    issuesTotal: r.issues.length,
  };
}

export function formatIssues(issues: Issue[], limit = 12): string {
  const byKey = new Map<string, number>();
  for (const i of issues) byKey.set(`${i.table}: ${i.kind}`, (byKey.get(`${i.table}: ${i.kind}`) ?? 0) + 1);
  const summary = [...byKey.entries()].map(([k, n]) => `  - ${k} x${n}`).join('\n');
  const examples = issues.slice(0, limit).map((i) => `  - ${i.table}${i.id ? ` [${i.id}]` : ''}${i.column ? `.${i.column}` : ''}: ${i.detail}`).join('\n');
  return `${summary}\n\nFirst ${Math.min(limit, issues.length)} of ${issues.length}:\n${examples}`;
}

export function preflightMessage(issues: Issue[]): string {
  return [
    `The legacy SQLite database cannot be imported as-is: ${issues.length} problem(s) found. Nothing was imported and the original file is untouched.`,
    formatIssues(issues),
    '',
    'To import anyway set MATCHEXEC_IMPORT_ALLOW_LOSSY=true: orphaned rows are skipped, invalid JSON / values become NULL, rows that',
    'cannot be repaired are skipped, and every repair is listed in the log and stored in system_status. Otherwise fix the data in a',
    'copy of the file (the offending tables and ids are listed above) and retry.',
  ].join('\n');
}
