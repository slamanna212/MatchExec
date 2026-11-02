import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkUploads, classifyUpload, contentTypeFor, defaultUploadDirs, listUploads } from '../../../lib/import-sqlite/uploads';
import { MAX_BLOB_BYTES } from '../../../lib/storage';
import type { Issue, Repair } from '../../../lib/import-sqlite/types';

const dirs: string[] = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }); });
function tree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mx-uploads-'));
  dirs.push(root);
  for (const [rel, data] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), data);
  }
  return root;
}

describe('listUploads', () => {
  it('keeps the public URL path (relative path below public/uploads), skips dotfiles and missing directories', () => {
    const root = tree({ 'events/a.png': 'x', 'scorecards/m1/b.jpg': 'xx', 'stats/m1/team.png': 'x', '.hidden': 'x', 'events/.DS_Store': 'x' });
    const files = listUploads([root, path.join(root, 'nope')]);
    expect(files.map((f) => f.urlPath)).toEqual(['/uploads/events/a.png', '/uploads/scorecards/m1/b.jpg', '/uploads/stats/m1/team.png']);
    expect(files[1].size).toBe(2);
  });
  it('first directory wins on duplicate paths', () => {
    const a = tree({ 'events/a.png': 'first' });
    const b = tree({ 'events/a.png': 'second', 'events/b.png': 'x' });
    const files = listUploads([a, b]);
    expect(fs.readFileSync(files.find((f) => f.urlPath === '/uploads/events/a.png')!.file, 'utf8')).toBe('first');
    expect(files).toHaveLength(2);
  });
  it('default directories: MATCHEXEC_UPLOADS_DIR, <cwd>/public/uploads and the one next to the legacy data directory', () => {
    const root = tree({ 'public/uploads/events/a.png': 'x' });
    const db = path.join(root, 'app_data', 'data', 'matchexec.db');
    expect(defaultUploadDirs({}, db)).toContain(path.join(root, 'public', 'uploads'));
    const custom = tree({ 'events/x.png': 'x' });
    expect(defaultUploadDirs({ MATCHEXEC_UPLOADS_DIR: custom })[0]).toBe(custom);
  });
});

describe('classifyUpload / contentTypeFor', () => {
  it('assigns kind and owner like the writers do', () => {
    expect(classifyUpload('/uploads/scorecards/match_1/x.png')).toEqual({ kind: 'scorecard', owner: { type: 'match', id: 'match_1' } });
    expect(classifyUpload('/uploads/stats/match_1/team.png')).toEqual({ kind: 'stat-image', owner: { type: 'match', id: 'match_1' } });
    expect(classifyUpload('/uploads/events/e.webp')).toEqual({ kind: 'event-image' });
    expect(classifyUpload('/uploads/other/z.png')).toEqual({ kind: 'upload' });
    expect(contentTypeFor('a.JPG')).toBe('image/jpeg');
    expect(contentTypeFor('a.bin')).toBe('application/octet-stream');
  });
});

describe('checkUploads', () => {
  const big = { urlPath: '/uploads/events/big.png', file: '/x', size: MAX_BLOB_BYTES + 1, mtime: new Date() };
  const ok = { urlPath: '/uploads/events/ok.png', file: '/y', size: 10, mtime: new Date() };
  it('flags files over the blob cap as an issue', () => {
    const issues: Issue[] = [];
    const repairs: Repair[] = [];
    expect(checkUploads([big, ok], false, issues, repairs)).toEqual([ok]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: 'blob_too_large', id: big.urlPath });
    expect(repairs).toEqual([]);
  });
  it('lossy mode reports a repair instead', () => {
    const issues: Issue[] = [];
    const repairs: Repair[] = [];
    checkUploads([big], true, issues, repairs);
    expect(issues).toEqual([]);
    expect(repairs[0]).toMatchObject({ rule: 'lossy_skip_upload', known: false });
  });
});
