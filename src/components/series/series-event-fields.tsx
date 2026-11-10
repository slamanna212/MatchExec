import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Stack, Group, Select, NumberInput, Switch, MultiSelect } from '@mantine/core';
import { logger } from '@/lib/logger/client';
import type { SeriesEventRole, SeriesStageDto } from '@/shared/series-types';
import type { MatchTemplateState } from './series-fixtures';
import { MultiplierInput } from './series-multiplier-input';
import { EVENT_ROLE_LABEL } from './series-shared';
import type { SeriesSummary } from './series-shared';
import { allowedGameIds, pickModeId, withRole } from './series-template';
import type { PlacementState } from './series-template';
import type { GameCatalog } from './series-setup';

const ROLE_OPTIONS = (Object.keys(EVENT_ROLE_LABEL) as SeriesEventRole[]).map((r) => ({ value: r, label: EVENT_ROLE_LABEL[r] }));

interface PlacementFieldsProps {
  value: PlacementState;
  onChange: (value: PlacementState) => void;
  stages: SeriesStageDto[];
  /** Roles offered (default: all). */
  roles?: SeriesEventRole[];
}

/** Where an event sits in the season: stage, role, week, points multiplier and whether it counts for the table. */
export function PlacementFields({ value, onChange, stages, roles }: PlacementFieldsProps): JSX.Element {
  const set = <K extends keyof PlacementState>(key: K, v: PlacementState[K]) => onChange({ ...value, [key]: v });
  return (
    <Stack gap="sm">
      <Group grow align="flex-start">
        <Select
          label="Stage"
          placeholder="No stage"
          data={stages.map((s) => ({ value: s.id, label: s.name }))}
          value={value.stage_id}
          onChange={(v) => set('stage_id', v)}
          clearable
          disabled={stages.length === 0}
        />
        <Select
          label="Role"
          data={ROLE_OPTIONS.filter((o) => !roles || roles.includes(o.value))}
          value={value.role}
          onChange={(v) => { if (v) onChange(withRole(value, v as SeriesEventRole)); }}
          allowDeselect={false}
        />
        <NumberInput
          label="Week"
          placeholder="Optional"
          value={value.week ?? ''}
          onChange={(v) => set('week', typeof v === 'number' ? v : null)}
          min={1}
          allowDecimal={false}
        />
      </Group>
      <MultiplierInput
        value={value.points_multiplier}
        onChange={(v) => { if (typeof v === 'number') set('points_multiplier', v); }}
      />
      <Switch
        label="Counts for standings"
        description="Regular events count; playoffs and exhibitions usually do not"
        checked={value.counts_for_standings}
        onChange={(e) => set('counts_for_standings', e.currentTarget.checked)}
      />
    </Stack>
  );
}

interface MapRow { id: string; name: string }

/** Maps of the game's mode (the series' default mode for its primary game, else the first mode with the scoring type). */
export function useModeMaps(gameId: string | null, modeId: string | null): MapRow[] {
  const [maps, setMaps] = useState<MapRow[]>([]);
  useEffect(() => {
    if (!gameId || !modeId) { setMaps([]); return undefined; }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(gameId)}/modes/${encodeURIComponent(modeId)}/maps`);
        if (!res.ok) return;
        const rows = (await res.json()) as MapRow[];
        if (!cancelled) setMaps(Array.isArray(rows) ? rows : []);
      } catch (err) {
        logger.error('Error loading maps for series event:', err);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [gameId, modeId]);
  return maps;
}

interface MatchTemplateFieldsProps {
  series: Pick<SeriesSummary, 'game_id' | 'game_ids' | 'game_mode_id' | 'scoring_type'>;
  catalog: GameCatalog;
  value: MatchTemplateState;
  onChange: (value: MatchTemplateState) => void;
  /** Hide the maps picker (tournaments pick maps per match later). */
  hideMaps?: boolean;
}

/** Game (from the allowed set), maps (matches) or maps per match (tournaments), and rules of a match or tournament the series creates. */
export function MatchTemplateFields({ series, catalog, value, onChange, hideMaps }: MatchTemplateFieldsProps): JSX.Element {
  const gameIds = useMemo(() => allowedGameIds(series, catalog), [series, catalog]);
  const nameOf = (id: string) => catalog.games.find((g) => g.id === id)?.name ?? id;
  const modeId = pickModeId(series, catalog, value.game_id);
  const maps = useModeMaps(hideMaps ? null : value.game_id, modeId);
  const set = (patch: Partial<MatchTemplateState>) => onChange({ ...value, ...patch });

  return (
    <Stack gap="sm">
      <Group grow align="flex-start">
        <Select
          label="Game"
          data={gameIds.map((id) => ({ value: id, label: nameOf(id) }))}
          value={value.game_id}
          onChange={(v) => set({ game_id: v, maps: [] })}
          allowDeselect={false}
          searchable
        />
        {hideMaps && (
          <NumberInput
            label="Maps per match"
            placeholder="Series default"
            value={value.rounds ?? ''}
            onChange={(v) => set({ rounds: typeof v === 'number' ? v : null })}
            min={1}
            max={99}
            allowDecimal={false}
          />
        )}
        <Select
          label="Rules"
          placeholder="Series default"
          data={[{ value: 'casual', label: 'Casual' }, { value: 'competitive', label: 'Competitive' }]}
          value={value.rules}
          onChange={(v) => set({ rules: (v as 'casual' | 'competitive' | null) ?? null })}
          clearable
        />
      </Group>
      {!hideMaps && (
        <MultiSelect
          label="Maps"
          description={modeId ? 'One game per map, played in this order' : 'Pick a game with a matching mode to choose maps'}
          placeholder={value.maps.length === 0 ? 'Series default maps' : undefined}
          data={maps.map((m) => ({ value: m.id, label: m.name }))}
          value={value.maps}
          onChange={(v) => set({ maps: v })}
          disabled={!modeId}
          searchable
          clearable
        />
      )}
    </Stack>
  );
}
