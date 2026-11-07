/**
 * Decides how the match "Players" tab groups participants.
 *
 * - `flat`: FFA matches (every participant is their own entry) and Position matches without shared teams. There are
 *   no teams to show, so no team columns or "Blue/Red" labels.
 * - `sides`: Normal matches with at most two teams: the classic two columns (Blue vs Red by default, the real team
 *   names when the teams are named, e.g. tournament teams).
 * - `teams`: three or more teams (Normal with `team_count` > 2, Position team modes such as endurance or battle-royale
 *   squads), one section per team.
 */

export interface GroupableParticipant {
  id: string;
  team_assignment?: 'reserve' | 'blue' | 'red' | null;
  team_id?: string | null;
  team_name?: string | null;
  team_logo_url?: string | null;
  team_order?: number | null;
}

export interface TeamGroup<P extends GroupableParticipant> {
  key: string;
  title: string;
  /** Mantine colour name. */
  color: string;
  /** Team logo, when it has one. */
  logoUrl?: string | null;
  players: P[];
}

export type ParticipantLayout<P extends GroupableParticipant> =
  | { kind: 'flat'; players: P[] }
  | { kind: 'sides'; blue: TeamGroup<P>; red: TeamGroup<P>; unassigned: P[] }
  | { kind: 'teams'; teams: Array<TeamGroup<P>>; unassigned: P[] };

const RESERVE_ORDER = 99;
const TEAM_COLORS = ['violet', 'teal', 'orange', 'grape', 'lime', 'cyan', 'pink', 'indigo', 'yellow', 'green'] as const;

function isReserve(p: GroupableParticipant): boolean {
  return p.team_assignment === 'reserve' || (p.team_order ?? 0) >= RESERVE_ORDER;
}

function sideTitle(players: GroupableParticipant[], fallback: string, defaultName: string): string {
  const name = players.find((p) => p.team_name)?.team_name;
  return !name || name === defaultName ? fallback : name;
}

function teamLogo(players: GroupableParticipant[]): string | null {
  return players.find((p) => p.team_logo_url)?.team_logo_url ?? null;
}

export function layoutParticipants<P extends GroupableParticipant>(participants: P[], scoringType = 'Normal'): ParticipantLayout<P> {
  if (scoringType === 'FFA') return { kind: 'flat', players: participants };

  const unassigned = participants.filter((p) => isReserve(p) || (p.team_order == null && !p.team_assignment));
  const onTeams = participants.filter((p) => !unassigned.includes(p));

  const byOrder = new Map<number, P[]>();
  for (const p of onTeams) {
    // Participants from clients that only know `team_assignment` map blue/red to orders 0/1.
    const order = p.team_order ?? (p.team_assignment === 'blue' ? 0 : p.team_assignment === 'red' ? 1 : null);
    if (order == null) continue;
    byOrder.set(order, [...(byOrder.get(order) ?? []), p]);
  }

  if (scoringType === 'Position') {
    // One person per team (or nobody on a team yet) means there are no teams worth showing.
    if ([...byOrder.values()].every((players) => players.length <= 1)) return { kind: 'flat', players: participants };
  }

  const orders = [...byOrder.keys()].sort((a, b) => a - b);
  if (scoringType !== 'Position' && orders.every((o) => o <= 1)) {
    const blue = byOrder.get(0) ?? [];
    const red = byOrder.get(1) ?? [];
    return {
      kind: 'sides',
      blue: { key: 'blue', title: sideTitle(blue, 'Blue Team', 'Blue'), color: 'blue', logoUrl: teamLogo(blue), players: blue },
      red: { key: 'red', title: sideTitle(red, 'Red Team', 'Red'), color: 'red', logoUrl: teamLogo(red), players: red },
      unassigned,
    };
  }

  return {
    kind: 'teams',
    teams: orders.map((order) => {
      const players = byOrder.get(order) ?? [];
      return {
        key: `team-${order}`,
        title: players.find((p) => p.team_name)?.team_name ?? `Team ${order + 1}`,
        color: TEAM_COLORS[order % TEAM_COLORS.length],
        logoUrl: teamLogo(players),
        players,
      };
    }),
    unassigned,
  };
}
