import { useCallback, useEffect, useState } from 'react';
import { logger } from '@/lib/logger/client';
import type {
  AttachSeriesEventInput, CreateSeriesMatchInput, CreateSeriesPlannedEventInput, CreateSeriesTournamentInput,
  GeneratorCommitInput, GeneratorPreview, RaceCalendarConfig, RoundRobinConfig, SeedPreviewResponse, SeriesEventDto,
  SeriesScoringConfig, SeriesStageDto, SeriesStageStatus, SeriesStandingsResponse,
} from '@/shared/series-types';
import { notificationHelper } from '@/lib/notifications';
import { jsonInit, request } from './series-entrants-api';
import type { SeriesEventView } from './series-shared';

const base = (seriesId: string) => `/api/series/${encodeURIComponent(seriesId)}`;
const enc = encodeURIComponent;

export type GeneratorKind = 'round-robin' | 'race-calendar';

export interface UpdateEventBody {
  stage_id?: string | null;
  role?: SeriesEventDto['role'];
  week?: number | null;
  event_date?: string | null;
  event_order?: number;
  points_multiplier?: number;
  counts_for_standings?: boolean;
}

export interface UpdateStageBody {
  name?: string;
  stage_order?: number;
  status?: SeriesStageStatus;
  counts_toward_season?: boolean;
  scoring_config?: SeriesScoringConfig | null;
}

export interface GeneratorCommitResponse {
  batch_id: string;
  events: SeriesEventView[];
}

