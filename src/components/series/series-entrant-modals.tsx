import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import {
  Modal, Stack, Group, Text, TextInput, NumberInput, ColorInput, Autocomplete, Select, Switch, Button, Divider, Alert,
  Radio, Avatar, Anchor,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconAlertCircle } from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';
import { notificationHelper } from '@/lib/notifications';
import type { SeriesEntrantDto, SeriesEntrantType, SeriesMemberRole } from '@/shared/series-types';
import { entrantsApi } from './series-entrants-api';
import type { PlayerSearchHit } from './series-entrants-api';
import {
  blankToNull, defaultMemberRole, describeWithdrawResult, distinctDivisions, nextSeed, playerKey,
} from './series-entrants-shared';
import { MEMBER_ROLE_LABEL } from './series-entrants-shared';
import type { SeriesSummary } from './series-shared';

const errorMessage = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback);

// ─── player picker ───────────────────────────────────────────────────────────

export interface PickedPlayer {
  user_id: string;
  discord_user_id: string | null;
  username: string;
  avatar_url?: string | null;
}

interface PlayerPickerProps {
  value: PickedPlayer | null;
  onChange: (player: PickedPlayer | null) => void;
  /** Player keys that are already on a current roster (listed but not selectable). */
  excludeKeys?: ReadonlySet<string>;
  label?: string;
  autoFocus?: boolean;
}

/**
 * Pick a known player (debounced search against /api/series/players/search) or enter a Discord id and display name by
 * hand for someone who has never appeared in a match.
 */
