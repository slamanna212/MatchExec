import { Hono } from 'hono';
import { apiNotFound, noStore, onError } from './http';
import { authGate } from './middleware/auth';
import { degradedGate } from './middleware/degraded';
import { maintenanceGate } from './middleware/maintenance';
import { welcomeFlow } from './middleware/welcome';
import { redirectDevPages, serveClientFiles, spaFallback } from './static';
import { auth } from './routes/auth';
import { channels } from './routes/channels';
import { debug } from './routes/debug';
import { feed } from './routes/feed';
import { games } from './routes/games';
import { health } from './routes/health';
import { matches } from './routes/matches';
import { matchStats, scorecards } from './routes/scorecards';
import { seriesRoutes } from './routes/series';
import { settings } from './routes/settings';
import { stats } from './routes/stats';
import { tournaments } from './routes/tournaments';
import { dbStatus, metrics, version } from './routes/system';
import { uploadApi, uploads } from './routes/uploads';
import { welcomeFlow as welcomeFlowRoutes } from './routes/welcome-flow';

export const app = new Hono();

app.onError(onError);
app.notFound(apiNotFound);

app.use('/api/*', noStore);

// Degraded mode (failed migration in the all-in-one container): only the SPA, health and db-status are served.
app.use('*', degradedGate);

// Backup restore (plan 6.4): in-flight request counter + 503 for writes while a restore drains / swaps the data.
app.use('*', maintenanceGate);

// Uploaded files (event images, scorecard screenshots, stat images) are served before the auth gate: the old Next matcher
// excluded image extensions from it, and Discord embeds link straight to these URLs.
app.route('/uploads', uploads);

app.use('*', redirectDevPages);
app.use('*', authGate);
app.use('*', welcomeFlow);

// Domain routers are mounted here as Stage 2 ports them.
app.route('/api/health', health);
app.route('/api/db-status', dbStatus);
app.route('/api/metrics', metrics);
app.route('/api/version', version);
app.route('/api/settings', settings);
app.route('/api/welcome-flow', welcomeFlowRoutes);
app.route('/api/auth', auth);
app.route('/api/games', games);
app.route('/api/channels', channels);
app.route('/api/matches', matches);
app.route('/api/matches/:matchId/scorecard', scorecards);
app.route('/api/matches/:matchId/stats', matchStats);
app.route('/api/tournaments', tournaments);
app.route('/api/series', seriesRoutes);
app.route('/api/stats', stats);
app.route('/api/feed', feed);
app.route('/api/upload', uploadApi);
app.route('/api/debug', debug);

// Static SPA (dist/client) and the index.html fallback for client-side routes. Mounted last so API routers win.
app.use('*', serveClientFiles);
app.get('*', spaFallback);

export type AppType = typeof app;
