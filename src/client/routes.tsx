import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';
import RootLayout from './root-layout';

// Every page is code-split with React.lazy (Recharts and the bracket views are the heavy ones); RootLayout wraps the outlet in <Suspense>.

const PageHome = lazy(() => import('./pages/home'));
const PageChannels = lazy(() => import('./pages/channels/page'));
const PageChannelsCreate = lazy(() => import('./pages/channels/create/page'));
const PageDev = lazy(() => import('./pages/dev/page'));
const PageFeed = lazy(() => import('./pages/feed/page'));
const PageGames = lazy(() => import('./pages/games/page'));
const PageInfo = lazy(() => import('./pages/info/page'));
const PageLogin = lazy(() => import('./pages/login/page'));
const PageMatches = lazy(() => import('./pages/matches/page'));
const PageMatchesCreate = lazy(() => import('./pages/matches/create/page'));
const PageMatchesHistory = lazy(() => import('./pages/matches/history/page'));
const PageMatchesHistoryMatchid = lazy(() => import('./pages/matches/history/[matchId]/page'));
const PageMatchesMatchid = lazy(() => import('./pages/matches/[matchId]/page'));
const PageMatchesMatchidAssign = lazy(() => import('./pages/matches/[matchId]/assign/page'));
const PageMatchesMatchidEdit = lazy(() => import('./pages/matches/[matchId]/edit/page'));
const PageMatchesMatchidScoring = lazy(() => import('./pages/matches/[matchId]/scoring/page'));
const PageMatchesMatchidStats = lazy(() => import('./pages/matches/[matchId]/stats/page'));
const PageMatchesMatchidStatsGameid = lazy(() => import('./pages/matches/[matchId]/stats/[gameId]/page'));
const PageSeries = lazy(() => import('./pages/series/page'));
const PageSeriesCreate = lazy(() => import('./pages/series/create/page'));
const PageSeriesHistory = lazy(() => import('./pages/series/history/page'));
const PageSeriesSeriesid = lazy(() => import('./pages/series/[seriesId]/page'));
const PageSeriesSeriesidEdit = lazy(() => import('./pages/series/[seriesId]/edit/page'));
const PageSettings = lazy(() => import('./pages/settings/page'));
const PageSettingsAnnouncer = lazy(() => import('./pages/settings/announcer/page'));
const PageSettingsApplication = lazy(() => import('./pages/settings/application/page'));
const PageSettingsBackupRestore = lazy(() => import('./pages/settings/backup-restore/page'));
const PageSettingsDiscord = lazy(() => import('./pages/settings/discord/page'));
const PageSettingsScheduler = lazy(() => import('./pages/settings/scheduler/page'));
const PageSettingsStats = lazy(() => import('./pages/settings/stats/page'));
const PageSettingsUi = lazy(() => import('./pages/settings/ui/page'));
const PageTournaments = lazy(() => import('./pages/tournaments/page'));
const PageTournamentsCreate = lazy(() => import('./pages/tournaments/create/page'));
const PageTournamentsHistory = lazy(() => import('./pages/tournaments/history/page'));
const PageTournamentsTournamentid = lazy(() => import('./pages/tournaments/[tournamentId]/page'));
const PageTournamentsTournamentidAssign = lazy(() => import('./pages/tournaments/[tournamentId]/assign/page'));
const PageTournamentsTournamentidEdit = lazy(() => import('./pages/tournaments/[tournamentId]/edit/page'));
const WelcomeLayout = lazy(() => import('./pages/welcome/layout'));
const WelcomePage = lazy(() => import('./pages/welcome/page'));
const WelcomeDiscordSetupPage = lazy(() => import('./pages/welcome/discord-setup/page'));
const WelcomeChannelsSetupPage = lazy(() => import('./pages/welcome/channels-setup/page'));
const NotFound = lazy(() => import('./pages/not-found'));

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <PageHome /> },
      { path: 'channels', element: <PageChannels /> },
      { path: 'channels/create', element: <PageChannelsCreate /> },
      { path: 'dev', element: <PageDev /> },
      { path: 'feed', element: <PageFeed /> },
      { path: 'games', element: <PageGames /> },
      { path: 'info', element: <PageInfo /> },
      { path: 'login', element: <PageLogin /> },
      { path: 'matches', element: <PageMatches /> },
      { path: 'matches/create', element: <PageMatchesCreate /> },
      { path: 'matches/history', element: <PageMatchesHistory /> },
      { path: 'matches/history/:matchId', element: <PageMatchesHistoryMatchid /> },
      { path: 'matches/:matchId', element: <PageMatchesMatchid /> },
      { path: 'matches/:matchId/assign', element: <PageMatchesMatchidAssign /> },
      { path: 'matches/:matchId/edit', element: <PageMatchesMatchidEdit /> },
      { path: 'matches/:matchId/scoring', element: <PageMatchesMatchidScoring /> },
      { path: 'matches/:matchId/stats', element: <PageMatchesMatchidStats /> },
      { path: 'matches/:matchId/stats/:gameId', element: <PageMatchesMatchidStatsGameid /> },
      { path: 'series', element: <PageSeries /> },
      { path: 'series/create', element: <PageSeriesCreate /> },
      { path: 'series/history', element: <PageSeriesHistory /> },
      { path: 'series/:seriesId', element: <PageSeriesSeriesid /> },
      { path: 'series/:seriesId/edit', element: <PageSeriesSeriesidEdit /> },
      { path: 'settings', element: <PageSettings /> },
      { path: 'settings/announcer', element: <PageSettingsAnnouncer /> },
      { path: 'settings/application', element: <PageSettingsApplication /> },
      { path: 'settings/backup-restore', element: <PageSettingsBackupRestore /> },
      { path: 'settings/discord', element: <PageSettingsDiscord /> },
      { path: 'settings/scheduler', element: <PageSettingsScheduler /> },
      { path: 'settings/stats', element: <PageSettingsStats /> },
      { path: 'settings/ui', element: <PageSettingsUi /> },
      { path: 'tournaments', element: <PageTournaments /> },
      { path: 'tournaments/create', element: <PageTournamentsCreate /> },
      { path: 'tournaments/history', element: <PageTournamentsHistory /> },
      { path: 'tournaments/:tournamentId', element: <PageTournamentsTournamentid /> },
      { path: 'tournaments/:tournamentId/assign', element: <PageTournamentsTournamentidAssign /> },
      { path: 'tournaments/:tournamentId/edit', element: <PageTournamentsTournamentidEdit /> },
      {
        path: 'welcome',
        element: <WelcomeLayout />,
        children: [
          { index: true, element: <WelcomePage /> },
          { path: 'discord-setup', element: <WelcomeDiscordSetupPage /> },
          { path: 'channels-setup', element: <WelcomeChannelsSetupPage /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
