import { useCallback, useEffect, useState } from 'react';
import { logger } from '@/lib/logger/client';
import type {
  CopySeriesEntrantsInput, CreateSeriesEntrantInput, EntrantImportPreview, EntrantImportResult, SeriesEntrantDto, SeriesEntrantMemberDto, SeriesEntrantStatus,
  SeriesMemberRole, WithdrawEntrantInput,
} from '@/shared/series-types';

/** Error from the series API carrying the server's message (`{ error }`) and HTTP status. */
export class SeriesApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'SeriesApiError';
    this.status = status;
  }
}

export async function request<T>(url: string, init?: RequestInit, fallback = 'Request failed'): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({})) as T & { error?: string };
  if (!res.ok) throw new SeriesApiError(data.error ?? fallback, res.status);
  return data;
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export interface PlayerSearchHit {
  user_id: string;
  discord_user_id: string | null;
  username: string;
  avatar_url: string | null;
}

export interface CopyEntrantsResponse {
  entrants: SeriesEntrantDto[];
  skipped: Array<{ name: string; reason: string }>;
}

export interface WithdrawEntrantResponse {
  entrant: SeriesEntrantDto;
  cancelled: number;
  forfeited: number;
}

export interface UpdateEntrantBody {
  name?: string;
  tag?: string | null;
  color?: string | null;
  logo_url?: string | null;
  division?: string | null;
  seed?: number | null;
  status?: Exclude<SeriesEntrantStatus, 'withdrawn'>;
}

const base = (seriesId: string) => `/api/series/${encodeURIComponent(seriesId)}`;

/** Thin typed wrappers over the entrant endpoints. Every call throws `SeriesApiError` with the server's message. */
export const entrantsApi = {
  list: async (seriesId: string, includeLeft = false): Promise<SeriesEntrantDto[]> =>
    (await request<{ entrants: SeriesEntrantDto[] }>(`${base(seriesId)}/entrants${includeLeft ? '?include_left=true' : ''}`, undefined, 'Failed to load entrants')).entrants ?? [],

  create: async (seriesId: string, input: CreateSeriesEntrantInput): Promise<SeriesEntrantDto> =>
    (await request<{ entrant: SeriesEntrantDto }>(`${base(seriesId)}/entrants`, jsonInit('POST', input), 'Failed to add entrant')).entrant,

  update: async (seriesId: string, entrantId: string, body: UpdateEntrantBody): Promise<SeriesEntrantDto> =>
    (await request<{ entrant: SeriesEntrantDto }>(`${base(seriesId)}/entrants/${encodeURIComponent(entrantId)}`, jsonInit('PATCH', body), 'Failed to update entrant')).entrant,

  remove: async (seriesId: string, entrantId: string): Promise<void> => {
    await request(`${base(seriesId)}/entrants/${encodeURIComponent(entrantId)}`, { method: 'DELETE' }, 'Failed to delete entrant');
  },

  withdraw: async (seriesId: string, entrantId: string, input: WithdrawEntrantInput): Promise<WithdrawEntrantResponse> =>
    request<WithdrawEntrantResponse>(`${base(seriesId)}/entrants/${encodeURIComponent(entrantId)}/withdraw`, jsonInit('POST', input), 'Failed to withdraw entrant'),

  copy: async (seriesId: string, input: CopySeriesEntrantsInput): Promise<CopyEntrantsResponse> =>
    request<CopyEntrantsResponse>(`${base(seriesId)}/entrants/copy`, jsonInit('POST', input), 'Failed to copy entrants'),

  importPreview: async (seriesId: string, csv: string): Promise<EntrantImportPreview> =>
    (await request<{ preview: EntrantImportPreview }>(`${base(seriesId)}/entrants/import/preview`, jsonInit('POST', { csv }), 'Failed to read the CSV')).preview,

  import: async (seriesId: string, csv: string): Promise<EntrantImportResult> =>
    (await request<{ result: EntrantImportResult }>(`${base(seriesId)}/entrants/import`, jsonInit('POST', { csv }), 'Failed to import entrants')).result,

  addMember: async (
    seriesId: string, entrantId: string,
    member: { user_id: string; discord_user_id?: string | null; username: string; avatar_url?: string | null; role?: SeriesMemberRole },
  ): Promise<SeriesEntrantMemberDto> =>
    (await request<{ member: SeriesEntrantMemberDto }>(`${base(seriesId)}/entrants/${encodeURIComponent(entrantId)}/members`, jsonInit('POST', member), 'Failed to add player')).member,

  setMemberRole: async (seriesId: string, entrantId: string, memberId: string, role: SeriesMemberRole): Promise<SeriesEntrantMemberDto> =>
    (await request<{ member: SeriesEntrantMemberDto }>(
      `${base(seriesId)}/entrants/${encodeURIComponent(entrantId)}/members/${encodeURIComponent(memberId)}`, jsonInit('PATCH', { role }), 'Failed to change role',
    )).member,

  removeMember: async (seriesId: string, entrantId: string, memberId: string): Promise<void> => {
    await request(`${base(seriesId)}/entrants/${encodeURIComponent(entrantId)}/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' }, 'Failed to remove player');
  },

  searchPlayers: async (query: string, limit = 10): Promise<PlayerSearchHit[]> =>
    (await request<{ players: PlayerSearchHit[] }>(`/api/series/players/search?q=${encodeURIComponent(query)}&limit=${limit}`, undefined, 'Player search failed')).players ?? [],
};

/** Entrants of a series (current rosters, or with history). Reusable by any tab that needs the entrant list. */
export function useSeriesEntrants(seriesId: string, includeLeft = false): {
  entrants: SeriesEntrantDto[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
} {
  const [entrants, setEntrants] = useState<SeriesEntrantDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setEntrants(await entrantsApi.list(seriesId, includeLeft));
      setError(null);
    } catch (err) {
      logger.error('Error loading series entrants:', err);
      setError(err instanceof Error ? err.message : 'Failed to load entrants');
    } finally {
      setLoading(false);
    }
  }, [seriesId, includeLeft]);

  useEffect(() => { void reload(); }, [reload]);

  return { entrants, loading, error, reload };
}
