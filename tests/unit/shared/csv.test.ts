import { describe, expect, it } from 'vitest';
import { csvCell, parseCsv, parseCsvRecords } from '../../../shared/csv';

describe('parseCsv', () => {
  it('reads a header and rows, trimming headers and padding short rows', () => {
    const r = parseCsv(' team , player\nA,Ava\nB\n');
    expect(r).toEqual({ headers: ['team', 'player'], rows: [{ line: 2, cells: ['A', 'Ava'] }, { line: 3, cells: ['B', ''] }] });
  });

  it('handles quotes, escaped quotes, embedded delimiters and newlines', () => {
    const r = parseCsv('name,note\n"Owls, Night","say ""hi""\nthere"\nX,y\n')!;
    expect(r.rows[0].cells).toEqual(['Owls, Night', 'say "hi"\nthere']);
    expect(r.rows[1]).toEqual({ line: 4, cells: ['X', 'y'] });
  });

  it('strips a BOM, accepts CRLF and skips blank lines', () => {
    const r = parseCsv('﻿a,b\r\n1,2\r\n\r\n,\r\n3,4')!;
    expect(r.headers).toEqual(['a', 'b']);
    expect(r.rows.map((x) => x.cells)).toEqual([['1', '2'], ['3', '4']]);
  });

  it('sniffs semicolon and tab delimiters', () => {
    expect(parseCsv('a;b\n1;2,5\n')!.rows[0].cells).toEqual(['1', '2,5']);
    expect(parseCsv('a\tb\n1\t2\n')!.rows[0].cells).toEqual(['1', '2']);
  });

  it('returns null for an empty file and keeps a trailing empty field', () => {
    expect(parseCsv('')).toBeNull();
    expect(parseCsv('\n\n')).toBeNull();
    expect(parseCsvRecords('a,b,\n', ',')[0].cells).toEqual(['a', 'b', '']);
  });

  it('csvCell quotes only when needed', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "x"')).toBe('"say ""x"""');
    expect(csvCell(null)).toBe('');
    expect(csvCell(3)).toBe('3');
  });
});
