import type { JSX } from 'react';
import { Stack, Group, Select, NumberInput, Switch, SegmentedControl, Chip, Text, TagsInput, TextInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import type { SeriesEntrantDto, SeriesStageDto, TournamentBracketFormat } from '@/shared/series-types';
import { EntrantSelect } from './series-entrant-select';
import { MatchTemplateFields } from './series-event-fields';
import { DATE_RE, DAY_LABELS, TIME_RE, timeZoneOptions } from './series-fixtures';
import type { RaceCalendarFormState, RoundRobinFormState } from './series-fixtures';
import type { GameCatalog } from './series-setup';
import type { SeriesSummary } from './series-shared';

export type SetForm<F> = <K extends keyof F>(key: K, value: F[K]) => void;

interface CommonProps {
  series: SeriesSummary;
  catalog: GameCatalog;
  stages: SeriesStageDto[];
  active: SeriesEntrantDto[];
}

function StageSelect({ stages, value, onChange }: { stages: SeriesStageDto[]; value: string | null; onChange: (v: string | null) => void }): JSX.Element {
  return (
    <Select
      label="Stage"
      placeholder="No stage"
      data={stages.map((s) => ({ value: s.id, label: s.name }))}
      value={value}
      onChange={onChange}
      clearable
      disabled={stages.length === 0}
    />
  );
}

function TimeZoneSelect({ value, onChange }: { value: string; onChange: (v: string) => void }): JSX.Element {
  return (
    <Select
      label="Timezone"
      description="Times below are wall-clock in this timezone"
      data={timeZoneOptions(value)}
      value={value}
      onChange={(v) => { if (v) onChange(v); }}
      allowDeselect={false}
      searchable
    />
  );
}

// Weeks start on Monday in the UI; values follow the API (0 = Sunday).
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function RoundRobinFields({ form, set, series, catalog, stages, active }: CommonProps & { form: RoundRobinFormState; set: SetForm<RoundRobinFormState> }): JSX.Element {
  const hasDivisions = active.some((e) => e.division);
  const badSlots = form.time_slots.filter((t) => !TIME_RE.test(t));
  const badDates = form.skip_dates.filter((d) => !DATE_RE.test(d));
  return (
    <Stack gap="md">
      <StageSelect stages={stages} value={form.stage_id} onChange={(v) => set('stage_id', v)} />
      <EntrantSelect
        entrants={active}
        value={form.entrant_ids}
        onChange={(ids) => set('entrant_ids', ids)}
        all={{ value: form.all_entrants, onChange: (v) => set('all_entrants', v) }}
      />
      <Group align="flex-start" grow>
        <Switch
          label="Double round robin"
          description="Everyone plays everyone twice, home and away swapped"
          checked={form.double}
          onChange={(e) => set('double', e.currentTarget.checked)}
        />
      </Group>
      {hasDivisions && (
        <div>
          <Text size="sm" fw={500} mb={4}>Divisions</Text>
          <SegmentedControl
            fullWidth
            value={form.divisions}
            onChange={(v) => set('divisions', v as RoundRobinFormState['divisions'])}
            data={[
              { value: 'none', label: 'Everyone plays everyone' },
              { value: 'within', label: 'Within divisions' },
              { value: 'within_and_cross', label: 'Within + across' },
            ]}
          />
          <Text size="xs" c="dimmed" mt={6}>
            &quot;Within + across&quot; plays each division twice internally and every cross-division pairing once.
          </Text>
        </div>
      )}
      <DatePickerInput
        label="First possible match day"
        placeholder="Pick a date"
        required
        value={form.start_date}
        onChange={(v) => set('start_date', v)}
      />
      <div>
        <Text size="sm" fw={500} mb={4}>Match days</Text>
        <Chip.Group
          multiple
          value={form.match_days.map(String)}
          onChange={(v) => set('match_days', v.map(Number))}
        >
          <Group gap={6}>
            {DAY_ORDER.map((d) => <Chip key={d} value={String(d)} size="xs">{DAY_LABELS[d]}</Chip>)}
          </Group>
        </Chip.Group>
      </div>
      <TagsInput
        label="Time slots"
        description="Press enter after each time, for example 19:00"
        placeholder="19:00"
        splitChars={[',', ' ']}
        value={form.time_slots}
        onChange={(v) => set('time_slots', v)}
        error={badSlots.length > 0 ? `Not a time: ${badSlots.join(', ')} (use HH:MM)` : undefined}
      />
      <TimeZoneSelect value={form.timezone} onChange={(v) => set('timezone', v)} />
      <Group grow align="flex-start">
        <NumberInput
          label="Concurrent matches"
          description="Matches per time slot"
          value={form.concurrent_matches}
          onChange={(v) => set('concurrent_matches', typeof v === 'number' ? v : 1)}
          min={1}
          allowDecimal={false}
        />
        <NumberInput
          label="Max per entrant per week"
          value={form.max_per_entrant_per_week}
          onChange={(v) => set('max_per_entrant_per_week', typeof v === 'number' ? v : 1)}
          min={1}
          allowDecimal={false}
        />
      </Group>
      <TagsInput
        label="Skip dates"
        description="Holidays or breaks, as YYYY-MM-DD"
        placeholder="2026-12-25"
        splitChars={[',', ' ']}
        value={form.skip_dates}
        onChange={(v) => set('skip_dates', v)}
        error={badDates.length > 0 ? `Not a date: ${badDates.join(', ')}` : undefined}
      />
      <TextInput
        label="Match name"
        description="{home} and {away} are replaced by the entrant names"
        value={form.name_template}
        onChange={(e) => set('name_template', e.currentTarget.value)}
      />
      <NumberInput
        label="Points multiplier"
        value={form.points_multiplier}
        onChange={(v) => set('points_multiplier', typeof v === 'number' ? v : 1)}
        min={0.1}
        max={10}
        step={0.5}
        decimalScale={2}
      />
      <MatchTemplateFields series={series} catalog={catalog} value={form.template} onChange={(t) => set('template', t)} />
    </Stack>
  );
}

const RACE_FORMATS: TournamentBracketFormat[] = ['cumulative-points', 'single-elimination', 'double-elimination'];

export function RaceCalendarFields({ form, set, series, catalog, stages, active }: CommonProps & { form: RaceCalendarFormState; set: SetForm<RaceCalendarFormState> }): JSX.Element {
  return (
    <Stack gap="md">
      <StageSelect stages={stages} value={form.stage_id} onChange={(v) => set('stage_id', v)} />
      <EntrantSelect
        entrants={active}
        value={form.entrant_ids}
        onChange={(ids) => set('entrant_ids', ids)}
        all={{ value: form.all_entrants, onChange: (v) => set('all_entrants', v) }}
      />
      <div>
        <Text size="sm" fw={500} mb={4}>Each event is a</Text>
        <SegmentedControl
          fullWidth
          value={form.event_kind}
          onChange={(v) => set('event_kind', v as RaceCalendarFormState['event_kind'])}
          data={[{ value: 'match', label: 'Match (all entrants)' }, { value: 'tournament', label: 'Tournament' }]}
        />
      </div>
      {form.event_kind === 'tournament' && (
        <Select
          label="Tournament format"
          data={RACE_FORMATS.map((f) => ({ value: f, label: f.replace(/-/g, ' ') }))}
          value={form.tournament_format}
          onChange={(v) => { if (v) set('tournament_format', v as TournamentBracketFormat); }}
          allowDeselect={false}
        />
      )}
      <Group grow align="flex-start">
        <NumberInput
          label="Number of events"
          value={form.count}
          onChange={(v) => set('count', typeof v === 'number' ? v : 1)}
          min={1}
          max={100}
          allowDecimal={false}
        />
        <NumberInput
          label="Days between events"
          value={form.interval_days}
          onChange={(v) => set('interval_days', typeof v === 'number' ? v : 7)}
          min={1}
          allowDecimal={false}
        />
      </Group>
      <Group grow align="flex-start">
        <DatePickerInput
          label="First event"
          placeholder="Pick a date"
          required
          value={form.start_date}
          onChange={(v) => set('start_date', v)}
        />
        <TextInput
          label="Time"
          type="time"
          value={form.time}
          onChange={(e) => set('time', e.currentTarget.value)}
        />
      </Group>
      <TimeZoneSelect value={form.timezone} onChange={(v) => set('timezone', v)} />
      <TextInput
        label="Event name"
        description="{n} is replaced by the event number"
        value={form.name_template}
        onChange={(e) => set('name_template', e.currentTarget.value)}
      />
      <NumberInput
        label="Points multiplier"
        value={form.points_multiplier}
        onChange={(v) => set('points_multiplier', typeof v === 'number' ? v : 1)}
        min={0.1}
        max={10}
        step={0.5}
        decimalScale={2}
      />
      <MatchTemplateFields series={series} catalog={catalog} value={form.template} onChange={(t) => set('template', t)} hideMaps={form.event_kind === 'tournament'} />
    </Stack>
  );
}
