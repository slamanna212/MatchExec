// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { setupPgTestFile } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { DEFAULT_LIMIT, bodyLimitFor } from '../../../src/server/middleware/body-limit';

setupPgTestFile({ seed: true });

const MB = 1024 * 1024;

afterEach(() => { delete process.env.MATCHEXEC_RESTORE_MAX_MB; });

describe('request body limits', () => {
  it('picks a per-route limit with room for the multipart envelope', () => {
    expect(bodyLimitFor('/api/matches')).toBe(DEFAULT_LIMIT);
    expect(bodyLimitFor('/api/upload/event-image')).toBe(7 * MB);
    expect(bodyLimitFor('/api/matches/abc/scorecard')).toBe(12 * MB);
    expect(bodyLimitFor('/api/matches/abc/scorecard/sub1/assign')).toBe(DEFAULT_LIMIT);
    expect(bodyLimitFor('/api/debug/scoring-ai-test')).toBe(12 * MB);
    expect(bodyLimitFor('/api/settings/restore')).toBe(102 * MB);
    process.env.MATCHEXEC_RESTORE_MAX_MB = '5';
    expect(bodyLimitFor('/api/settings/restore')).toBe(7 * MB);
  });

  it('rejects an oversized JSON body with 413 before the route parses it', async () => {
    const res = await appRequest('/api/matches', { method: 'POST', json: { name: 'x'.repeat(DEFAULT_LIMIT + 10) } });
    expect(res.status).toBe(413);
    expect(res.data).toEqual({ error: 'Request body too large (max 2 MB)' });
  });

  it('lets normal-sized bodies through to the route', async () => {
    const res = await appRequest('/api/matches', { method: 'POST', json: {} });
    expect(res.status).toBe(400); // validation error from the route, not 413
  });
});