export function PlayerPicker({ value, onChange, excludeKeys, label = 'Player', autoFocus }: PlayerPickerProps): JSX.Element {
  const [manual, setManual] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 250);
  const [hits, setHits] = useState<PlayerSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualId, setManualId] = useState('');
  const [manualName, setManualName] = useState('');

  useEffect(() => {
    const q = debounced.trim();
    if (manual || q.length === 0 || (value && q === value.username)) { setHits([]); return undefined; }
    let cancelled = false;
    setSearching(true);
    entrantsApi.searchPlayers(q)
      .then((players) => { if (!cancelled) setHits(players); })
      .catch((err) => { logger.error('Error searching players:', err); if (!cancelled) setHits([]); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [debounced, manual, value]);

  const options = useMemo(() => {
    const byKey = new Map<string, PlayerSearchHit | PickedPlayer>();
    if (value) byKey.set(playerKey(value), value);
    for (const h of hits) if (!byKey.has(playerKey(h))) byKey.set(playerKey(h), h);
    return [...byKey.entries()].map(([key, p]) => ({
      value: key,
      label: p.username,
      disabled: !!excludeKeys?.has(key) && playerKey(value ?? { user_id: '' }) !== key,
    }));
  }, [hits, value, excludeKeys]);

  const lookup = (key: string): PickedPlayer | null => {
    const hit = hits.find((h) => playerKey(h) === key);
    if (hit) return { user_id: hit.user_id, discord_user_id: hit.discord_user_id, username: hit.username, avatar_url: hit.avatar_url };
    return value && playerKey(value) === key ? value : null;
  };

  const updateManual = (id: string, name: string) => {
    setManualId(id);
    setManualName(name);
    const cleanId = id.trim();
    const cleanName = name.trim();
    onChange(cleanId && cleanName ? { user_id: cleanId, discord_user_id: cleanId, username: cleanName } : null);
  };

  if (manual) {
    return (
      <Stack gap="xs">
        <Group grow align="flex-start">
          <TextInput
            label="Discord user ID"
            placeholder="e.g. 123456789012345678"
            value={manualId}
            onChange={(e) => updateManual(e.currentTarget.value, manualName)}
            data-autofocus={autoFocus ? true : undefined}
          />
          <TextInput
            label="Display name"
            placeholder="Shown in standings"
            value={manualName}
            onChange={(e) => updateManual(manualId, e.currentTarget.value)}
          />
        </Group>
        <Anchor component="button" type="button" size="xs" onClick={() => { setManual(false); onChange(null); }}>
          Search known players instead
        </Anchor>
      </Stack>
    );
  }

  return (
    <Stack gap={6}>
      <Select
        label={label}
        placeholder="Search players by name..."
        data={options}
        value={value ? playerKey(value) : null}
        onChange={(key) => onChange(key ? lookup(key) : null)}
        searchable
        clearable
        searchValue={search}
        onSearchChange={setSearch}
        filter={({ options: all }) => all}
        nothingFoundMessage={searching ? 'Searching...' : search.trim() ? 'No player found' : 'Type to search'}
        rightSection={undefined}
        data-autofocus={autoFocus ? true : undefined}
        renderOption={({ option }) => {
          const hit = hits.find((h) => playerKey(h) === option.value);
          return (
            <Group gap="xs" wrap="nowrap">
              <Avatar src={hit?.avatar_url ?? value?.avatar_url ?? null} size="sm" radius="xl" />
              <div>
                <Text size="sm">{option.label}</Text>
                {option.disabled && <Text size="xs" c="dimmed">Already on a roster</Text>}
              </div>
            </Group>
          );
        }}
      />
      <Anchor component="button" type="button" size="xs" onClick={() => { setManual(true); onChange(null); }}>
        Not listed? Enter a Discord ID manually
      </Anchor>
    </Stack>
  );
}

// ─── add / edit entrant ──────────────────────────────────────────────────────

interface EntrantFormModalProps {
  opened: boolean;
  onClose: () => void;
  seriesId: string;
  entrantType: SeriesEntrantType;
  /** null = add a new entrant. */
  entrant: SeriesEntrantDto | null;
  entrants: readonly SeriesEntrantDto[];
  rosteredKeys: ReadonlySet<string>;
  onSaved: () => void;
}

export function EntrantFormModal({
  opened, onClose, seriesId, entrantType, entrant, entrants, rosteredKeys, onSaved,
}: EntrantFormModalProps): JSX.Element {
  const solo = entrantType === 'solo';
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [color, setColor] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [division, setDivision] = useState('');
  const [seed, setSeed] = useState<number | string>('');
  const [player, setPlayer] = useState<PickedPlayer | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setName(entrant?.name ?? '');
    setTag(entrant?.tag ?? '');
    setColor(entrant?.color ?? '');
    setLogoUrl(entrant?.logo_url ?? '');
    setDivision(entrant?.division ?? '');
    setSeed(entrant?.seed ?? (entrant ? '' : nextSeed(entrants)));
    setPlayer(null);
    setError(null);
  // Re-initialise only when the modal opens for a (different) entrant, not on every entrants refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, entrant?.id]);

  const divisions = useMemo(() => distinctDivisions(entrants), [entrants]);
  const seedValue = typeof seed === 'number' ? seed : null;
  const tagTooLong = tag.trim().length > 12;
  const canSave = name.trim().length > 0 && !tagTooLong && (entrant !== null || !solo || player !== null);

  const pickPlayer = (p: PickedPlayer | null) => {
    // Solo entrants are named after their player until the name is edited by hand.
    if (solo && !entrant && (name.trim() === '' || name === player?.username)) setName(p?.username ?? '');
    setPlayer(p);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const nid = `series-entrant-${entrant?.id ?? 'new'}`;
    notificationHelper.loading({ id: nid, message: entrant ? 'Saving entrant...' : 'Adding entrant...' });
    try {
      if (entrant) {
        await entrantsApi.update(seriesId, entrant.id, {
          name: name.trim(),
          tag: blankToNull(tag),
          color: blankToNull(color),
          logo_url: blankToNull(logoUrl),
          division: blankToNull(division),
          seed: seedValue,
        });
      } else {
        await entrantsApi.create(seriesId, {
          name: name.trim(),
          tag: blankToNull(tag),
          color: blankToNull(color),
          logo_url: blankToNull(logoUrl),
          division: blankToNull(division),
          seed: seedValue,
          members: player
            ? [{ user_id: player.user_id, discord_user_id: player.discord_user_id, username: player.username, role: solo ? 'player' : 'captain' }]
            : undefined,
        });
      }
      notificationHelper.update(nid, { type: 'success', message: entrant ? 'Entrant saved' : (solo ? 'Player added' : 'Team added') });
      onClose();
      onSaved();
    } catch (err) {
      logger.error('Error saving series entrant:', err);
      const message = errorMessage(err, 'Failed to save entrant');
      notificationHelper.update(nid, { type: 'error', message });
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const noun = solo ? 'player' : 'team';
  const title = entrant ? `Edit ${noun}` : `Add ${noun}`;

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="md">
      <Stack gap="md">
        {solo && !entrant && (
          <PlayerPicker value={player} onChange={pickPlayer} excludeKeys={rosteredKeys} autoFocus />
        )}
        <TextInput
          label={solo ? 'Display name' : 'Team name'}
          placeholder={solo ? 'Defaults to the player name' : 'e.g. Boston Uprising'}
          required
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          data-autofocus={!solo ? true : undefined}
        />
        <Group grow align="flex-start">
          <TextInput
            label="Tag"
            placeholder="e.g. BOS"
            value={tag}
            onChange={(e) => setTag(e.currentTarget.value)}
            error={tagTooLong ? 'At most 12 characters' : undefined}
          />
          <ColorInput
            label="Color"
            placeholder="Pick a color"
            value={color}
            onChange={setColor}
            format="hex"
            swatches={['#e03131', '#f08c00', '#2f9e44', '#1971c2', '#7048e8', '#c2255c', '#0c8599', '#495057']}
          />
        </Group>
        <TextInput
          label="Logo URL"
          placeholder="https://..."
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.currentTarget.value)}
        />
        <Group grow align="flex-start">
          <Autocomplete
            label="Division"
            description="Optional grouping, e.g. Atlantic / Pacific"
            placeholder="No division"
            data={divisions}
            value={division}
            onChange={setDivision}
          />
          <NumberInput
            label="Seed"
            description="Lower seeds rank first in brackets"
            placeholder="Unseeded"
            value={seed}
            onChange={setSeed}
            min={1}
            max={9999}
            allowDecimal={false}
          />
        </Group>
        {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
        <Divider />
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSave}>{entrant ? 'Save' : `Add ${noun}`}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ─── add member ──────────────────────────────────────────────────────────────

interface AddMemberModalProps {
  opened: boolean;
  onClose: () => void;
  seriesId: string;
  entrantType: SeriesEntrantType;
  entrant: SeriesEntrantDto | null;
  rosteredKeys: ReadonlySet<string>;
  onAdded: () => void;
}

export function AddMemberModal({ opened, onClose, seriesId, entrantType, entrant, rosteredKeys, onAdded }: AddMemberModalProps): JSX.Element {
  const [player, setPlayer] = useState<PickedPlayer | null>(null);
  const [role, setRole] = useState<SeriesMemberRole>('player');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened || !entrant) return;
    setPlayer(null);
    setError(null);
    setRole(defaultMemberRole(entrantType, entrant));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, entrant?.id]);

  const handleAdd = async () => {
    if (!entrant || !player) return;
    setSaving(true);
    setError(null);
    const nid = `series-add-member-${entrant.id}`;
    notificationHelper.loading({ id: nid, message: 'Adding player...' });
    try {
      await entrantsApi.addMember(seriesId, entrant.id, {
        user_id: player.user_id, discord_user_id: player.discord_user_id, username: player.username, role,
      });
      notificationHelper.update(nid, { type: 'success', message: `${player.username} added to ${entrant.name}` });
      onClose();
      onAdded();
    } catch (err) {
      logger.error('Error adding series member:', err);
      const message = errorMessage(err, 'Failed to add player');
      notificationHelper.update(nid, { type: 'error', message });
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={entrant ? `Add player to ${entrant.name}` : 'Add player'} size="md">
      <Stack gap="md">
        <PlayerPicker value={player} onChange={setPlayer} excludeKeys={rosteredKeys} autoFocus />
        <Select
          label="Role"
          description="Making someone captain demotes the current captain to player"
          data={(['captain', 'player', 'sub'] as const).map((r) => ({ value: r, label: MEMBER_ROLE_LABEL[r] }))}
          value={role}
          onChange={(v) => setRole((v as SeriesMemberRole | null) ?? 'player')}
          allowDeselect={false}
        />
        {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
        <Divider />
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleAdd} loading={saving} disabled={!player}>Add player</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ─── withdraw ────────────────────────────────────────────────────────────────

interface WithdrawEntrantModalProps {
  entrant: SeriesEntrantDto | null;
  onClose: () => void;
  seriesId: string;
  onWithdrawn: () => void;
}

export function WithdrawEntrantModal({ entrant, onClose, seriesId, onWithdrawn }: WithdrawEntrantModalProps): JSX.Element {
  const [unplayed, setUnplayed] = useState<'cancel' | 'forfeit'>('cancel');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entrant) { setUnplayed('cancel'); setError(null); }
  }, [entrant]);

  const handleWithdraw = async () => {
    if (!entrant) return;
    setSaving(true);
    setError(null);
    const nid = `series-withdraw-${entrant.id}`;
    notificationHelper.loading({ id: nid, message: 'Withdrawing...' });
    try {
      const result = await entrantsApi.withdraw(seriesId, entrant.id, { unplayed });
      notificationHelper.update(nid, { type: 'success', message: describeWithdrawResult(entrant.name, result.cancelled ?? 0, result.forfeited ?? 0) });
      onClose();
      onWithdrawn();
    } catch (err) {
      logger.error('Error withdrawing series entrant:', err);
      const message = errorMessage(err, 'Failed to withdraw');
      notificationHelper.update(nid, { type: 'error', message });
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={entrant !== null} onClose={onClose} title="Withdraw from the series" size="md">
      <Stack gap="md">
        <Text size="sm">
          Withdraw <strong>{entrant?.name}</strong>? Played results stay in the standings. Choose what happens to its matches that
          have not been played yet.
        </Text>
        <Radio.Group value={unplayed} onChange={(v) => setUnplayed(v as 'cancel' | 'forfeit')}>
          <Stack gap="xs">
            <Radio value="cancel" label="Cancel unplayed matches" description="They are removed from the schedule. Nobody gets a win." />
            <Radio value="forfeit" label="Forfeit unplayed matches" description="The opponent is awarded the win in each of them." />
          </Stack>
        </Radio.Group>
        {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
        <Divider />
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>Back</Button>
          <Button color="red" onClick={handleWithdraw} loading={saving}>Withdraw</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ─── copy from another series ────────────────────────────────────────────────

interface CopyEntrantsModalProps {
  opened: boolean;
  onClose: () => void;
  seriesId: string;
  entrantType: SeriesEntrantType;
  onCopied: () => void;
}

export function CopyEntrantsModal({ opened, onClose, seriesId, entrantType, onCopied }: CopyEntrantsModalProps): JSX.Element {
  const [sources, setSources] = useState<SeriesSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromId, setFromId] = useState<string | null>(null);
  const [includeMembers, setIncludeMembers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return undefined;
    setFromId(null);
    setError(null);
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/series');
        if (res.ok && !cancelled) setSources(((await res.json()) as { series?: SeriesSummary[] }).series ?? []);
      } catch (err) {
        logger.error('Error loading series to copy from:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [opened]);

  const options = sources
    .filter((s) => s.id !== seriesId && (s.entrant_type ?? 'solo') === entrantType)
    .map((s) => ({ value: s.id, label: s.name }));

  const handleCopy = async () => {
    if (!fromId) return;
    setSaving(true);
    setError(null);
    const nid = `series-copy-entrants-${seriesId}`;
    notificationHelper.loading({ id: nid, message: 'Copying entrants...' });
    try {
      const result = await entrantsApi.copy(seriesId, { from_series_id: fromId, include_members: includeMembers });
      const skipped = result.skipped ?? [];
      notificationHelper.update(nid, {
        type: skipped.length > 0 ? 'warning' : 'success',
        message: `${result.entrants.length} ${result.entrants.length === 1 ? 'entrant' : 'entrants'} copied${skipped.length > 0 ? `. Skipped: ${skipped.map((s) => s.name).join(', ')}` : ''}`,
        autoClose: skipped.length > 0 ? 10000 : undefined,
      });
      onClose();
      onCopied();
    } catch (err) {
      logger.error('Error copying series entrants:', err);
      const message = errorMessage(err, 'Failed to copy entrants');
      notificationHelper.update(nid, { type: 'error', message });
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Copy entrants from a series" size="md">
      <Stack gap="md">
        <Select
          label="Source series"
          description="Only series with the same entrant type are listed. Entrants whose name already exists here are skipped."
          placeholder={loading ? 'Loading...' : options.length === 0 ? 'No other series with the same entrant type' : 'Pick a series'}
          data={options}
          value={fromId}
          onChange={setFromId}
          searchable
          disabled={options.length === 0}
        />
        <Switch
          label="Include rosters"
          description="Copy the current players of each entrant. Players already on a roster here are skipped."
          checked={includeMembers}
          onChange={(e) => setIncludeMembers(e.currentTarget.checked)}
        />
        {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
        <Divider />
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleCopy} loading={saving} disabled={!fromId}>Copy entrants</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