/** Typed wrappers over the schedule endpoints (events, stages, generators, batches, playoffs, standings). Throw `SeriesApiError`. */
export const scheduleApi = {
  listEvents: async (seriesId: string): Promise<SeriesEventView[]> =>
    (await request<{ events: SeriesEventView[] }>(`${base(seriesId)}/events`, undefined, 'Failed to load events')).events ?? [],

  attachEvent: (seriesId: string, input: AttachSeriesEventInput) =>
    request<{ id: string }>(`${base(seriesId)}/events`, jsonInit('POST', input), 'Failed to add event'),

  updateEvent: (seriesId: string, eventId: string, body: UpdateEventBody) =>
    request<{ event: SeriesEventView; swapped_with: string | null }>(`${base(seriesId)}/events/${enc(eventId)}`, jsonInit('PATCH', body), 'Failed to update event'),

  removeEvent: (seriesId: string, eventId: string) =>
    request<{ success: boolean; deleted_target: boolean }>(`${base(seriesId)}/events/${enc(eventId)}`, { method: 'DELETE' }, 'Failed to remove event'),

  createMatch: (seriesId: string, input: CreateSeriesMatchInput) =>
    request<{ event: SeriesEventView; match_id: string }>(`${base(seriesId)}/events/match`, jsonInit('POST', input), 'Failed to create match'),

  createTournament: (seriesId: string, input: CreateSeriesTournamentInput) =>
    request<{ event: SeriesEventView; tournament_id: string }>(`${base(seriesId)}/events/tournament`, jsonInit('POST', input), 'Failed to create tournament'),

  createPlanned: (seriesId: string, input: CreateSeriesPlannedEventInput) =>
    request<{ event: SeriesEventView }>(`${base(seriesId)}/events/planned`, jsonInit('POST', input), 'Failed to create playoff placeholder'),

  previewGenerator: (seriesId: string, kind: GeneratorKind, config: RoundRobinConfig | RaceCalendarConfig) =>
    request<GeneratorPreview>(`${base(seriesId)}/generators/${kind}/preview`, jsonInit('POST', config), 'Failed to preview the schedule'),

  commitGenerator: (seriesId: string, kind: GeneratorKind, input: GeneratorCommitInput<RoundRobinConfig | RaceCalendarConfig>) =>
    request<GeneratorCommitResponse>(`${base(seriesId)}/generators/${kind}`, jsonInit('POST', input), 'Failed to create the schedule'),

  regenerateBatch: (seriesId: string, batchId: string) =>
    request<{ removed: number; events: SeriesEventView[] }>(`${base(seriesId)}/batches/${enc(batchId)}/regenerate`, { method: 'POST' }, 'Failed to regenerate the schedule'),

  removeBatch: (seriesId: string, batchId: string) =>
    request<{ success: boolean; removed: number; kept: number }>(`${base(seriesId)}/batches/${enc(batchId)}`, { method: 'DELETE' }, 'Failed to remove the unplayed events'),

  listStages: async (seriesId: string): Promise<SeriesStageDto[]> =>
    (await request<{ stages: SeriesStageDto[] }>(`${base(seriesId)}/stages`, undefined, 'Failed to load stages')).stages ?? [],

  createStage: async (seriesId: string, body: { name: string; counts_toward_season?: boolean }): Promise<SeriesStageDto> =>
    (await request<{ stage: SeriesStageDto }>(`${base(seriesId)}/stages`, jsonInit('POST', body), 'Failed to add stage')).stage,

  updateStage: async (seriesId: string, stageId: string, body: UpdateStageBody): Promise<SeriesStageDto> =>
    (await request<{ stage: SeriesStageDto }>(`${base(seriesId)}/stages/${enc(stageId)}`, jsonInit('PATCH', body), 'Failed to update stage')).stage,

  deleteStage: async (seriesId: string, stageId: string): Promise<void> => {
    await request(`${base(seriesId)}/stages/${enc(stageId)}`, { method: 'DELETE' }, 'Failed to delete stage');
  },

  completeStage: (seriesId: string, stageId: string) =>
    request<{ stage: SeriesStageDto; seedable_event_ids: string[] }>(`${base(seriesId)}/stages/${enc(stageId)}/complete`, { method: 'POST' }, 'Failed to complete stage'),

  seedPreview: (seriesId: string, eventId: string) =>
    request<SeedPreviewResponse>(`${base(seriesId)}/events/${enc(eventId)}/seed-preview`, undefined, 'Failed to load the qualifiers'),

  seedEvent: (seriesId: string, eventId: string, entrantIds?: string[]) =>
    request<{ event: SeriesEventView; tournament_id: string }>(
      `${base(seriesId)}/events/${enc(eventId)}/seed`, jsonInit('POST', entrantIds ? { entrant_ids: entrantIds } : {}), 'Failed to seed the playoffs',
    ),

  standings: (seriesId: string, scope: string, view: 'entrant' | 'individual') =>
    request<SeriesStandingsResponse>(
      `${base(seriesId)}/standings?scope=${enc(scope)}&view=${view}`, undefined, 'Failed to load standings',
    ),
};

/** Stages of a series, in order. */
export function useSeriesStages(seriesId: string): {
  stages: SeriesStageDto[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
} {
  const [stages, setStages] = useState<SeriesStageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await scheduleApi.listStages(seriesId);
      setStages([...list].sort((a, b) => a.stage_order - b.stage_order));
      setError(null);
    } catch (err) {
      logger.error('Error loading series stages:', err);
      setError(err instanceof Error ? err.message : 'Failed to load stages');
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => { void reload(); }, [reload]);

  return { stages, loading, error, reload };
}

export const errorMessage = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback);

/**
 * Runs an API call behind a loading notification that turns into a success or error toast (the pattern the series pages
 * use). Returns the result, or null after the error was shown.
 */
export async function runWithToast<T>(
  nid: string, loadingMessage: string, successMessage: string | ((result: T) => string), action: () => Promise<T>,
): Promise<T | null> {
  notificationHelper.loading({ id: nid, message: loadingMessage });
  try {
    const result = await action();
    notificationHelper.update(nid, { type: 'success', message: typeof successMessage === 'function' ? successMessage(result) : successMessage });
    return result;
  } catch (err) {
    logger.error(`Series request failed (${nid}):`, err);
    notificationHelper.update(nid, { type: 'error', message: errorMessage(err, 'Something went wrong') });
    return null;
  }
}
