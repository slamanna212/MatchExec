import { useState, useEffect, useMemo } from 'react';
import type { JSX } from 'react';
import {
  Stack, Group, Text, Switch, NumberInput, Select, MultiSelect, SegmentedControl, Alert,
} from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';
import type { SeriesEntrantType, SeriesScoringType } from '@/shared/series-types';
import { defaultScoringConfig, isDefaultScoringConfig } from './scoring-config';
import { SeriesFormCard } from './series-form-card';
import type { SeriesFormData, UpdateSeriesForm } from './series-form';
import {
  EMPTY_CATALOG, ENTRANT_TYPE_OPTIONS, SCORING_TYPE_OPTIONS, gamesSupportingScoringType, modesForScoringType,
  reconcileGameSelection, validateRosterInputs,
} from './series-setup';
import type { GameCatalog } from './series-setup';
import type { SeriesSummary } from './series-shared';

interface GameListRow { id: string; name: string; iconUrl?: string | null; color?: string | null }
interface ModeRow { id: string; name: string; scoring_type?: string; team_size?: number | null }

/** Loads the games and each game's modes (with their scoring type) once for the form. */
export function useGameCatalog(): { catalog: GameCatalog; loaded: boolean } {
  const [catalog, setCatalog] = useState<GameCatalog>(EMPTY_CATALOG);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/games');
        if (!res.ok) return;
        const rows = (await res.json()) as GameListRow[];
        const games = Array.isArray(rows) ? rows : [];
        const entries = await Promise.all(games.map(async (g) => {
          try {
            const mres = await fetch(`/api/games/${encodeURIComponent(g.id)}/modes`);
            const modes = mres.ok ? ((await mres.json()) as ModeRow[]) : [];
            return [g.id, (Array.isArray(modes) ? modes : []).map((m) => ({
              id: m.id, name: m.name, scoring_type: m.scoring_type ?? 'Normal', team_size: m.team_size ?? null,
            }))] as const;
          } catch (err) {
            logger.error(`Error loading modes for ${g.id}:`, err);
            return [g.id, []] as const;
          }
        }));
        if (cancelled) return;
        setCatalog({
          games: games.map((g) => ({ id: g.id, name: g.name, icon_url: g.iconUrl ?? null, color: g.color ?? null })),
          modesByGame: Object.fromEntries(entries),
        });
        setLoaded(true);
      } catch (err) {
        logger.error('Error loading games:', err);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  return { catalog, loaded };
}

/** Which setup fields can no longer change (the server answers 409 for them). */
export interface SetupLocks {
  entrantType?: boolean;
  scoringType?: boolean;
}

function LockedHint({ children }: { children: string }): JSX.Element {
  return (
    <Group gap={6} wrap="nowrap" align="flex-start">
      <IconLock size={14} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0, marginTop: 2 }} />
      <Text size="xs" c="dimmed">{children}</Text>
    </Group>
  );
}

interface SetupFieldsProps {
  form: SeriesFormData;
  update: UpdateSeriesForm;
  catalog: GameCatalog;
  catalogLoaded: boolean;
  locks?: SetupLocks;
}

