import { describe, expect, it } from 'vitest';
import { importProgress } from '../../../src/server/routes/system';
import { formatIssues, preflightMessage, toStoredReport } from '../../../lib/import-sqlite/report';
import type { ImportReport, Issue } from '../../../lib/import-sqlite/types';

describe('importProgress (loading screen DTO, plan 5.4)', () => {
  it('exposes the table being imported', () => {
    expect(importProgress('importing', { importing: { step: 'tables', table: 'match_games' } })).toEqual({ table: 'match_games' });
    expect(importProgress('importing', { importing: { step: 'copy', table: null } })).toEqual({});
    expect(importProgress('ready', { importing: { table: 'x' } })).toEqual({});
    expect(importProgress('importing', null)).toEqual({});
  });
  it('summarises a failed import', () => {
    const dto = importProgress('error', {
      error: 'The legacy SQLite database cannot be imported as-is: 3 problem(s)\nsecond line',
      issues: Array.from({ length: 12 }, (_, i) => ({ table: 'matches', id: `m${i}`, detail: 'bad', extra: 1 })),
      issuesTotal: 30, repairs: [1, 2], repairsTruncated: 5,
    });
    expect(dto.error?.message).toBe('The legacy SQLite database cannot be imported as-is: 3 problem(s)');
    expect(dto.error?.issues).toHaveLength(10);
    expect(dto.error?.issues[0]).toEqual({ table: 'matches', id: 'm0', detail: 'bad' });
    expect(dto.error).toMatchObject({ issuesTotal: 30, repairs: 7 });
    expect(importProgress('error', { something: 'else' })).toEqual({});
  });
});

describe('report helpers', () => {
  const issues: Issue[] = Array.from({ length: 150 }, (_, i) => ({ kind: 'orphan', table: i % 2 ? 'a' : 'b', id: `${i}`, column: 'x', detail: `d${i}`, lossyAction: 'row skipped' }));
  it('caps the stored lists but keeps exact totals', () => {
    const stored = toStoredReport({ startedAt: '', source: '', lossy: false, legacyMigrationsApplied: [], tables: {}, blobs: { imported: 0, skipped: 0, bytes: 0 }, repairs: [], issues } as ImportReport);
    expect((stored.issues as unknown[]).length).toBe(100);
    expect(stored.issuesTotal).toBe(150);
  });
  it('writes an actionable preflight message', () => {
    const msg = preflightMessage(issues);
    expect(msg).toContain('150 problem(s) found');
    expect(msg).toContain('a: orphan x75');
    expect(msg).toContain('MATCHEXEC_IMPORT_ALLOW_LOSSY=true');
    expect(formatIssues(issues, 2)).toContain('First 2 of 150');
  });
});