/** Entrant type, roster bounds and scoring type. */
export function SeriesFormatFields({ form, update, catalog, catalogLoaded, locks }: SetupFieldsProps): JSX.Element {
  const rosterError = validateRosterInputs(form.entrant_type, form.roster_min, form.roster_max);
  const scoringDescription = SCORING_TYPE_OPTIONS.find((o) => o.value === form.scoring_type)?.description;

  const changeScoringType = (next: SeriesScoringType | null) => {
    const selection = reconcileGameSelection(catalog, {
      scoring_type: next, game_ids: form.game_ids, game_id: form.game_id, game_mode_id: form.game_mode_id,
    }, catalogLoaded);
    update('scoring_type', next);
    update('game_ids', selection.game_ids);
    update('game_id', selection.game_id);
    update('game_mode_id', selection.game_mode_id);
    // Follow the scoring type with the standings mode as long as the user has not customised the config.
    if (isDefaultScoringConfig(form.scoring_config, form.scoring_type)) update('scoring_config', defaultScoringConfig(next));
  };

  return (
    <SeriesFormCard title="Format">
      <div>
        <Text size="sm" fw={500} mb={4}>Who competes</Text>
        <SegmentedControl
          fullWidth
          value={form.entrant_type}
          onChange={(v) => {
            update('entrant_type', v as SeriesEntrantType);
            if (v === 'solo') { update('roster_min', null); update('roster_max', null); }
            if (form.previous_series_id) update('previous_series_id', null);
          }}
          disabled={locks?.entrantType}
          data={ENTRANT_TYPE_OPTIONS}
        />
        <Text size="xs" c="dimmed" mt={6}>
          {form.entrant_type === 'team'
            ? 'Teams compete all season with a roster of players (league seasons, endurance racing).'
            : 'Each player competes on their own all season (Mario Kart, Fortnite).'}
        </Text>
        {locks?.entrantType && <LockedHint>The entrant type can not change once the series has entrants.</LockedHint>}
      </div>

      {form.entrant_type === 'team' && (
        <Group grow align="flex-start">
          <NumberInput
            label="Minimum roster size"
            description="Teams below this can not be scheduled"
            placeholder="No minimum"
            value={form.roster_min ?? ''}
            onChange={(v) => update('roster_min', typeof v === 'number' ? v : null)}
            min={1}
            max={64}
            allowDecimal={false}
            error={rosterError ?? undefined}
          />
          <NumberInput
            label="Maximum roster size"
            description="Players beyond this can not join"
            placeholder="No maximum"
            value={form.roster_max ?? ''}
            onChange={(v) => update('roster_max', typeof v === 'number' ? v : null)}
            min={1}
            max={64}
            allowDecimal={false}
          />
        </Group>
      )}

      <div>
        <Select
          label="Scoring type"
          description={scoringDescription}
          placeholder="No restriction (legacy)"
          data={SCORING_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={form.scoring_type}
          onChange={(v) => changeScoringType((v as SeriesScoringType | null) ?? null)}
          allowDeselect={false}
          clearable={false}
          disabled={locks?.scoringType}
        />
        {locks?.scoringType && <LockedHint>The scoring type can not change once the series has events.</LockedHint>}
      </div>
    </SeriesFormCard>
  );
}

/** Allowed games (filtered to the scoring type), the primary game and the default mode. */
export function SeriesGameFields({ form, update, catalog, catalogLoaded }: SetupFieldsProps): JSX.Element {
  const supported = useMemo(() => gamesSupportingScoringType(catalog, form.scoring_type), [catalog, form.scoring_type]);
  const primaryChoices = form.game_ids.length > 0 ? supported.filter((g) => form.game_ids.includes(g.id)) : supported;
  const modes = useMemo(
    () => modesForScoringType(catalog, form.game_id, form.scoring_type),
    [catalog, form.game_id, form.scoring_type],
  );
  const scoringLabel = SCORING_TYPE_OPTIONS.find((o) => o.value === form.scoring_type)?.label;

  const setSelection = (patch: { game_ids?: string[]; game_id?: string | null }) => {
    const selection = reconcileGameSelection(catalog, {
      scoring_type: form.scoring_type,
      game_ids: patch.game_ids ?? form.game_ids,
      game_id: patch.game_id === undefined ? form.game_id : patch.game_id,
      game_mode_id: form.game_mode_id,
    }, catalogLoaded);
    update('game_ids', selection.game_ids);
    update('game_id', selection.game_id);
    update('game_mode_id', selection.game_mode_id);
    // The default maps belong to the previous game / mode
    if (selection.game_id !== form.game_id || selection.game_mode_id !== form.game_mode_id) update('match_maps', []);
  };

  return (
    <SeriesFormCard title="Games">
      <MultiSelect
        label="Allowed games"
        description={form.scoring_type
          ? `Only games with a ${scoringLabel} mode are listed. Leave empty to allow just the primary game.`
          : 'Leave empty to allow just the primary game.'}
        placeholder={form.game_ids.length === 0 ? 'Pick one or more games' : undefined}
        data={supported.map((g) => ({ value: g.id, label: g.name }))}
        value={form.game_ids}
        onChange={(ids) => setSelection({ game_ids: ids })}
        searchable
        clearable
        nothingFoundMessage={catalogLoaded ? 'No game supports this scoring type' : 'Loading games...'}
      />
      <Select
        label="Primary game"
        description="Default game for new events and the series cover"
        placeholder="Pick the primary game"
        data={primaryChoices.map((g) => ({ value: g.id, label: g.name }))}
        value={form.game_id}
        onChange={(v) => setSelection({ game_id: v })}
        searchable
        clearable
        nothingFoundMessage={catalogLoaded ? 'No game available' : 'Loading games...'}
      />
      <Select
        label="Default mode"
        description={form.scoring_type ? `${scoringLabel} modes of the primary game` : 'Modes of the primary game'}
        placeholder={form.game_id ? 'Pick a default mode (optional)' : 'Pick a primary game first'}
        data={modes.map((m) => ({ value: m.id, label: m.name }))}
        value={form.game_mode_id}
        onChange={(v) => { update('game_mode_id', v); update('match_maps', []); }}
        disabled={!form.game_id}
        searchable
        clearable
        nothingFoundMessage="No matching mode"
      />
    </SeriesFormCard>
  );
}

interface MapRow { id: string; name: string }

/** Prefills for matches and tournaments the series creates. */
export function SeriesMatchDefaultsFields({ form, update }: { form: SeriesFormData; update: UpdateSeriesForm }): JSX.Element {
  const [maps, setMaps] = useState<MapRow[]>([]);

  useEffect(() => {
    if (!form.game_id || !form.game_mode_id) { setMaps([]); return undefined; }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(form.game_id as string)}/modes/${encodeURIComponent(form.game_mode_id as string)}/maps`);
        if (!res.ok) return;
        const rows = (await res.json()) as MapRow[];
        if (!cancelled) setMaps(Array.isArray(rows) ? rows : []);
      } catch (err) {
        logger.error('Error loading maps for series defaults:', err);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [form.game_id, form.game_mode_id]);

  return (
    <SeriesFormCard title="Match defaults">
      <Text size="xs" c="dimmed" mt={-8}>
        Prefilled when you create matches and tournaments from this series. You can still change them per event.
      </Text>
      <Group grow align="flex-start">
        <NumberInput
          label="Maps per tournament match"
          description="Matches play one game per selected map"
          placeholder="Game default"
          value={form.match_rounds ?? ''}
          onChange={(v) => update('match_rounds', typeof v === 'number' ? v : null)}
          min={1}
          max={99}
          allowDecimal={false}
        />
        <Select
          label="Rules"
          placeholder="Game default"
          data={[{ value: 'casual', label: 'Casual' }, { value: 'competitive', label: 'Competitive' }]}
          value={form.match_rules}
          onChange={(v) => update('match_rules', (v as 'casual' | 'competitive' | null) ?? null)}
          clearable
        />
      </Group>
      <Switch
        label="Collect player stats"
        description="Allow scorecard screenshots to be submitted for created matches"
        checked={form.match_stats_enabled}
        onChange={(e) => update('match_stats_enabled', e.currentTarget.checked)}
      />
      <Switch
        label="Notify players of created matches"
        description="Send DMs and reminders to the players of matches this series creates"
        checked={form.match_player_notifications}
        onChange={(e) => update('match_player_notifications', e.currentTarget.checked)}
      />
      <MultiSelect
        label="Default maps (optional)"
        description={form.game_mode_id ? 'Maps new matches start with' : 'Pick a default mode to choose maps'}
        placeholder={form.match_maps.length === 0 ? 'No default maps' : undefined}
        data={maps.map((m) => ({ value: m.id, label: m.name }))}
        value={form.match_maps}
        onChange={(v) => update('match_maps', v)}
        disabled={!form.game_mode_id}
        searchable
        clearable
      />
    </SeriesFormCard>
  );
}

/** Format + games + match defaults. `locks` disables the fields the server refuses to change. */
export function SeriesSetupFields({
  form, update, locks, catalog, catalogLoaded,
}: SetupFieldsProps): JSX.Element {
  return (
    <Stack gap="md">
      <SeriesFormatFields form={form} update={update} catalog={catalog} catalogLoaded={catalogLoaded} locks={locks} />
      <SeriesGameFields form={form} update={update} catalog={catalog} catalogLoaded={catalogLoaded} locks={locks} />
      <SeriesMatchDefaultsFields form={form} update={update} />
    </Stack>
  );
}

/** Create flow only: pick a previous season to copy entrants from (same entrant type). */
export function SeriesCopyEntrantsFields({ form, update }: { form: SeriesFormData; update: UpdateSeriesForm }): JSX.Element {
  const [candidates, setCandidates] = useState<SeriesSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/series');
        if (!res.ok) return;
        const data = (await res.json()) as { series?: SeriesSummary[] };
        if (!cancelled) setCandidates(data.series ?? []);
      } catch (err) {
        logger.error('Error loading series for copy entrants:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const options = candidates
    .filter((s) => (s.entrant_type ?? 'solo') === form.entrant_type)
    .map((s) => ({ value: s.id, label: s.name }));

  return (
    <SeriesFormCard title="Entrants">
      <Select
        label="Copy entrants from a previous series (optional)"
        description="Seeds this series with the teams or players of an earlier season and links it as the previous season. You can edit them afterwards."
        placeholder={loading ? 'Loading series...' : options.length === 0 ? 'No earlier series with the same entrant type' : 'Pick a series'}
        data={options}
        value={form.previous_series_id}
        onChange={(v) => update('previous_series_id', v)}
        searchable
        clearable
        disabled={options.length === 0}
      />
      {form.previous_series_id && (
        <Switch
          label="Include rosters"
          description={form.entrant_type === 'team' ? 'Copy each team\'s current players too' : 'Copy the players (solo entrants are their player)'}
          checked={form.copy_include_members}
          onChange={(e) => update('copy_include_members', e.currentTarget.checked)}
        />
      )}
      {form.entrant_type === 'team' && !form.previous_series_id && (
        <Alert color="gray" variant="light">
          You can also add teams by hand on the series page after creating it.
        </Alert>
      )}
    </SeriesFormCard>
  );
}

/** Discord post toggles with the channel type each one uses. */
export function SeriesDiscordFields({ form, update }: { form: SeriesFormData; update: UpdateSeriesForm }): JSX.Element {
  return (
    <SeriesFormCard title="Discord posts">
      <Switch
        label="Registration posts"
        description="Post a sign-up message with Register buttons when registration opens. Goes to channels with Announcements enabled."
        checked={form.discord_registration_posts}
        onChange={(e) => update('discord_registration_posts', e.currentTarget.checked)}
      />
      <Switch
        label="Weekly schedule"
        description="Post each week's matches before they start. Goes to channels with Series Updates enabled."
        checked={form.discord_weekly_schedule}
        onChange={(e) => update('discord_weekly_schedule', e.currentTarget.checked)}
      />
      <Switch
        label="Standings posts"
        description="Post the standings table when a week's events are finished. Goes to channels with Series Updates enabled."
        checked={form.discord_standings_posts}
        onChange={(e) => update('discord_standings_posts', e.currentTarget.checked)}
      />
      <NumberInput
        label="Schedule lead time (hours)"
        description="Post a week's schedule this long before its first match"
        value={form.discord_schedule_lead_hours}
        onChange={(v) => update('discord_schedule_lead_hours', typeof v === 'number' ? v : 48)}
        min={0}
        max={720}
        allowDecimal={false}
        disabled={!form.discord_weekly_schedule}
      />
      <Text size="xs" c="dimmed">
        Playoff seedings and the champion are posted to Live Updates channels.
      </Text>
    </SeriesFormCard>
  );
}
